/**
 * The Zustand store — composed from seven focused slices.
 *
 * Where it runs: renderer.
 * Depends on: zustand, the IPC bridge (`window.sonic`), the audio engine
 *   (`../audio/AudioEngine`), shared types, and the slice files under
 *   `./slices/`.
 * Used by:    every React component reads from this with selectors like
 *   `useLibrary((s) => s.tracks)`.
 *
 * Structure:
 *  - This file defines the full `State` interface (the "table of
 *    contents" of the store) and the composer that wires the slices
 *    together. NO action implementations live here.
 *  - Each slice file under `./slices/` owns a portion of `State` —
 *    both the data fields AND the action implementations that touch
 *    them — and exports a `create<Name>Slice(set, get)` function that
 *    returns its piece.
 *  - Cross-slice calls happen through `get()` because every slice sees
 *    the same `State` type. e.g. `sendCurrentToMultiTrack` lives in
 *    `playbackSlice` but calls `get().addToCollage(…)` from
 *    `collageSlice`.
 *  - Toast is the one tiny thing that doesn't justify a slice file —
 *    it's inlined in the composer below (one field, one action).
 *  - The store is the *only* place that calls `window.sonic.*` and the
 *    *only* place that talks to the audio engine. Components are pure
 *    presentation — they read state and call actions.
 *  - `init()` is called once on app launch from `App.tsx`. It loads
 *    initial libraries + active selection from the DB and registers
 *    listeners for `library:changed` events. Lives in `librariesSlice`.
 */

import { create } from 'zustand';
import type { Track, Playlist, FilterOptions, SortOption, SliceLength, Library } from '@shared/types';
import { createLibrariesSlice } from './slices/librariesSlice';
import { createViewSlice } from './slices/viewSlice';
import { createPlaybackSlice } from './slices/playbackSlice';
import { createCollageSlice } from './slices/collageSlice';
import { createRandomSlice } from './slices/randomSlice';
import { createMetadataSlice } from './slices/metadataSlice';
import { createTagsSlice } from './slices/tagsSlice';

declare global {
  interface Window {
    sonic: any;
  }
}

export interface CollageTrackState {
  track: Track;
  volume: number;
  playbackRate: number;
  reversed: boolean;
  loopRegion: { start: number; end: number } | null;
  loopActive: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  canReverse: boolean;
  canABLoop: boolean;
}

export interface SceneRow {
  id: number;
  name: string;
  createdAt: number;
  data: string;
}

export interface SceneData {
  tracks: Array<{
    trackId: number;
    volume: number;
    playbackRate: number;
    reversed: boolean;
    loopRegion: { start: number; end: number } | null;
    loopActive: boolean;
    startPosition: number;
  }>;
}

export type View =
  | { kind: 'songs' }
  | { kind: 'playlist'; id: number; name: string }
  | { kind: 'history' }
  | { kind: 'random-review' }
  | { kind: 'multi-track' };

export interface State {
  // Library data (librariesSlice)
  libraries: Library[];
  /**
   * Empty array = "All Libraries". Otherwise filter to these. Used by the
   * track list, search, Random Review, etc.
   */
  activeLibraryIds: number[];

  // Scan progress (librariesSlice)
  scanning: boolean;
  scanProgress: { done: number; total: number; current: string } | null;

  // View / filtering / sorting (viewSlice)
  tracks: Track[];
  playlists: Playlist[];
  userTags: string[];
  finderTags: string[];
  genres: string[];
  view: View;
  search: string;
  sort: SortOption;
  /** Tracks currently selected in the songs list. Multi-select via ⌘-click
   *  or shift-click. `selectedTrackId` is exposed as a derived single-id
   *  view for callers that only care about "the one selected track". */
  selectedTrackIds: number[];
  selectedTrackId: number | null;
  scrollToTrackId: number | null;
  /** Tag filters AND-combined with the current view. Click tags in the
   *  sidebar to toggle inclusion. */
  filterUserTags: string[];
  filterFinderTags: string[];

  // Playback — primary (playbackSlice)
  currentTrack: Track | null;
  currentTime: number;
  isPlaying: boolean;
  duration: number;
  playbackRate: number;
  reversed: boolean;
  loopRegion: { start: number; end: number } | null;
  loopActive: boolean; // user-toggle: when true, region defines loop; when false, loop is off
  shuffle: boolean;
  volume: number;
  queue: Track[];
  queueIndex: number;
  /** Whether the current backend supports reverse and A-B looping (false for media-element fallback). */
  primaryCanReverse: boolean;
  primaryCanABLoop: boolean;

  // Multi-track collage (collageSlice) — each track has its own full-featured player state.
  collageTracks: CollageTrackState[];
  collagePlaying: boolean;
  scenes: SceneRow[];

  // Random review (randomSlice)
  randomMode: 'whole' | SliceLength;

  // Quick-tag overlay (tagsSlice) — target track IDs when open, empty when closed.
  quickTagTrackIds: number[];

  // Toast (inlined below)
  toast: { kind: 'error' | 'info'; message: string } | null;

  /** Permissions banner — shown when macOS TCC blocks file access (typically
   *  for external drives on unsigned builds). `path` is the file we failed to
   *  read, used in the banner copy so the user knows what's affected. */
  permissionsBanner: { open: boolean; path: string | null };

  // ---- Actions ----

  // Toast
  setToast: (t: State['toast']) => void;

  // Permissions banner
  openPermissionsBanner: (path: string | null) => void;
  closePermissionsBanner: () => void;
  /** Calls into `window.sonic.openPrivacySettings` — deeplinks to System
   *  Settings → Privacy & Security → Full Disk Access. */
  openSystemPrivacySettings: () => Promise<void>;

