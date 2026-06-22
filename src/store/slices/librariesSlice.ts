/**
 * Libraries slice — the *containers* of music. Adding folders, naming
 * them, deleting them, choosing which one(s) are in scope right now,
 * and the scan that walks them.
 *
 * Where it runs: renderer.
 * Owns these State fields: `libraries`, `activeLibraryIds`, `scanning`,
 *   `scanProgress`, plus the matching actions and `init` (bootstrap).
 *
 * Notes:
 *  - `activeLibraryIds = []` means "All Libraries" (no filter). Any
 *    non-empty array filters the rest of the app down to that set.
 *  - `init` runs once on app launch from `App.tsx`. It loads libraries
 *    and the saved active-scope from the DB, then asks the view slice
 *    to do its first `refreshAll`, then registers the listeners that
 *    push live changes back into the store.
 *  - `scan` flips `scanning` true and lets the main process push
 *    progress through `scanProgress` (set by an `onScanProgress`
 *    listener registered in `init`).
 */

import type { StoreApi } from 'zustand';
import type { Library } from '@shared/types';
import type { State } from '../library';

type Set = StoreApi<State>['setState'];
type Get = StoreApi<State>['getState'];

const sonic = () => window.sonic;

export type LibrariesSlice = Pick<State,
  | 'libraries'
  | 'activeLibraryIds'
  | 'scanning'
  | 'scanProgress'
  | 'init'
  | 'addLibrary'
  | 'renameLibrary'
  | 'deleteLibrary'
  | 'reorderLibraries'
  | 'setActiveLibraryIds'
  | 'toggleLibrary'
  | 'scan'
>;

export function createLibrariesSlice(set: Set, get: Get): LibrariesSlice {
  return {
    libraries: [],
    activeLibraryIds: [],
    scanning: false,
    scanProgress: null,

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

    addLibrary: async () => {
      try {
        const lib = await sonic().addLibrary();
        if (lib) {
          await get().scan();
        }
      } catch (err: any) {
        set({ toast: { kind: 'error', message: err?.message || "Couldn't add library" } });
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
  };
}
