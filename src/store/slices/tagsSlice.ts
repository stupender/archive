/**
 * Tags slice — the quick-tag overlay (the floating "tag these N
 * tracks" dialog) and the bulk add/remove tag actions it dispatches.
 *
 * Where it runs: renderer.
 * Owns these State fields: `quickTagTrackIds`, plus `openQuickTag`,
 *   `closeQuickTag`, `addTagToTracks`, `removeTagFromTracks`.
 *
 * Notes:
 *  - `quickTagTrackIds = []` means "overlay closed." A non-empty array
 *    means "overlay is open and targeting these tracks."
 *  - The user-tag *filters* (`filterUserTags` / `filterFinderTags`)
 *    live in the view slice, not here. This slice is only about
 *    *writing* tags onto tracks.
 *  - Both bulk actions iterate per track because each track has its
 *    own current tag list — we read it (from memory or fetched), patch
 *    it, write it back. Idempotent: already-present tags are skipped,
 *    already-absent tags are skipped.
 */

import type { StoreApi } from 'zustand';
import type { State } from '../library';

type Set = StoreApi<State>['setState'];
type Get = StoreApi<State>['getState'];

const sonic = () => window.sonic;

export type TagsSlice = Pick<State,
  | 'quickTagTrackIds'
  | 'openQuickTag'
  | 'closeQuickTag'
  | 'addTagToTracks'
  | 'removeTagFromTracks'
>;

export function createTagsSlice(set: Set, get: Get): TagsSlice {
  return {
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
  };
}
