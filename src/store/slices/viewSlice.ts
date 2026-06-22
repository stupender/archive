/**
 * View slice — what the user is currently looking at and how it's filtered.
 *
 * Where it runs: renderer.
 * Owns these State fields: `view`, `search`, `sort`, `tracks`, `playlists`,
 *   `userTags`, `finderTags`, `genres`, `selectedTrackId`, `selectedTrackIds`,
 *   `scrollToTrackId`, `filterUserTags`, `filterFinderTags`, plus the
 *   matching actions and the master `refreshAll` function.
 *
 * Notes:
 *  - `refreshAll` is the catch-all re-fetch — runs after most write
 *    actions. Cheap because the queries are SQLite-fast. It builds a
 *    `FilterOptions` from the current view + search + tag filters +
 *    active library scope, and feeds it to `sonic().listTracks`.
 *  - Smart playlists are evaluated here too: when a playlist view is a
 *    smart playlist, `refreshAll` parses its `autoQuery` and AND-combines
 *    it with the sidebar's library scope and tag filters.
 *  - View kinds: `songs`, `playlist`, `random-review`, `multi-track`,
 *    `history`. Track-list views (`songs`, `playlist`) display `tracks`;
 *    the others have their own UIs.
 */

import type { StoreApi } from 'zustand';
import type { FilterOptions } from '@shared/types';
import type { State } from '../library';

type Set = StoreApi<State>['setState'];
type Get = StoreApi<State>['getState'];

const sonic = () => window.sonic;

/** Build the filter that listTracks runs with, given current view state. */
function buildFilter(s: State): FilterOptions {
  const f: FilterOptions = {};
  if (s.search) f.search = s.search;
  if (s.activeLibraryIds.length > 0) f.libraryIds = s.activeLibraryIds;
  if (s.filterUserTags.length > 0) f.userTagsAll = [...s.filterUserTags];
  if (s.filterFinderTags.length > 0) f.finderTagsAll = [...s.filterFinderTags];

  if (s.view.kind === 'playlist') f.playlistId = s.view.id;
  return f;
}

export type ViewSlice = Pick<State,
  | 'view'
  | 'search'
  | 'sort'
  | 'tracks'
  | 'playlists'
  | 'userTags'
  | 'finderTags'
  | 'genres'
  | 'selectedTrackId'
  | 'selectedTrackIds'
  | 'scrollToTrackId'
  | 'filterUserTags'
  | 'filterFinderTags'
  | 'refreshAll'
  | 'setView'
  | 'setSearch'
  | 'setSort'
  | 'selectTrack'
  | 'selectTracks'
  | 'toggleTrackInSelection'
  | 'scrollToTrack'
  | 'jumpToTrackInLibrary'
  | 'toggleUserTagFilter'
  | 'toggleFinderTagFilter'
  | 'clearTagFilters'
>;

export function createViewSlice(set: Set, get: Get): ViewSlice {
  return {
    view: { kind: 'songs' },
    search: '',
    sort: { field: 'addedAt', direction: 'desc' },
    tracks: [],
    playlists: [],
    userTags: [],
    finderTags: [],
    genres: [],
    selectedTrackId: null,
    selectedTrackIds: [],
    scrollToTrackId: null,
    filterUserTags: [],
    filterFinderTags: [],

    refreshAll: async () => {
      const s = get();
      const sortToUse = s.sort;
      // If the user is viewing a smart playlist, evaluate its auto_query as
      // the listTracks filter (combined with the library scope from the
      // sidebar).
      let filter = buildFilter(s);
      if (s.view.kind === 'playlist') {
        const viewId = s.view.id;
        const playlist = s.playlists.find((p) => p.id === viewId);
        if (playlist?.isAuto && playlist.autoQuery) {
          try {
            const smartFilter = JSON.parse(playlist.autoQuery) as FilterOptions;
            // Keep the library scope from the sidebar so smart playlists
            // still respect the user's "which library am I in" choice.
            filter = { ...smartFilter };
            if (s.activeLibraryIds.length > 0 && !smartFilter.libraryIds) {
              filter.libraryIds = s.activeLibraryIds;
            }
            if (s.search) filter.search = s.search;
            // Tag filters from the sidebar AND-combine with the smart query's tags.
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
  };
}
