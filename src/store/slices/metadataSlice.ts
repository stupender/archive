/**
 * Metadata slice — DB writes that update existing data: ratings,
 * playlist CRUD, track metadata edits, and the "reveal in Finder"
 * passthrough.
 *
 * Where it runs: renderer.
 * Owns these actions: `updateTrackMeta`, `setRating`, `createPlaylist`,
 *   `createSmartPlaylist`, `updateSmartPlaylist`, `addToPlaylist`,
 *   `removeFromPlaylist`, `deletePlaylist`, `revealInFinder`.
 *
 * Notes:
 *  - None of these own state directly — they're all thin wrappers over
 *    `window.sonic.*` IPC calls. The relevant State (`tracks`,
 *    `playlists`) is owned by the view slice and refreshed by
 *    `refreshAll`. The main process emits `library:changed` after most
 *    writes, which triggers a refresh via the listener registered in
 *    `init`.
 *  - `setRating` does an optimistic local update so the UI feels
 *    instant — the rating star fills in without waiting for the round
 *    trip + refresh.
 */

import type { StoreApi } from 'zustand';
import type { State } from '../library';

type Set = StoreApi<State>['setState'];
type Get = StoreApi<State>['getState'];

const sonic = () => window.sonic;

export type MetadataSlice = Pick<State,
  | 'updateTrackMeta'
  | 'setRating'
  | 'createPlaylist'
  | 'createSmartPlaylist'
  | 'updateSmartPlaylist'
  | 'addToPlaylist'
  | 'removeFromPlaylist'
  | 'deletePlaylist'
  | 'revealInFinder'
>;

export function createMetadataSlice(set: Set, get: Get): MetadataSlice {
  return {
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
  };
}
