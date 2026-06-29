/**
 * The top-level React component — the layout shell and the place where
 * one-time app setup happens.
 *
 * Where it runs: renderer.
 * Depends on: every panel/overlay component, the Zustand store
 *   (for the `init` action and basic view state), the keyboard hook.
 * Used by:    `src/main.tsx` mounts this.
 *
 * Notes:
 *  - The layout is `Sidebar | (Topbar / content / PlayerBar)`. The
 *    `content` slot swaps between TrackList / RandomReviewPanel /
 *    MultiTrackPanel based on the current view.
 *  - If no libraries exist yet, the `<EmptyState />` takes over the
 *    content slot.
 *  - Toast and QuickTagDialog are floated as overlays — always
 *    rendered, but invisible until the store toggles them.
 *  - On mount: call `init()` (which loads libraries from the DB and
 *    subscribes to `library:changed` events from the main process),
 *    then flip `ready` so the rest of the UI renders.
 *  - If `window.sonic` isn't present, the preload bridge didn't load —
 *    show a fatal error screen instead of an empty UI.
 */
import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { TrackList } from './components/TrackList';
import { PlayerBar } from './components/PlayerBar';
import { RandomReviewPanel } from './components/RandomReviewPanel';
import { MultiTrackPanel } from './components/MultiTrackPanel';
import { EmptyState } from './components/EmptyState';
import { ScanOverlay } from './components/ScanOverlay';
import { Toast } from './components/Toast';
import { PermissionsBanner } from './components/PermissionsBanner';
import { QuickTagDialog } from './components/QuickTagDialog';
import { useLibrary } from './store/library';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

export default function App() {
  const init = useLibrary((s) => s.init);
  const view = useLibrary((s) => s.view);
  const libraries = useLibrary((s) => s.libraries);
  const tracks = useLibrary((s) => s.tracks);
  const scanning = useLibrary((s) => s.scanning);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useKeyboardShortcuts();

  useEffect(() => {
    if (typeof window.sonic === 'undefined') {
      setInitError('Preload bridge did not load. The window.sonic API is missing — restart the dev server.');
      return;
    }
    init()
      .then(() => setReady(true))
      .catch((err) => {
        console.error('Failed to initialize:', err);
        setInitError(err?.message || String(err));
      });
  }, [init]);

  if (initError) {
    return (
      <div className="app-loading">
        <div style={{ maxWidth: 480, textAlign: 'center', padding: 32 }}>
          <h2 style={{ marginBottom: 12 }}>Couldn't start up</h2>
          <p style={{ color: '#a1a1a6' }}>{initError}</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return <div className="app-loading">Loading…</div>;
  }

  const showEmpty = libraries.length === 0;

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Topbar />
        <div className="content">
          {showEmpty ? (
            <EmptyState />
          ) : view.kind === 'random-review' ? (
            <RandomReviewPanel />
          ) : view.kind === 'multi-track' ? (
            <MultiTrackPanel />
          ) : (
            <TrackList tracks={tracks} />
          )}
        </div>
        <PlayerBar />
      </div>
      {scanning && <ScanOverlay />}
      <Toast />
      <PermissionsBanner />
      <QuickTagDialog />
    </div>
  );
}
