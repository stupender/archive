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
      <QuickTagDialog />
    </div>
  );
}
