/**
 * The "Welcome to Archive" screen shown when no libraries have been added
 * yet. One big "Add a library" button.
 *
 * Where it runs: renderer.
 * Depends on: the Zustand store (`addLibrary` action), Icon.
 * Used by:    `App.tsx` renders this in place of the main content when
 *   `libraries.length === 0`.
 */
import { useLibrary } from '../store/library';
import { Icon } from './Icon';

export function EmptyState() {
  const addLibrary = useLibrary((s) => s.addLibrary);
  return (
    <div className="empty-state">
      <div className="empty-state-icon"><Icon name="library" size={64} strokeWidth={1.2} /></div>
      <h2>Welcome to Archive</h2>
      <p>
        Add a folder of music to start. Each top-level folder becomes a <em>library</em> —
        you can keep your songwriting catalog separate from field recordings, and Random
        Review respects which library you've selected.
      </p>
      <button className="empty-state-btn" onClick={() => addLibrary()}>
        Add a library
      </button>
      <p className="empty-state-hint">
        Sub-folders are picked up recursively. macOS Finder tags become tags here too.
        Folders ending in “Project” (Ableton sets) are skipped automatically.
      </p>
    </div>
  );
}
