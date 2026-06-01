import { create } from 'zustand';
import type { Track, Playlist, FilterOptions, SortOption, SliceLength, Library } from '@shared/types';
import { getEngine, LoadSupersededError, type ITrackPlayer } from '../audio/engine';

declare global {
  interface Window {
    sonic: any;
  }
}

const sonic = () => window.sonic;

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
  | { kind: 'userTag'; tag: string }
  | { kind: 'finderTag'; tag: string }
  | { kind: 'playlist'; id: number; name: string }
  | { kind: 'history' }
  | { kind: 'random-review' }
  | { kind: 'multi-track' };

interface State {
  // Library data
  libraries: Library[];
  /**
   * Empty array = "All Libraries". Otherwise filter to these. Used by the
   * track list, search, Random Review, etc. — Random Review no longer has
   * its own library picker.
   */
  activeLibraryIds: number[];
  tracks: Track[];
  playlists: Playlist[];
  userTags: string[];
  finderTags: string[];
  genres: string[];

  // Scan progress
  scanning: boolean;
  scanProgress: { done: number; total: number; current: string } | null;

  // Filtering / sorting / view
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

  // Playback (primary)
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

  // Multi-track collage — each track has its own full-featured player state.
  collageTracks: CollageTrackState[];
  collagePlaying: boolean;
  scenes: SceneRow[];

  // Random review
  randomMode: 'whole' | SliceLength;

  // Quick-tag overlay — target track IDs when open, empty when closed.
  quickTagTrackIds: number[];
  openQuickTag: (trackIds: number[]) => void;
  closeQuickTag: () => void;
  /** Add one tag to many tracks. Idempotent — skips tracks that already have it. */
  addTagToTracks: (trackIds: number[], tag: string) => Promise<void>;
  /** Remove one tag from many tracks. */
  removeTagFromTracks: (trackIds: number[], tag: string) => Promise<void>;

  // Toast
  toast: { kind: 'error' | 'info'; message: string } | null;
  setToast: (t: State['toast']) => void;

  // Actions
  init: () => Promise<void>;
  refreshAll: () => Promise<void>;

  // Libraries
  addLibrary: () => Promise<void>;
  renameLibrary: (id: number, name: string) => Promise<void>;
  deleteLibrary: (id: number) => Promise<void>;
  reorderLibraries: (orderedIds: number[]) => Promise<void>;
  /** Replace the selection with these IDs. Empty array = All Libraries. */
  setActiveLibraryIds: (ids: number[]) => Promise<void>;
  /** exclusive=true: replace selection with [id]. exclusive=false: toggle id in/out. */
  toggleLibrary: (id: number, exclusive: boolean) => Promise<void>;
  scan: () => Promise<void>;

  // View / search / sort
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

  // Playback
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

  // Metadata
  updateTrackMeta: (id: number, patch: Partial<Track>) => Promise<void>;
  setRating: (trackId: number, rating: number) => Promise<void>;
  createPlaylist: (name: string) => Promise<void>;
  createSmartPlaylist: (name: string, query: FilterOptions) => Promise<void>;
  updateSmartPlaylist: (id: number, name: string, query: FilterOptions) => Promise<void>;
  addToPlaylist: (playlistId: number, trackId: number) => Promise<void>;
  removeFromPlaylist: (playlistId: number, trackId: number) => Promise<void>;
  deletePlaylist: (id: number) => Promise<void>;
  revealInFinder: (path: string) => Promise<void>;

  /** Take whatever's playing in the main player — track, loop region, speed,
   *  reverse — and add it as a new layer in the Multi-Track collage, then
   *  switch to that view. Designed for "I found a nice loop while reviewing,
   *  let me start layering with it." */
  sendCurrentToMultiTrack: () => Promise<void>;

  // Multi-track collage
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

  // Random review
  setRandomMode: (m: 'whole' | SliceLength) => void;
  pickRandom: () => Promise<void>;
  switchToFullPlay: () => void;
}

function buildFilter(s: State): FilterOptions {
  const f: FilterOptions = {};
  if (s.search) f.search = s.search;
  if (s.activeLibraryIds.length > 0) f.libraryIds = s.activeLibraryIds;
  if (s.filterUserTags.length > 0) f.userTagsAll = [...s.filterUserTags];
  if (s.filterFinderTags.length > 0) f.finderTagsAll = [...s.filterFinderTags];

  switch (s.view.kind) {
    // userTag/finderTag view kinds are still handled for back-compat but the
    // primary UX is now the filter state — click a tag to AND-combine.
    case 'userTag':   f.userTag = s.view.tag; break;
    case 'finderTag': f.finderTag = s.view.tag; break;
    case 'playlist':  f.playlistId = s.view.id; break;
  }
  return f;
}