  // Libraries (librariesSlice)
  init: () => Promise<void>;
  addLibrary: () => Promise<void>;
  renameLibrary: (id: number, name: string) => Promise<void>;
  deleteLibrary: (id: number) => Promise<void>;
  reorderLibraries: (orderedIds: number[]) => Promise<void>;
  /** Replace the selection with these IDs. Empty array = All Libraries. */
  setActiveLibraryIds: (ids: number[]) => Promise<void>;
  /** exclusive=true: replace selection with [id]. exclusive=false: toggle id in/out. */
  toggleLibrary: (id: number, exclusive: boolean) => Promise<void>;
  scan: () => Promise<void>;

  // View (viewSlice)
  refreshAll: () => Promise<void>;
  setView: (v: View) => Promise<void>;
  setSearch: (q: string) => void;
  setSort: (s: SortOption) => Promise<void>;
  selectTrack: (id: number | null) => void;
  /** Multi-select: ⌘-click toggles, shift-click extends range, plain click replaces. */
  selectTracks: (ids: number[]) => void;
  toggleTrackInSelection: (id: number) => void;
  scrollToTrack: (id: number | null) => void;
  jumpToTrackInLibrary: (track: Track) => Promise<void>;
  toggleUserTagFilter: (tag: string) => Promise<void>;
  toggleFinderTagFilter: (tag: string) => Promise<void>;
  clearTagFilters: () => Promise<void>;

  // Playback (playbackSlice)
  playTrack: (t: Track, queue?: Track[]) => Promise<void>;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (t: number) => void;
  setPlaybackRate: (r: number) => void;
  setReversed: (b: boolean) => void;
  setLoopRegion: (r: { start: number; end: number } | null) => void;
  setLoopActive: (b: boolean) => void;
  setLoopStart: () => void;
  setLoopEnd: () => void;
  setShuffle: (b: boolean) => void;
  setVolume: (v: number) => void;
  stopPlayback: () => void;
  /** Take whatever's playing in the main player — track, loop region, speed,
   *  reverse — and add it as a new layer in the Multi-Track collage, then
   *  switch to that view. "I found a nice loop while reviewing, let me start
   *  layering with it." */
  sendCurrentToMultiTrack: () => Promise<void>;

  // Metadata writes (metadataSlice)
  updateTrackMeta: (id: number, patch: Partial<Track>) => Promise<void>;
  setRating: (trackId: number, rating: number) => Promise<void>;
  createPlaylist: (name: string) => Promise<void>;
  createSmartPlaylist: (name: string, query: FilterOptions) => Promise<void>;
  updateSmartPlaylist: (id: number, name: string, query: FilterOptions) => Promise<void>;
  addToPlaylist: (playlistId: number, trackId: number) => Promise<void>;
  removeFromPlaylist: (playlistId: number, trackId: number) => Promise<void>;
  deletePlaylist: (id: number) => Promise<void>;
  revealInFinder: (path: string) => Promise<void>;

  // Multi-track collage (collageSlice)
  addToCollage: (t: Track) => Promise<void>;
  removeFromCollage: (idx: number) => void;
  setCollageVolume: (idx: number, v: number) => void;
  setCollagePlaybackRate: (idx: number, r: number) => void;
  setCollageReversed: (idx: number, b: boolean) => void;
  setCollageLoopRegion: (idx: number, r: { start: number; end: number } | null) => void;
  setCollageLoopActive: (idx: number, b: boolean) => void;
  setCollageLoopStart: (idx: number) => void;
  setCollageLoopEnd: (idx: number) => void;
  toggleCollagePlay: (idx: number) => void;
  seekCollage: (idx: number, t: number) => void;
  playCollage: () => Promise<void>;
  stopCollage: () => void;
  randomCollage: (n: number) => Promise<void>;
  refreshScenes: () => Promise<void>;
  saveScene: (name: string) => Promise<void>;
  loadScene: (sceneId: number) => Promise<void>;
  deleteScene: (sceneId: number) => Promise<void>;

  // Random review (randomSlice)
  setRandomMode: (m: 'whole' | SliceLength) => void;
  pickRandom: () => Promise<void>;
  switchToFullPlay: () => void;

  // Quick-tag overlay (tagsSlice)
  /** Add one tag to many tracks. Idempotent — skips tracks that already have it. */
  addTagToTracks: (trackIds: number[], tag: string) => Promise<void>;
  /** Remove one tag from many tracks. */
  removeTagFromTracks: (trackIds: number[], tag: string) => Promise<void>;
  openQuickTag: (trackIds: number[]) => void;
  closeQuickTag: () => void;
}

export const useLibrary = create<State>((set, get) => ({
  ...createLibrariesSlice(set, get),
  ...createViewSlice(set, get),
  ...createPlaybackSlice(set, get),
  ...createCollageSlice(set, get),
  ...createRandomSlice(set, get),
  ...createMetadataSlice(set, get),
  ...createTagsSlice(set, get),

  // Toast — too small to justify its own slice file.
  toast: null,
  setToast: (toast) => set({ toast }),

  // Permissions banner — also small, also inlined.
  permissionsBanner: { open: false, path: null },
  openPermissionsBanner: (path) => set({ permissionsBanner: { open: true, path } }),
  closePermissionsBanner: () => set({ permissionsBanner: { open: false, path: null } }),
  openSystemPrivacySettings: async () => {
    await (window as any).sonic.openPrivacySettings();
  },
}));
