import { contextBridge, ipcRenderer } from 'electron';
import type { FilterOptions, SortOption, Track, Library } from '../shared/types.js';

const api = {
  // Libraries
  listLibraries: () => ipcRenderer.invoke('libraries:list') as Promise<Library[]>,
  addLibrary: () => ipcRenderer.invoke('libraries:add') as Promise<Library | null>,
  renameLibrary: (id: number, name: string) => ipcRenderer.invoke('libraries:rename', id, name) as Promise<void>,
  deleteLibrary: (id: number) => ipcRenderer.invoke('libraries:delete', id) as Promise<void>,
  reorderLibraries: (ids: number[]) => ipcRenderer.invoke('libraries:reorder', ids) as Promise<void>,
  scan: () => ipcRenderer.invoke('library:scan') as Promise<{ added: number; updated: number; removed: number; errors: any[] }>,

  // Soundscape bridge — write a rendered loop (WAV bytes) + JSON sidecar to the
  // shared iCloud "Soundscape Loops" folder.
  exportLoopToSoundscape: (args: { baseName: string; wav: ArrayBuffer; sidecar: string }) =>
    ipcRenderer.invoke('bridge:exportLoop', args) as Promise<{ folder: string; filename: string }>,

  listScenes: () => ipcRenderer.invoke('scenes:list') as Promise<{ id: number; name: string; createdAt: number; data: string }[]>,
  saveScene: (name: string, data: string) => ipcRenderer.invoke('scenes:save', name, data) as Promise<{ id: number; name: string; createdAt: number; data: string }>,
  deleteScene: (id: number) => ipcRenderer.invoke('scenes:delete', id) as Promise<void>,

  // Tracks
  listTracks: (filter: FilterOptions = {}, sort: SortOption = { field: 'addedAt', direction: 'desc' }) =>
    ipcRenderer.invoke('tracks:list', filter, sort) as Promise<Track[]>,
  getTrack: (id: number) => ipcRenderer.invoke('tracks:get', id) as Promise<Track | null>,
  randomTracks: (n: number, filter: FilterOptions = {}) =>
    ipcRenderer.invoke('tracks:random', n, filter) as Promise<Track | Track[] | null>,
  updateTrackMeta: (id: number, patch: Partial<Track>) =>
    ipcRenderer.invoke('tracks:updateMeta', id, patch) as Promise<void>,
  setLoudnessGain: (id: number, gain: number) => ipcRenderer.invoke('tracks:setLoudnessGain', id, gain) as Promise<void>,
  markDecodeFailed: (id: number) => ipcRenderer.invoke('tracks:markDecodeFailed', id) as Promise<void>,
  revealInFinder: (path: string) => ipcRenderer.invoke('tracks:revealInFinder', path) as Promise<void>,

  // Faceted lookups
  listGenres: () => ipcRenderer.invoke('library:genres') as Promise<string[]>,
  listUserTags: () => ipcRenderer.invoke('library:userTags') as Promise<string[]>,
  listFinderTags: () => ipcRenderer.invoke('library:finderTags') as Promise<string[]>,
  listPathTags: () => ipcRenderer.invoke('library:pathTags') as Promise<string[]>,

  // Playlists
  listPlaylists: () => ipcRenderer.invoke('playlists:list'),
  createPlaylist: (name: string) => ipcRenderer.invoke('playlists:create', name),
  createSmartPlaylist: (name: string, queryJson: string) => ipcRenderer.invoke('playlists:createSmart', name, queryJson),
  updateSmartPlaylist: (id: number, name: string, queryJson: string) => ipcRenderer.invoke('playlists:updateSmart', id, name, queryJson),
  deletePlaylist: (id: number) => ipcRenderer.invoke('playlists:delete', id),
  renamePlaylist: (id: number, name: string) => ipcRenderer.invoke('playlists:rename', id, name),
  addToPlaylist: (playlistId: number, trackId: number) => ipcRenderer.invoke('playlists:addTrack', playlistId, trackId),
  removeFromPlaylist: (playlistId: number, trackId: number) => ipcRenderer.invoke('playlists:removeTrack', playlistId, trackId),

  // History
  logPlay: (entry: any) => ipcRenderer.invoke('history:log', entry),
  getRecentHistory: (limit = 100) => ipcRenderer.invoke('history:recent', limit),

  // Settings
  getSetting: (k: string) => ipcRenderer.invoke('settings:get', k) as Promise<string | null>,
  setSetting: (k: string, v: string) => ipcRenderer.invoke('settings:set', k, v) as Promise<void>,

  // Events
  onLibraryChanged: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('library:changed', handler);
    return () => ipcRenderer.off('library:changed', handler);
  },
  onScanProgress: (cb: (p: { done: number; total: number; current: string }) => void) => {
    const handler = (_e: any, p: any) => cb(p);
    ipcRenderer.on('library:scanProgress', handler);
    return () => ipcRenderer.off('library:scanProgress', handler);
  },

  // Helper to convert a file path to a media:// URL the renderer can play.
  toMediaUrl: (filePath: string) => {
    const segs = filePath.split('/').map(encodeURIComponent);
    return 'media://archive' + segs.join('/');
  },
};

contextBridge.exposeInMainWorld('sonic', api);

export type SonicAPI = typeof api;
