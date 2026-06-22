/**
 * The common audio-player interface — what every backend implements.
 *
 * Where it runs: renderer (renderer is the only process that does audio).
 * Depends on: nothing.
 * Used by:    `BufferTrackPlayer.ts`, `MediaTrackPlayer.ts` (both
 *   implement `ITrackPlayer`); `AudioEngine.ts` (factory returns one);
 *   `src/store/library.ts` (consumes one through the engine singleton).
 *
 * Notes:
 *  - Two concrete implementations exist:
 *      `BufferTrackPlayer` — full features (reverse, A-B loop, loudness).
 *      `MediaTrackPlayer`  — fallback for files Web Audio can't decode.
 *  - `capabilities` advertises what each backend can do so the UI can
 *    disable controls the backend doesn't support (e.g. the reverse
 *    button for a media-element player).
 */

export interface PlayerCapabilities {
  /** Buffer-based players support reversal; media-element players don't. */
  reverse: boolean;
  /** Buffer-based players support arbitrary A-B regions; media-element players support whole-track loop only. */
  abLoop: boolean;
  /** Buffer-based players can compute loudness from samples. */
  loudnessAnalysis: boolean;
}

export interface ITrackPlayer {
  readonly capabilities: PlayerCapabilities;
  readonly url: string;
  readonly duration: number;
  readonly isPlaying: boolean;
  readonly currentTime: number;
  readonly playbackRate: number;
  readonly reversed: boolean;
  readonly volume: number;
  readonly loopRegion: { start: number; end: number } | null;
  destroyed: boolean;

  load(): Promise<void>;
  play(fromSec?: number): void;
  pause(): void;
  seek(t: number): void;
  stop(): void;
  destroy(): void;

  setPlaybackRate(r: number): void;
  setReversed(rev: boolean): void;
  setVolume(v: number): void;
  setNormalizationGain(linear: number): void;
  setLoopRegion(region: { start: number; end: number } | null): void;

  /** Returns 1 if no buffer is available (media-element fallback). */
  computeNormalizationGain(targetDbFs?: number): number;
}

export interface TrackPlayerOptions {
  url: string;
  context: AudioContext;
  destination: AudioNode;
  onEnded?: () => void;
  onTimeUpdate?: (current: number) => void;
}
