/**
 * Entry point of the Electron MAIN process — the Node.js side of the app.
 *
 * Where it runs: main process (Node.js, has full OS access).
 * Depends on: electron APIs, our DB layer (`./db.js`), library scanner
 *   (`./library.js`), file watcher (`./watcher.js`), shared types.
 * Used by:    nothing imports this file — it IS the entry point that
 *   electron-builder packages and macOS launches.
 *
 * Notes:
 *  - Every `ipcMain.handle('namespace:action', ...)` below is a function the
 *    renderer can call through `window.sonic.<thing>` (see preload.ts).
 *  - Registers a custom `media://` protocol so the renderer can fetch local
 *    audio files (Chromium would otherwise block file:// reads).
 *  - Calls `app.setName('sonic-archive')` BEFORE anything reads the userData
 *    path, so renaming the user-facing product to "Archive" doesn't move
 *    where the DB lives.
 *  - Creates exactly one BrowserWindow on launch and on macOS "activate."
 */
import { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as db from './db.js';
import { scanAllLibraries } from './library.js';
import { startWatcher, stopWatcher } from './watcher.js';
import type { FilterOptions, SortOption } from '../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Lock the internal app name BEFORE anything reads the userData path. Electron
// derives the userData folder from `app.getName()`, which defaults to the
// `name` field in package.json. We want the user-visible product to be called
// "Archive" (set via `productName`), but the on-disk data folder must keep
// being "sonic-archive" so existing libraries, ratings, tags, scenes, and
// history survive the rename. This one line decouples the two.
app.setName('sonic-archive');

let mainWindow: BrowserWindow | null = null;
let artworkDir = '';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
]);