function pickRandomFilter(s: State): FilterOptions {
  const f: FilterOptions = {};
  if (s.activeLibraryIds.length > 0) f.libraryIds = s.activeLibraryIds;
  return f;
}

const NORMALIZATION_TARGET_DB = -18;

/** Patch a single collage row in-place. */
function updateCollageRow(
  set: (partial: any) => void,
  get: () => State,
  idx: number,
  patch: Partial<CollageTrackState>,
) {
  const next = [...get().collageTracks];
  if (!next[idx]) return;
  next[idx] = { ...next[idx], ...patch };
  set({ collageTracks: next });
}

export const useLibrary = create<State>((set, get) => ({
  libraries: [],
  activeLibraryIds: [],
  tracks: [],
  playlists: [],
  userTags: [],
  finderTags: [],
  genres: [],
  scanning: false,
  scanProgress: null,

  view: { kind: 'songs' },
  search: '',
  sort: { field: 'addedAt', direction: 'desc' },
  selectedTrackId: null,
  scrollToTrackId: null,
  filterUserTags: [],
  filterFinderTags: [],
  selectedTrackIds: [],

  currentTrack: null,
  currentTime: 0,
  isPlaying: false,
  duration: 0,
  playbackRate: 1,
  reversed: false,
  loopRegion: null,
  loopActive: false,
  shuffle: false,
  volume: 1,
  queue: [],
  queueIndex: -1,
  primaryCanReverse: true,
  primaryCanABLoop: true,

  collageTracks: [],
  collagePlaying: false,
  scenes: [],

  randomMode: 'whole',

  quickTagTrackIds: [],
  openQuickTag: (trackIds) => set({ quickTagTrackIds: trackIds }),
  closeQuickTag: () => set({ quickTagTrackIds: [] }),
  addTagToTracks: async (trackIds, tag) => {
    const trimmed = tag.trim();
    if (!trimmed || trackIds.length === 0) return;
    for (const id of trackIds) {
      // Prefer the in-memory list, fall back to a fetch so this also works
      // when the target isn't in the current view (e.g. a bulk-tag operation
      // after switching views).
      let track = get().tracks.find((t) => t.id === id) ?? null;
      if (!track) track = await sonic().getTrack(id);
      if (!track) continue;
      if (track.userTags.includes(trimmed)) continue;
      const next = [...track.userTags, trimmed];
      await sonic().updateTrackMeta(id, { userTags: next });
    }
    await get().refreshAll();
  },
  removeTagFromTracks: async (trackIds, tag) => {
    if (!tag || trackIds.length === 0) return;
    for (const id of trackIds) {
      let track = get().tracks.find((t) => t.id === id) ?? null;
      if (!track) track = await sonic().getTrack(id);
      if (!track) continue;
      if (!track.userTags.includes(tag)) continue;
      const next = track.userTags.filter((t) => t !== tag);
      await sonic().updateTrackMeta(id, { userTags: next });
    }
    await get().refreshAll();
  },

  toast: null,
  setToast: (toast) => set({ toast }),

  init: async () => {
    const [libraries, activeRaw] = await Promise.all([
      sonic().listLibraries() as Promise<Library[]>,
      sonic().getSetting('activeLibraryIds') as Promise<string | null>,
    ]);
    let activeLibraryIds: number[] = [];
    if (activeRaw) {
      try {
        const parsed = JSON.parse(activeRaw);
        if (Array.isArray(parsed)) activeLibraryIds = parsed.filter((n) => typeof n === 'number');
      } catch {}
    }
    set({ libraries, activeLibraryIds });
    await get().refreshAll();

    sonic().onLibraryChanged(() => get().refreshAll());
    sonic().onScanProgress((p: any) => set({ scanProgress: p }));
  },

  refreshAll: async () => {
    const s = get();
    const sortToUse = s.sort;
    // If the user is viewing a smart playlist, evaluate its auto_query as the
    // listTracks filter (combined with the library scope from the sidebar).
    let filter = buildFilter(s);
    if (s.view.kind === 'playlist') {
      const viewId = s.view.id;
      const playlist = s.playlists.find((p) => p.id === viewId);
      if (playlist?.isAuto && playlist.autoQuery) {
        try {
          const smartFilter = JSON.parse(playlist.autoQuery) as FilterOptions;
          // Keep the library scope from the sidebar so smart playlists still
          // respect the user's "which library am I in" choice.
          filter = { ...smartFilter };
          if (s.activeLibraryIds.length > 0 && !smartFilter.libraryIds) {
            filter.libraryIds = s.activeLibraryIds;
          }
          if (s.search) filter.search = s.search;
          // Tag filters from sidebar AND-combine with the smart query's tags.
          if (s.filterUserTags.length > 0) {
            filter.userTagsAll = [
              ...(smartFilter.userTagsAll ?? []),
              ...s.filterUserTags.filter((t) => !(smartFilter.userTagsAll ?? []).includes(t)),
            ];
          }
          if (s.filterFinderTags.length > 0) {
            filter.finderTagsAll = [
              ...(smartFilter.finderTagsAll ?? []),
              ...s.filterFinderTags.filter((t) => !(smartFilter.finderTagsAll ?? []).includes(t)),
            ];
          }
        } catch {
          // Malformed query → fall back to normal playlist semantics
        }
      }
    }
    const [tracks, playlists, userTags, finderTags, genres, libraries] = await Promise.all([
      sonic().listTracks(filter, sortToUse),
      sonic().listPlaylists(),
      sonic().listUserTags(),
      sonic().listFinderTags(),
      sonic().listGenres(),
      sonic().listLibraries(),
    ]);
    set({ tracks, playlists, userTags, finderTags, genres, libraries });
  },

  addLibrary: async () => {
    try {
      const lib = await sonic().addLibrary();
      if (lib) {
        await get().scan();
      }
    } catch (err: any) {
      set({ toast: { kind: 'error', message: err?.message || 'Couldn\'t add library' } });
    }
  },

  renameLibrary: async (id, name) => {
    await sonic().renameLibrary(id, name);
  },

  deleteLibrary: async (id) => {
    await sonic().deleteLibrary(id);
    const next = get().activeLibraryIds.filter((x) => x !== id);
    if (next.length !== get().activeLibraryIds.length) {
      await get().setActiveLibraryIds(next);
    }
  },

  reorderLibraries: async (orderedIds) => {
    // Optimistic local reorder for snappy feel
    const map = new Map(get().libraries.map((l) => [l.id, l]));
    const next = orderedIds.map((id) => map.get(id)).filter(Boolean) as Library[];
    set({ libraries: next });
    await sonic().reorderLibraries(orderedIds);
  },

  setActiveLibraryIds: async (ids) => {
    set({ activeLibraryIds: ids });
    await sonic().setSetting('activeLibraryIds', JSON.stringify(ids));
    await get().refreshAll();
  },

  toggleLibrary: async (id, exclusive) => {
    const cur = get().activeLibraryIds;
    let next: number[];
    if (exclusive) {
      // Click → make this the only selection. Click an already-only-selected
      // library again to clear back to All.
      next = cur.length === 1 && cur[0] === id ? [] : [id];
    } else {
      // ⌘/⇧-click → toggle membership.
      next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    }
    await get().setActiveLibraryIds(next);
  },

  scan: async () => {
    set({ scanning: true, scanProgress: { done: 0, total: 0, current: '' } });
    try {
      await sonic().scan();
    } finally {
      set({ scanning: false, scanProgress: null });
      await get().refreshAll();
    }
  },

  setView: async (v) => {
    set({ view: v });
    await get().refreshAll();
  },

  setSearch: (q) => {
    set({ search: q });
    get().refreshAll();
  },

  setSort: async (s) => {
    set({ sort: s });
    await get().refreshAll();
  },

  selectTrack: (id) => set({
    selectedTrackId: id,
    selectedTrackIds: id == null ? [] : [id],
  }),
  selectTracks: (ids) => set({
    selectedTrackIds: ids,
    selectedTrackId: ids.length > 0 ? ids[ids.length - 1] : null,
  }),
  toggleTrackInSelection: (id) => {
    const cur = get().selectedTrackIds;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    set({
      selectedTrackIds: next,
      selectedTrackId: next.length > 0 ? next[next.length - 1] : null,
    });
  },
  scrollToTrack: (id) => set({ scrollToTrackId: id }),

  jumpToTrackInLibrary: async (track) => {
    // If a library scope is active and the track isn't in it, broaden to All.
    const s = get();
    if (s.activeLibraryIds.length > 0 && track.libraryId != null && !s.activeLibraryIds.includes(track.libraryId)) {
      await get().setActiveLibraryIds([]);
    }
    // Clear tag filters too so the track isn't accidentally hidden by them.
    if (s.filterUserTags.length > 0 || s.filterFinderTags.length > 0) {
      set({ filterUserTags: [], filterFinderTags: [] });
    }
    await get().setView({ kind: 'songs' });
    set({ selectedTrackId: track.id, scrollToTrackId: track.id });
  },

  toggleUserTagFilter: async (tag) => {
    const cur = get().filterUserTags;
    const next = cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag];
    set({ filterUserTags: next });
    // If we were on a tag-as-view, swap to Songs so the filter applies generally.
    if (get().view.kind !== 'songs' && get().view.kind !== 'playlist') {
      await get().setView({ kind: 'songs' });
    } else {
      await get().refreshAll();
    }
  },

  toggleFinderTagFilter: async (tag) => {
    const cur = get().filterFinderTags;
    const next = cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag];
    set({ filterFinderTags: next });
    if (get().view.kind !== 'songs' && get().view.kind !== 'playlist') {
      await get().setView({ kind: 'songs' });
    } else {
      await get().refreshAll();
    }
  },

  clearTagFilters: async () => {
    set({ filterUserTags: [], filterFinderTags: [] });
    await get().refreshAll();
  },

  playTrack: async (t, queue) => {
    try {
      const engine = getEngine();
      await engine.ensureRunning();
      const url = sonic().toMediaUrl(t.path);
      const player = await engine.loadPrimary(url, {
        onEnded: () => get().next(),
        onTimeUpdate: (currentTime) => set({ currentTime }),
      });

      // Apply known normalization gain immediately, or compute it in the
      // background on first play so the next play is instant.
      if (t.loudnessGain != null) {
        player.setNormalizationGain(t.loudnessGain);
      } else if (player.capabilities.loudnessAnalysis) {
        // Compute synchronously — it's fast enough on a typical buffer
        // (a few ms per minute of audio).
        const gain = player.computeNormalizationGain(NORMALIZATION_TARGET_DB);
        player.setNormalizationGain(gain);
        sonic().setLoudnessGain(t.id, gain).catch(() => {});
      }

      player.setVolume(get().volume);
      player.setPlaybackRate(get().playbackRate);
      // Reverse can't apply to media-element players; UI reflects this via
      // primaryCanReverse.
      if (player.capabilities.reverse && get().reversed) player.setReversed(true);
      // Apply current loop intent
      if (get().loopActive && get().loopRegion && player.capabilities.abLoop) {
        player.setLoopRegion(get().loopRegion);
      }
      player.play(0);

      const q = queue ?? get().tracks;
      const idx = q.findIndex((x) => x.id === t.id);

      set({
        currentTrack: t,
        duration: player.duration,
        isPlaying: true,
        currentTime: 0,
        loopRegion: get().loopActive ? { start: 0, end: player.duration } : null,
        queue: q,
        queueIndex: idx,
        primaryCanReverse: player.capabilities.reverse,
        primaryCanABLoop: player.capabilities.abLoop,
        // If we just loaded a fallback player while reverse was on, reset.
        reversed: player.capabilities.reverse ? get().reversed : false,
      });

      sonic().logPlay({
        trackId: t.id,
        startedAt: Date.now(),
        startPosition: 0,
        duration: 0,
        mode: 'whole',
        sliceLength: null,
      });
    } catch (err: any) {
      if (err instanceof LoadSupersededError) return; // silently
      console.error('playTrack failed:', err);
      set({ toast: { kind: 'error', message: `Couldn't play "${t.title}": ${err?.message || err}` } });
      // Mark un-decodable so we don't keep tripping on it
      if (String(err?.message || '').includes("isn't a decodable")) {
        sonic().markDecodeFailed(t.id).catch(() => {});
      }
    }
  },

  togglePlay: async () => {
    const engine = getEngine();
    const state = get();
    // Nothing loaded yet — start the first track in the current view (or a
    // random one if shuffle is on). Lets Spacebar work as a "start playing"
    // shortcut even before the user has clicked a row.
    if (!engine.primary || !state.currentTrack) {
      const tracks = state.tracks;
      if (tracks.length === 0) return;
      const first = state.shuffle
        ? tracks[Math.floor(Math.random() * tracks.length)]
        : tracks[0];
      await get().playTrack(first, tracks);
      return;
    }
    await engine.ensureRunning();
    const player = engine.primary;
    if (player.isPlaying) {
      player.pause();
      set({ isPlaying: false });
    } else {
      player.play();
      set({ isPlaying: true });
    }
  },

  next: async () => {
    const { queue, queueIndex, shuffle } = get();
    if (queue.length === 0) return;
    let nextIdx: number;
    if (shuffle) {
      nextIdx = Math.floor(Math.random() * queue.length);
      if (nextIdx === queueIndex && queue.length > 1) nextIdx = (nextIdx + 1) % queue.length;
    } else {
      nextIdx = queueIndex + 1;
    }
    if (queue[nextIdx]) {
      await get().playTrack(queue[nextIdx], queue);
    } else {
      set({ isPlaying: false });
    }
  },

  previous: async () => {
    const { queue, queueIndex, currentTime } = get();
    if (currentTime > 3 && queue[queueIndex]) {
      get().seek(0);
      return;
    }
    const prevIdx = queueIndex - 1;
    if (queue[prevIdx]) {
      await get().playTrack(queue[prevIdx], queue);
    } else {
      get().seek(0);
    }
  },

  seek: (t) => {
    getEngine().primary?.seek(t);
    set({ currentTime: t });
  },

  setPlaybackRate: (r) => {
    set({ playbackRate: r });
    getEngine().primary?.setPlaybackRate(r);
  },

  setReversed: (b) => {
    set({ reversed: b });
    getEngine().primary?.setReversed(b);
  },

  setLoopRegion: (r) => {
    set({ loopRegion: r });
    const player = getEngine().primary;
    if (get().loopActive && player) {
      player.setLoopRegion(r);
      // The engine may have just snapped the playhead to a region boundary
      // (e.g. dragging the loop start past the current playback position).
      // Mirror that snap into the store immediately so the visible playhead
      // follows the loop edge — no waiting for the next RAF tick.
      set({ currentTime: player.currentTime });
    }
  },

  setLoopActive: (b) => {
    const s = get();
    if (b) {
      // Always default to the full song when engaging — predictable behavior
      // each time the loop is turned on.
      const region = s.duration ? { start: 0, end: s.duration } : null;
      set({ loopActive: true, loopRegion: region });
      getEngine().primary?.setLoopRegion(region);
    } else {
      set({ loopActive: false, loopRegion: null });
      getEngine().primary?.setLoopRegion(null);
    }
  },

  setLoopStart: () => {
    const s = get();
    if (!s.duration) return;
    const start = s.currentTime;
    // If we already had a region keep its end (clamped > start); otherwise
    // anchor to song end so "Start" pins down the front of a whole-song loop.
    const end = s.loopRegion ? Math.max(start + 0.1, s.loopRegion.end) : s.duration;
    const region = { start, end };
    set({ loopRegion: region, loopActive: true });
    getEngine().primary?.setLoopRegion(region);
  },

  setLoopEnd: () => {
    const s = get();
    if (!s.duration) return;
    const end = s.currentTime;
    const start = s.loopRegion ? Math.min(end - 0.1, s.loopRegion.start) : 0;
    const region = { start, end };
    set({ loopRegion: region, loopActive: true });
    getEngine().primary?.setLoopRegion(region);
  },

  setShuffle: (b) => set({ shuffle: b }),

  setVolume: (v) => {
    set({ volume: v });
    getEngine().primary?.setVolume(v);
    for (const p of getEngine().collage) p.setVolume(v);
  },

  stopPlayback: () => {
    getEngine().unloadPrimary();
    set({
      isPlaying: false,
      currentTrack: null,
      currentTime: 0,
      duration: 0,
      loopRegion: null,
      loopActive: false,
    });
  },

  updateTrackMeta: async (id, patch) => {
    await sonic().updateTrackMeta(id, patch);
  },

  setRating: async (trackId, rating) => {
    await sonic().updateTrackMeta(trackId, { rating });
    // Optimistic local update so the row updates immediately without a round-trip
    set({
      tracks: get().tracks.map((t) => (t.id === trackId ? { ...t, rating } : t)),
      currentTrack: get().currentTrack?.id === trackId ? { ...get().currentTrack!, rating } : get().currentTrack,
    });
  },

  createPlaylist: async (name) => {
    await sonic().createPlaylist(name);
  },

  createSmartPlaylist: async (name, query) => {
    await sonic().createSmartPlaylist(name, JSON.stringify(query));
  },

  updateSmartPlaylist: async (id, name, query) => {
    await sonic().updateSmartPlaylist(id, name, JSON.stringify(query));
  },

  addToPlaylist: async (playlistId, trackId) => {
    await sonic().addToPlaylist(playlistId, trackId);
  },

  removeFromPlaylist: async (playlistId, trackId) => {
    await sonic().removeFromPlaylist(playlistId, trackId);
  },

  deletePlaylist: async (id) => {
    await sonic().deletePlaylist(id);
  },

  revealInFinder: async (path) => {
    await sonic().revealInFinder(path);
  },

  // === Multi-track collage =================================================

  sendCurrentToMultiTrack: async () => {
    const s = get();
    const track = s.currentTrack;
    if (!track) {
      set({ toast: { kind: 'info', message: 'Nothing playing to send' } });
      return;
    }
    if (s.collageTracks.length >= 5) {
      set({ toast: { kind: 'info', message: 'Multi-Track is full (5 max). Remove one first.' } });
      return;
    }

    const loopRegion = s.loopActive ? s.loopRegion : null;
    const playbackRate = s.playbackRate;
    const reversed = s.reversed;
    const startPos = loopRegion ? loopRegion.start : 0;

    await get().addToCollage(track);
    const idx = get().collageTracks.length - 1;
    const player = getEngine().collage[idx];
    if (player) {
      player.setPlaybackRate(playbackRate);
      if (reversed && player.capabilities.reverse) player.setReversed(true);
      if (loopRegion && player.capabilities.abLoop) {
        player.setLoopRegion(loopRegion);
      }
      player.seek(startPos);
      updateCollageRow(set, get, idx, {
        playbackRate,
        reversed,
        loopRegion,
        loopActive: !!loopRegion,
        currentTime: startPos,
      });
    }
    await get().setView({ kind: 'multi-track' });
    set({ toast: { kind: 'info', message: loopRegion ? `Loop sent to Multi-Track` : `Sent "${track.title}" to Multi-Track` } });
  },

  addToCollage: async (t) => {
    if (get().collageTracks.find((c) => c.track.id === t.id)) return;
    if (get().collageTracks.length >= 5) return;
    try {
      const engine = getEngine();
      await engine.ensureRunning();
      const url = sonic().toMediaUrl(t.path);
      const idx = get().collageTracks.length;
      const player = await engine.addCollagePlayer(url);
      if (t.loudnessGain != null) {
        player.setNormalizationGain(t.loudnessGain);
      } else if (player.capabilities.loudnessAnalysis) {
        const gain = player.computeNormalizationGain(NORMALIZATION_TARGET_DB);
        player.setNormalizationGain(gain);
        sonic().setLoudnessGain(t.id, gain).catch(() => {});
      }
      player.setVolume(0.7);

      // Wire timer callbacks so the per-track scrubber updates.
      (player as any)._idx = idx;
      const updateTime = () => {
        const cur = get().collageTracks;
        const i = cur.findIndex((c) => c.track.id === t.id);
        if (i < 0) return;
        const next = [...cur];
        next[i] = { ...next[i], currentTime: player.currentTime, isPlaying: player.isPlaying };
        set({ collageTracks: next });
      };
      // We don't have a hook for time updates per collage player in the engine;
      // instead drive a low-rate refresh from the panel. Just register an
      // ended callback so the row reflects state.
      // (Time refresh is handled in the panel via a setInterval.)

      set({
        collageTracks: [...get().collageTracks, {
          track: t,
          volume: 0.7,
          playbackRate: 1,
          reversed: false,
          loopRegion: null,
          loopActive: false,
          isPlaying: false,
          currentTime: 0,
          duration: player.duration,
          canReverse: player.capabilities.reverse,
          canABLoop: player.capabilities.abLoop,
        }],
      });
      // Fire one update so duration is current
      updateTime();
    } catch (err: any) {
      console.error('addToCollage failed:', err);
      set({ toast: { kind: 'error', message: `Couldn't add "${t.title}" to collage: ${err?.message || err}` } });
    }
  },

  removeFromCollage: (idx) => {
    getEngine().removeCollagePlayer(idx);
    const next = [...get().collageTracks];
    next.splice(idx, 1);
    set({ collageTracks: next });
  },

  setCollageVolume: (idx, v) => {
    const players = getEngine().collage;
    if (players[idx]) players[idx].setVolume(v);
    updateCollageRow(set, get, idx, { volume: v });
  },

  setCollagePlaybackRate: (idx, r) => {
    const players = getEngine().collage;
    if (players[idx]) players[idx].setPlaybackRate(r);
    updateCollageRow(set, get, idx, { playbackRate: r });
  },

  setCollageReversed: (idx, b) => {
    const players = getEngine().collage;
    if (players[idx]) players[idx].setReversed(b);
    updateCollageRow(set, get, idx, { reversed: b });
  },

  setCollageLoopRegion: (idx, r) => {
    const cur = get().collageTracks[idx];
    const players = getEngine().collage;
    updateCollageRow(set, get, idx, { loopRegion: r });
    if (cur?.loopActive && players[idx]) players[idx].setLoopRegion(r);
  },

  setCollageLoopActive: (idx, b) => {
    const cur = get().collageTracks[idx];
    if (!cur) return;
    let region = cur.loopRegion;
    if (b && !region && cur.duration) region = { start: 0, end: cur.duration };
    const players = getEngine().collage;
    if (players[idx]) players[idx].setLoopRegion(b ? region : null);
    updateCollageRow(set, get, idx, { loopActive: b, loopRegion: region });
  },

  setCollageLoopStart: (idx) => {
    const cur = get().collageTracks[idx];
    if (!cur || !cur.duration) return;
    const start = cur.currentTime;
    const end = cur.loopRegion ? Math.max(start + 0.1, cur.loopRegion.end) : Math.min(cur.duration, start + 4);
    const region = { start, end };
    const players = getEngine().collage;
    if (players[idx]) players[idx].setLoopRegion(region);
    updateCollageRow(set, get, idx, { loopRegion: region, loopActive: true });
  },

  setCollageLoopEnd: (idx) => {
    const cur = get().collageTracks[idx];
    if (!cur || !cur.duration) return;
    const end = cur.currentTime;
    const start = cur.loopRegion ? Math.min(end - 0.1, cur.loopRegion.start) : Math.max(0, end - 4);
    const region = { start, end };
    const players = getEngine().collage;
    if (players[idx]) players[idx].setLoopRegion(region);
    updateCollageRow(set, get, idx, { loopRegion: region, loopActive: true });
  },

  toggleCollagePlay: (idx) => {
    const players = getEngine().collage;
    const player = players[idx];
    const cur = get().collageTracks[idx];
    if (!player || !cur) return;
    if (player.isPlaying) player.pause();
    else player.play();
    updateCollageRow(set, get, idx, { isPlaying: player.isPlaying });
  },

  seekCollage: (idx, t) => {
    const players = getEngine().collage;
    if (players[idx]) players[idx].seek(t);
    updateCollageRow(set, get, idx, { currentTime: t });
  },

  playCollage: async () => {
    const engine = getEngine();
    await engine.ensureRunning();
    engine.collage.forEach((p, idx) => {
      const cur = get().collageTracks[idx];
      const startAt = cur ? cur.currentTime : Math.random() * Math.max(0, p.duration - 30);
      p.play(startAt);
    });
    const next = get().collageTracks.map((c) => ({ ...c, isPlaying: true }));
    set({ collageTracks: next, collagePlaying: true });
  },

  stopCollage: () => {
    for (const p of getEngine().collage) p.pause();
    const next = get().collageTracks.map((c) => ({ ...c, isPlaying: false }));
    set({ collageTracks: next, collagePlaying: false });
  },

  randomCollage: async (n) => {
    get().stopCollage();
    getEngine().clearCollage();
    set({ collageTracks: [] });
    const result = await sonic().randomTracks(n, pickRandomFilter(get()));
    const tracks = Array.isArray(result) ? result : result ? [result] : [];
    for (const t of tracks) await get().addToCollage(t);
  },

  refreshScenes: async () => {
    const scenes = await sonic().listScenes();
    set({ scenes });
  },

  saveScene: async (name) => {
    const cur = get().collageTracks;
    const data: SceneData = {
      tracks: cur.map((c) => ({
        trackId: c.track.id,
        volume: c.volume,
        playbackRate: c.playbackRate,
        reversed: c.reversed,
        loopRegion: c.loopRegion,
        loopActive: c.loopActive,
        startPosition: c.currentTime,
      })),
    };
    await sonic().saveScene(name, JSON.stringify(data));
    await get().refreshScenes();
  },

  loadScene: async (sceneId) => {
    const scene = (get().scenes).find((s) => s.id === sceneId);
    if (!scene) return;
    let parsed: SceneData;
    try { parsed = JSON.parse(scene.data); } catch { return; }
    // Reset
    get().stopCollage();
    getEngine().clearCollage();
    set({ collageTracks: [] });
    // Re-add each track and reapply settings
    for (const entry of parsed.tracks) {
      const track = await sonic().getTrack(entry.trackId);
      if (!track) continue;
      await get().addToCollage(track);
      const idx = get().collageTracks.length - 1;
      const player = getEngine().collage[idx];
      if (!player) continue;
      player.setVolume(entry.volume);
      player.setPlaybackRate(entry.playbackRate);
      if (entry.reversed && player.capabilities.reverse) player.setReversed(true);
      if (entry.loopActive && entry.loopRegion && player.capabilities.abLoop) {
        player.setLoopRegion(entry.loopRegion);
      }
      player.seek(entry.startPosition);
      updateCollageRow(set, get, idx, {
        volume: entry.volume,
        playbackRate: entry.playbackRate,
        reversed: entry.reversed,
        loopRegion: entry.loopRegion,
        loopActive: entry.loopActive,
        currentTime: entry.startPosition,
      });
    }
  },

  deleteScene: async (sceneId) => {
    await sonic().deleteScene(sceneId);
    await get().refreshScenes();
  },

  // === Random review ========================================================

  setRandomMode: (m) => set({ randomMode: m }),

  pickRandom: async () => {
    try {
      const t = await sonic().randomTracks(1, pickRandomFilter(get()));
      if (!t) return;
      const track = Array.isArray(t) ? t[0] : t;
      if (!track) return;

      const mode = get().randomMode;
      const engine = getEngine();
      await engine.ensureRunning();
      const url = sonic().toMediaUrl(track.path);

      let sliceEnd: number | null = null;
      const player = await engine.loadPrimary(url, {
        onEnded: () => {
          if (mode === 'whole') get().pickRandom();
          else get().pickRandom();
        },
        onTimeUpdate: (currentTime) => {
          set({ currentTime });
          if (sliceEnd != null && currentTime >= sliceEnd) {
            // Slice complete — pick another
            sliceEnd = null;
            get().pickRandom();
          }
        },
      });

      if (track.loudnessGain != null) {
        player.setNormalizationGain(track.loudnessGain);
      } else {
        const gain = player.computeNormalizationGain(NORMALIZATION_TARGET_DB);
        player.setNormalizationGain(gain);
        sonic().setLoudnessGain(track.id, gain).catch(() => {});
      }

      player.setVolume(get().volume);

      let startPos = 0;
      if (mode !== 'whole') {
        const sliceLen = mode;
        const dur = player.duration;
        startPos = Math.random() * Math.max(0, dur - sliceLen);
        sliceEnd = startPos + sliceLen;
      }

      player.play(startPos);

      // Build a queue from the random history so prev/next navigates it.
      const prevQueue = get().queue;
      const newQueue = [...prevQueue, track];
      // Cap at 200 to avoid unbounded growth
      const trimmed = newQueue.length > 200 ? newQueue.slice(-200) : newQueue;
      set({
        currentTrack: track,
        duration: player.duration,
        isPlaying: true,
        currentTime: startPos,
        queue: trimmed,
        queueIndex: trimmed.length - 1,
        loopRegion: null,
        loopActive: false,
      });

      sonic().logPlay({
        trackId: track.id,
        startedAt: Date.now(),
        startPosition: startPos,
        duration: 0,
        mode: mode === 'whole' ? 'whole' : 'slice',
        sliceLength: mode === 'whole' ? null : (mode as number),
      });
    } catch (err: any) {
      if (err instanceof LoadSupersededError) return;
      console.error('pickRandom failed:', err);
      // If decode failed, mark and try another
      if (String(err?.message || '').includes("isn't a decodable")) {
        // try to find current track and mark it
        const probable = get().currentTrack;
        if (probable) sonic().markDecodeFailed(probable.id).catch(() => {});
      }
      set({ toast: { kind: 'error', message: `Random pick failed: ${err?.message || err}` } });
    }
  },

  switchToFullPlay: () => {
    // From a slice, switch to playing the full track from the same position.
    const { currentTrack, currentTime } = get();
    if (!currentTrack) return;
    set({ randomMode: 'whole' });
    const player = getEngine().primary;
    if (player) {
      player.play(currentTime);
      set({ isPlaying: true });
    }
  },
}));
