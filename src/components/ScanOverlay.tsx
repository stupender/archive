/**
 * Full-screen overlay shown while a folder scan runs — progress bar +
 * counter + currently-being-processed file path.
 *
 * Where it runs: renderer.
 * Depends on: the Zustand store (reads `scanProgress`, which the main
 *   process pushes via the `library:scanProgress` event).
 * Used by:    `App.tsx` renders this on top of everything when
 *   `state.scanning` is true.
 *
 * Notes:
 *  - Scan progress messages are sent every 5 files from `library.ts`'s
 *    `scanAllLibraries` (throttled to avoid flooding the IPC channel
 *    on large libraries).
 */
import { useLibrary } from '../store/library';

export function ScanOverlay() {
  const progress = useLibrary((s) => s.scanProgress);
  const pct = progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 0;
  return (
    <div className="scan-overlay">
      <div className="scan-card">
        <div className="scan-title">Scanning library…</div>
        <div className="scan-progress">
          <div className="scan-progress-bar" style={{ width: `${pct}%` }} />
        </div>
        <div className="scan-meta">
          {progress?.total ? `${progress.done} / ${progress.total}` : 'Looking for files…'}
        </div>
        {progress?.current && (
          <div className="scan-current" title={progress.current}>{progress.current}</div>
        )}
      </div>
    </div>
  );
}