function notifyLibraryChange() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('library:changed');
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 18 },
    backgroundColor: '#1c1c1e',
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  protocol.handle('media', async (request) => {
    let filePath = '';
    try {
      const u = new URL(request.url);
      const rel = u.pathname.replace(/^\/+/, '');
      filePath = '/' + decodeURIComponent(rel);
    } catch (err) {
      console.error('[media://] bad URL', request.url, err);
      return new Response('', { status: 400 });
    }

    // Probe the file with a node fs call first so we can distinguish a real
    // "file gone" from a "macOS TCC denied access" — net.fetch() lumps both
    // into a generic failure. If we get EACCES/EPERM, the renderer needs to
    // show the Permissions banner rather than a vague toast.
    try {
      fs.accessSync(filePath, fs.constants.R_OK);
    } catch (err: any) {
      const code = err?.code;
      if (code === 'EACCES' || code === 'EPERM') {
        console.error('[media://] permission denied for', filePath);
        return new Response(
          JSON.stringify({ kind: 'permission-denied', path: filePath }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        );
      }
      console.error('[media://] file not accessible:', filePath, code);
      return new Response('', { status: 404 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });

  const userData = app.getPath('userData');
  artworkDir = path.join(userData, 'artwork');
  fs.mkdirSync(artworkDir, { recursive: true });
  db.initDB(userData);

  // === Libraries ============================================================
  ipcMain.handle('libraries:list', () => db.listLibraries());
  ipcMain.handle('libraries:add', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose a folder to add as a library',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const folder = result.filePaths[0];
    const name = await defaultLibraryName(folder);
    try {
      const lib = db.createLibrary(name, folder);
      startWatcher(artworkDir, notifyLibraryChange);
      notifyLibraryChange();
      return lib;
    } catch (err: any) {
      // Likely duplicate path — surface it back
      throw new Error(err?.message || 'Failed to add library');
    }
  });
  ipcMain.handle('libraries:rename', (_e, id: number, name: string) => {
    db.renameLibrary(id, name);
    notifyLibraryChange();
  });
  ipcMain.handle('libraries:delete', (_e, id: number) => {
    db.deleteLibrary(id);
    startWatcher(artworkDir, notifyLibraryChange);
    notifyLibraryChange();
  });
  ipcMain.handle('libraries:reorder', (_e, ids: number[]) => {
    db.reorderLibraries(ids);
    notifyLibraryChange();
  });

  // === Multi-track scenes ==================================================
  ipcMain.handle('scenes:list', () => db.listScenes());
  ipcMain.handle('scenes:save', (_e, name: string, data: string) => db.saveScene(name, data));
  ipcMain.handle('scenes:delete', (_e, id: number) => db.deleteScene(id));

  ipcMain.handle('library:scan', async () => {
    const onProgress = (done: number, total: number, current: string) => {
      mainWindow?.webContents.send('library:scanProgress', { done, total, current });
    };
    const result = await scanAllLibraries(artworkDir, onProgress);
    db.setSetting('lastScanAt', String(Date.now()));
    notifyLibraryChange();
    return result;
  });

  // === Tracks ==============================================================
  ipcMain.handle('tracks:list', (_e, filter: FilterOptions, sort: SortOption) => db.listTracks(filter, sort));
  ipcMain.handle('tracks:get', (_e, id: number) => db.getTrack(id));
  ipcMain.handle('tracks:random', (_e, n: number, filter: FilterOptions) =>
    n === 1 ? db.getRandomTrack(filter) : db.getRandomTracks(n, filter),
  );
  ipcMain.handle('tracks:updateMeta', (_e, id: number, patch: any) => {
    db.updateTrackUserMeta(id, patch);
    notifyLibraryChange();
  });
  ipcMain.handle('tracks:setLoudnessGain', (_e, id: number, gain: number) => {
    db.setTrackLoudnessGain(id, gain);
  });
  ipcMain.handle('tracks:markDecodeFailed', (_e, id: number) => {
    db.markTrackDecodeFailed(id);
    notifyLibraryChange();
  });
  ipcMain.handle('tracks:revealInFinder', (_e, p: string) => {
    shell.showItemInFolder(p);
  });

  // === Faceted lookups =====================================================
  ipcMain.handle('library:genres', () => db.listGenres());
  ipcMain.handle('library:userTags', () => db.listUserTags());
  ipcMain.handle('library:finderTags', () => db.listFinderTags());
  ipcMain.handle('library:pathTags', () => db.listPathTags());

  // === Playlists ===========================================================
  ipcMain.handle('playlists:list', () => db.listPlaylists());
  ipcMain.handle('playlists:create', (_e, name: string) => {
    const p = db.createPlaylist(name);
    notifyLibraryChange();
    return p;
  });
  ipcMain.handle('playlists:createSmart', (_e, name: string, queryJson: string) => {
    const p = db.createSmartPlaylist(name, queryJson);
    notifyLibraryChange();
    return p;
  });
  ipcMain.handle('playlists:updateSmart', (_e, id: number, name: string, queryJson: string) => {
    db.updateSmartPlaylist(id, name, queryJson);
    notifyLibraryChange();
  });
  ipcMain.handle('playlists:delete', (_e, id: number) => {
    db.deletePlaylist(id);
    notifyLibraryChange();
  });
  ipcMain.handle('playlists:rename', (_e, id: number, name: string) => {
    db.renamePlaylist(id, name);
    notifyLibraryChange();
  });
  ipcMain.handle('playlists:addTrack', (_e, playlistId: number, trackId: number) => {
    db.addToPlaylist(playlistId, trackId);
    notifyLibraryChange();
  });
  ipcMain.handle('playlists:removeTrack', (_e, playlistId: number, trackId: number) => {
    db.removeFromPlaylist(playlistId, trackId);
    notifyLibraryChange();
  });

  // === History ============================================================
  ipcMain.handle('history:log', (_e, entry: any) => db.logPlay(entry));
  ipcMain.handle('history:recent', (_e, limit: number) => db.getRecentHistory(limit));

  ipcMain.handle('settings:get', (_e, k: string) => db.getSetting(k));
  ipcMain.handle('settings:set', (_e, k: string, v: string) => db.setSetting(k, v));

  // === System integration ==================================================
  // Deeplink to System Settings → Privacy & Security → Full Disk Access so
  // the user can grant Archive permission to read external/protected drives
  // in one click instead of hunting through Settings.
  ipcMain.handle('system:openPrivacySettings', () => {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles');
  });

  await createWindow();
  startWatcher(artworkDir, notifyLibraryChange);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

async function defaultLibraryName(folder: string): Promise<string> {
  return path.basename(folder) || folder;
}

app.on('window-all-closed', () => {
  stopWatcher();
  if (process.platform !== 'darwin') app.quit();
});
