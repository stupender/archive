/**
 * Tiny pure-function helpers for formatting things to strings.
 *
 * Where it runs: renderer (used by components).
 * Depends on: nothing.
 * Used by:    PlayerBar, TrackList, RandomReviewPanel, MultiTrackPanel,
 *   TrackDetailDrawer — anywhere a duration, file size, or media URL
 *   needs to be rendered.
 *
 * Notes:
 *  - No React, no state, no side effects — just functions in, strings out.
 *    Trivial to test if we ever add tests.
 *  - `mediaUrl(path)` converts a local file path into the `media://`
 *    URL that the renderer can `fetch()` (the protocol handler is in
 *    `electron/main.ts`).
 *  - `formatLabel(format, path)` is the "WAV" / "MP3" / "AIFF" pill
 *    you see in the track list — prefers the ID3 container name but
 *    falls back to the file extension if no metadata.
 */
export function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function mediaUrl(p: string): string {
  return 'media://archive' + p.split('/').map(encodeURIComponent).join('/');
}

/** Display-friendly format label, e.g. "WAV", "MP3", "M4A". */
export function formatLabel(format: string | null, path: string): string | null {
  if (format) {
    const f = format.toUpperCase();
    if (f.includes('WAVE') || f === 'WAV' || f.includes('RIFF')) return 'WAV';
    if (f.includes('MPEG 1 LAYER 3') || f === 'MP3' || f.includes('MPEG')) return 'MP3';
    if (f.includes('FLAC')) return 'FLAC';
    if (f.includes('OGG')) return 'OGG';
    if (f.includes('OPUS')) return 'OPUS';
    if (f.includes('AIFF') || f.includes('AIFC')) return 'AIFF';
    if (f.includes('M4A') || f.includes('MP4') || f.includes('AAC') || f.includes('ISO')) return 'M4A';
    if (f.includes('ALAC')) return 'ALAC';
  }
  // Fall back to file extension
  const m = /\.([a-z0-9]+)$/i.exec(path);
  if (!m) return null;
  return m[1].toUpperCase();
}
