/**
 * Live folder watcher — re-ingest audio files when they're added, modified,
 * or deleted under any library root.
 *
 * Where it runs: main process (Node.js).
 * Depends on: chokidar (cross-platform fs watcher), ./db.js,
 *   ./library.js (uses `ingestSingleFile` for new/changed files).
 * Used by:    main.ts calls `startWatcher` after each library add/remove
 *   and on app launch. Notifies the renderer with `library:changed`
 *   whenever something happens so the UI can refresh.
 *
 * Notes:
 *  - One watcher instance covers all library roots at once (chokidar
 *    can watch many paths). `stopWatcher` tears it down before starting
 *    a new one — call `startWatcher` again to refresh the set of
 *    watched paths after the user adds/removes a library.
 *  - `awaitWriteFinish` (1.5s stability check) prevents us from
 *    ingesting half-written files when an app is still saving them.
 *  - Same DAW-folder skip as the scanner — see library.ts.
 */
import chokidar, { type FSWatcher } from 'chokidar';
import path from 'node:path';
import * as db from './db.js';
import { ingestSingleFile } from './library.js';

const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.aac', '.aif', '.aiff', '.wav', '.flac', '.ogg', '.opus', '.wma', '.alac']);

function isInsideDawProjectFolder(p: string): boolean {
  return p.split(path.sep).some(
    (seg) =>
      /\bProject$/i.test(seg) ||
      seg.endsWith('.logicx') ||
      seg.endsWith('.band') ||
      seg.endsWith('.ptx'),
  );
}

let watcher: FSWatcher | null = null;

export function startWatcher(
  artworkDir: string,
  onChange: () => void,
) {
  stopWatcher();
  const libraries = db.listLibraries();
  if (libraries.length === 0) return;
  const paths = libraries.map((l) => l.path);

  watcher = chokidar.watch(paths, {
    ignored: /(^|[\/\\])\../,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 },
    depth: 99,
  });

  const isAudio = (p: string) =>
    AUDIO_EXTS.has(path.extname(p).toLowerCase()) && !isInsideDawProjectFolder(p);

  const findLibrary = (p: string) =>
    libraries.find((l) => p.startsWith(l.path + path.sep));

  watcher.on('add', async (p: string) => {
    if (!isAudio(p)) return;
    const lib = findLibrary(p);
    if (!lib) return;
    try {
      await ingestSingleFile(p, lib, artworkDir);
      onChange();
    } catch {}
  });
  watcher.on('change', async (p: string) => {
    if (!isAudio(p)) return;
    const lib = findLibrary(p);
    if (!lib) return;
    try {
      await ingestSingleFile(p, lib, artworkDir);
      onChange();
    } catch {}
  });
  watcher.on('unlink', (p: string) => {
    if (!isAudio(p)) return;
    db.removeTrackByPath(p);
    onChange();
  });
}

export function stopWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}
