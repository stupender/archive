/**
 * The data shapes that flow across the IPC bridge — declared once here so
 * BOTH the main process and the renderer agree on what a Track looks like.
 *
 * Where it runs: type-only file (no runtime code). Imported by both
 *   `electron/` and `src/` via the `@shared/types` alias defined in
 *   `tsconfig.json` and `vite.config.ts`.
 * Depends on: nothing.
 * Used by:    db.ts, library.ts, store/library.ts, every UI component
 *   that touches a Track or runs a filter.
 *
 * Notes:
 *  - `FilterOptions` is the query language used by `db.listTracks`. The
 *    same shape is stored as JSON in the smart-playlist `auto_query`
 *    column — `SmartQuery` is just an alias for FilterOptions.
 *  - Track.title is the *resolved* title (user override if present,
 *    otherwise the value from the file's metadata) — see the
 *    user-override pattern entry in LEARNED.md.
 */
export interface Library {
  id: number;
  name: string;
  path: string;
  createdAt: number;
}

export interface Track {
  id: number;
  libraryId: number | null;
  path: string;
  title: string;
  artist: string | null;
  album: string | null;
  genre: string | null;
  duration: number | null;
  bpm: number | null;
  musicalKey: string | null;
  year: number | null;
  trackNumber: number | null;
  bitrate: number | null;
  sampleRate: number | null;
  format: string | null;
  size: number | null;
  mtime: number;
  addedAt: number;
  rating: number;
  notes: string;
  userTags: string[];
  finderTags: string[];
  pathTags: string[];
  artworkPath: string | null;
  loudnessGain: number | null;
  decodeFailed: number; // 0 or 1
}

export interface Playlist {
  id: number;
  name: string;
  description: string;
  createdAt: number;
  isAuto: boolean;
  autoQuery: string | null;
  trackIds: number[];
}

export interface PlayHistoryEntry {
  id: number;
  trackId: number;
  startedAt: number;
  startPosition: number;
  duration: number;
  mode: 'whole' | 'slice' | 'multitrack';
  sliceLength: number | null;
}

export interface ScanResult {
  added: number;
  updated: number;
  removed: number;
  errors: { path: string; message: string }[];
}

export type SliceLength = 1 | 2 | 3 | 5 | 10 | 20 | 30 | 60;
export type RandomMode = 'whole' | SliceLength;

export interface SortOption {
  field: 'title' | 'artist' | 'album' | 'addedAt' | 'rating' | 'duration' | 'bpm';
  direction: 'asc' | 'desc';
}

export interface FilterOptions {
  search?: string;
  /** Minimum rating, inclusive (>=). */
  rating?: number;
  genre?: string;
  /** Multi-tag filters (AND-combined). Tracks must have ALL of these. */
  userTagsAll?: string[];
  finderTagsAll?: string[];
  pathTagsAll?: string[];
  playlistId?: number;
  libraryIds?: number[];
  /** File-extension filter (lowercased, no dot): ['wav', 'mp3', ...]. */
  formats?: string[];
  /** True → only tracks with non-empty notes. */
  hasNotes?: boolean;
}

/** JSON shape stored in playlists.auto_query for Smart Playlists. */
export interface SmartQuery extends FilterOptions {}
