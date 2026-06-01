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
