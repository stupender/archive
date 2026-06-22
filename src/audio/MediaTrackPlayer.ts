/**
 * Fallback player for audio files Web Audio can't decode — wraps an
 * `HTMLAudioElement` through a `MediaElementAudioSourceNode` so it still
 * routes through the master gain bus.
 *
 * Where it runs: renderer.
 * Depends on: Web Audio API + HTMLAudioElement, plus the `ITrackPlayer`
 *   interface.
 * Used by:    `AudioEngine`'s `makeTrackPlayer` factory uses this only if
 *   `decodeAudioData` rejects the file (some AIFF variants, ADPCM WAV,
 *   ALAC sometimes).
 *
 * Limitations vs the buffer player (reflected in `capabilities`):
 *  - No reverse playback.
 *  - No A-B region looping — only whole-track loop via `audio.loop`.
 *  - No loudness analysis (we never have the samples in memory).
 *  The UI checks `capabilities` and disables the affected controls.
 */

import type { ITrackPlayer, PlayerCapabilities, TrackPlayerOptions } from './TrackPlayer';

export class MediaTrackPlayer implements ITrackPlayer {
  readonly capabilities: PlayerCapabilities = { reverse: false, abLoop: false, loudnessAnalysis: false };
  readonly context: AudioContext;
  readonly destination: AudioNode;
  readonly url: string;
  private audio: HTMLAudioElement;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode;
  private _normalization = 1;
  private _volume = 1;
  private rafId: number | null = null;
  private onEndedCb?: () => void;
  private onTimeCb?: (t: number) => void;
  private _loopRegion: { start: number; end: number } | null = null;
  destroyed = false;

  constructor(opts: TrackPlayerOptions) {
    this.context = opts.context;
    this.destination = opts.destination;
    this.url = opts.url;
    this.onEndedCb = opts.onEnded;
    this.onTimeCb = opts.onTimeUpdate;
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'auto';
    this.audio.src = opts.url;
    this.gainNode = this.context.createGain();
    this.gainNode.connect(this.destination);
    this.audio.addEventListener('ended', () => {
      if (this.destroyed) return;
      this.stopRaf();
      this.onEndedCb?.();
    });
  }

  async load(): Promise<void> {
    // Wait for enough metadata that duration is available.
    if (Number.isFinite(this.audio.duration) && this.audio.duration > 0) return;
    await new Promise<void>((resolve, reject) => {
      const onMeta = () => { cleanup(); resolve(); };
      const onError = () => {
        cleanup();
        const code = this.audio.error?.code;
        const msg = code === 4
          ? "This file's format isn't supported by the system audio decoder either"
          : "Couldn't load file";
        reject(new Error(msg));
      };
      const cleanup = () => {
        this.audio.removeEventListener('loadedmetadata', onMeta);
        this.audio.removeEventListener('error', onError);
      };
      this.audio.addEventListener('loadedmetadata', onMeta);
      this.audio.addEventListener('error', onError);
      this.audio.load();
    });
    // Connect through MediaElementAudioSourceNode now that we know it'll play.
    this.mediaSource = this.context.createMediaElementSource(this.audio);
    this.mediaSource.connect(this.gainNode);
  }

  get duration(): number { return Number.isFinite(this.audio.duration) ? this.audio.duration : 0; }
  get isPlaying(): boolean { return !this.audio.paused && !this.audio.ended; }
  get currentTime(): number { return this.audio.currentTime; }
  get playbackRate(): number { return this.audio.playbackRate; }
  get reversed(): boolean { return false; }
  get volume(): number { return this._volume; }
  get loopRegion() { return this._loopRegion; }

  setPlaybackRate(r: number) { this.audio.playbackRate = Math.max(0.1, Math.min(4, r)); }
  setReversed(_rev: boolean) { /* unsupported */ }
  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    this.applyGain();
  }
  setNormalizationGain(linear: number) {
    this._normalization = Math.max(0.05, Math.min(8, linear));
    this.applyGain();
  }
  private applyGain() {
    this.gainNode.gain.value = this._volume * this._normalization;
  }
  setLoopRegion(region: { start: number; end: number } | null) {
    // MediaElementAudioSourceNode supports only whole-track loop. Honor an
    // A-B intent as best we can: if a region is set, set audio.loop=true so
    // the file repeats; if it isn't set, audio.loop=false. (The store treats
    // this as a "repeat-current" behavior for fallback files.)
    this._loopRegion = region;
    this.audio.loop = !!region;
  }

  play(fromSec?: number) {
    if (this.destroyed) return;
    if (typeof fromSec === 'number') this.audio.currentTime = fromSec;
    void this.audio.play().catch(() => {});
    this.startRaf();
  }
  pause() { this.audio.pause(); this.stopRaf(); }
  seek(t: number) {
    const clamped = Math.max(0, Math.min(this.duration || t, t));
    this.audio.currentTime = clamped;
  }
  stop() { this.audio.pause(); this.audio.currentTime = 0; this.stopRaf(); }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.audio.pause();
    this.audio.src = '';
    try { this.mediaSource?.disconnect(); } catch {}
    try { this.gainNode.disconnect(); } catch {}
    this.stopRaf();
  }

  private startRaf() {
    const tick = () => {
      if (this.destroyed || this.audio.paused) return;
      this.onTimeCb?.(this.audio.currentTime);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }
  private stopRaf() {
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }

  computeNormalizationGain(_targetDbFs?: number): number { return 1; }
}
