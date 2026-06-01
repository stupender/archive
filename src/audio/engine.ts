/**
 * Web Audio playback engine.
 *
 * Two backends are supported behind a common ITrackPlayer interface:
 *
 *   1. BufferTrackPlayer — decodes the file into an AudioBuffer and uses an
 *      AudioBufferSourceNode. Supports the full feature set: speed, reverse,
 *      A-B looping at sample accuracy, RMS-based loudness analysis.
 *
 *   2. MediaTrackPlayer — falls back to an HTMLAudioElement piped through a
 *      MediaElementAudioSourceNode. Used when decodeAudioData rejects the
 *      file (e.g. some AIFF variants, ADPCM WAV, ALAC). Limited features:
 *      play / pause / seek / speed / volume / whole-track loop. No reverse,
 *      no A-B loop region — those are gracefully disabled in the UI.
 *
 * AudioEngine uses a load-generation counter so that rapid back-to-back play
 * requests can't leave an orphaned source node bleeding through the master
 * bus.
 */

/** Wrap a position into [start, end) using modular arithmetic. Handles
 *  positions past either end so the visible playhead matches the audio
 *  source's wrap behavior, regardless of direction. */
function wrapInRange(pos: number, start: number, end: number): number {
  const len = end - start;
  if (len <= 0) return Math.max(start, Math.min(end, pos));
  let rel = (pos - start) % len;
  if (rel < 0) rel += len;
  return start + rel;
}

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

/* ========================================================================== */
/*  BufferTrackPlayer — full-featured AudioBuffer-based playback              */
/* ========================================================================== */

export class BufferTrackPlayer implements ITrackPlayer {
  readonly capabilities: PlayerCapabilities = { reverse: true, abLoop: true, loudnessAnalysis: true };
  readonly context: AudioContext;
  readonly destination: AudioNode;
  readonly url: string;
  private gainNode: GainNode;
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private reversedBuffer: AudioBuffer | null = null;
  private startedAtCtx = 0;
  private startedFrom = 0;
  private playing = false;
  private _playbackRate = 1;
  private _reversed = false;
  private _volume = 1;
  private _normalization = 1;
  private _loopRegion: { start: number; end: number } | null = null;
  private rafId: number | null = null;
  private onEndedCb?: () => void;
  private onTimeCb?: (t: number) => void;
  private endedDueToInternalStop = false;
  destroyed = false;

  constructor(opts: TrackPlayerOptions) {
    this.context = opts.context;
    this.destination = opts.destination;
    this.url = opts.url;
    this.onEndedCb = opts.onEnded;
    this.onTimeCb = opts.onTimeUpdate;
    this.gainNode = this.context.createGain();
    this.gainNode.connect(this.destination);
  }

  async load(): Promise<void> {
    if (this.buffer) return;
    let res: Response;
    try {
      res = await fetch(this.url);
    } catch (err: any) {
      throw new Error(`Couldn't fetch file: ${err?.message || err}`);
    }
    if (!res.ok) throw new Error(`Couldn't fetch file (status ${res.status})`);
    const arr = await res.arrayBuffer();
    this.buffer = await this.context.decodeAudioData(arr);
  }

  get duration(): number { return this.buffer?.duration ?? 0; }
  get isPlaying(): boolean { return this.playing; }
  get currentTime(): number {
    if (!this.playing) return this.startedFrom;
    const elapsed = (this.context.currentTime - this.startedAtCtx) * this._playbackRate;
    let pos = this._reversed ? this.startedFrom - elapsed : this.startedFrom + elapsed;
    if (this._loopRegion) {
      // Mirror the source's actual wrapping behavior. Without this, after the
      // audio loops in the audio thread, the visible playhead keeps marching
      // past loopEnd because we were just doing linear elapsed time.
      pos = wrapInRange(pos, this._loopRegion.start, this._loopRegion.end);
    } else if (this._reversed) {
      pos = Math.max(0, pos);
    } else {
      pos = Math.min(this.duration, pos);
    }
    return pos;
  }

  get playbackRate(): number { return this._playbackRate; }
  setPlaybackRate(r: number) {
    const newRate = Math.max(0.1, Math.min(4, r));
    if (newRate === this._playbackRate) return;
    // Rebase the time reference so currentTime stays continuous across the
    // rate change. Without this, our getter retroactively applies the new
    // rate to the *entire* elapsed period since startedAtCtx — making the
    // visible playhead jump and desync from the actual audio (especially
    // visible inside a loop, where the audio loops at the source's bounds
    // but our linear calculation has skipped ahead).
    if (this.playing) {
      const pos = this.currentTime;
      this.startedFrom = pos;
      this.startedAtCtx = this.context.currentTime;
    }
    this._playbackRate = newRate;
    if (this.source) this.source.playbackRate.value = newRate;
  }

  get reversed(): boolean { return this._reversed; }
  setReversed(rev: boolean) {
    if (rev === this._reversed) return;
    const wasPlaying = this.playing;
    const pos = this.currentTime;
    this._reversed = rev;
    if (rev && !this.reversedBuffer && this.buffer) this.reversedBuffer = this.makeReversed(this.buffer);
    this.stopSource();
    if (wasPlaying) this.play(pos);
    else this.startedFrom = pos;
  }

  get volume(): number { return this._volume; }
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

  get loopRegion(): { start: number; end: number } | null { return this._loopRegion; }
  setLoopRegion(region: { start: number; end: number } | null) {
    if (region) {
      const start = Math.max(0, Math.min(this.duration, region.start));
      const end = Math.max(start + 0.05, Math.min(this.duration, region.end));
      this._loopRegion = { start, end };
    } else {
      this._loopRegion = null;
    }

    if (this.source && this.playing) {
      // Update the running source's loop bounds in place — avoids creating a
      // new BufferSourceNode on every mousemove during a loop-handle drag.
      this.applyLoopBoundsToSource(this.source);

      // If the playhead is now outside the region, restart at the boundary so
      // the visible playhead "follows" the loop edge as the user drags it.
      if (this._loopRegion) {
        const pos = this.currentTime;
        if (pos < this._loopRegion.start || pos > this._loopRegion.end) {
          this.stopSource();
          const target = this._reversed ? this._loopRegion.end : this._loopRegion.start;
          this.play(target);
        }
      }
    } else if (!this.playing && this._loopRegion) {
      // Paused: clamp the saved start position so it doesn't sit outside the
      // new region. Without this, dragging the loop past a paused playhead
      // would leave the playhead "behind" the loop start.
      if (this.startedFrom < this._loopRegion.start) {
        this.startedFrom = this._loopRegion.start;
      } else if (this.startedFrom > this._loopRegion.end) {
        this.startedFrom = this._loopRegion.end;
      }
    }
  }

  /** Apply current loop state to a source. Used both when starting a new
   *  source in play() and when updating an already-running source in
   *  setLoopRegion. */
  private applyLoopBoundsToSource(src: AudioBufferSourceNode) {
    if (!this._loopRegion) {
      src.loop = false;
      return;
    }
    src.loop = true;
    const wholeBuffer =
      this._loopRegion.start <= 0.001 &&
      this._loopRegion.end >= this.duration - 0.001;
    if (wholeBuffer) {
      // Defaults (0/0) tell the node to loop the entire buffer reliably.
      src.loopStart = 0;
      src.loopEnd = 0;
    } else if (!this._reversed) {
      src.loopStart = this._loopRegion.start;
      src.loopEnd = this._loopRegion.end;
    } else {
      src.loopStart = this.duration - this._loopRegion.end;
      src.loopEnd = this.duration - this._loopRegion.start;
    }
  }

  play(fromSec?: number) {
    if (!this.buffer || this.destroyed) return;
    if (this.playing) this.stopSource();
    const buf = this._reversed ? this.reversedBuffer ?? (this.reversedBuffer = this.makeReversed(this.buffer)) : this.buffer;
    const src = this.context.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = this._playbackRate;
    src.connect(this.gainNode);

    let startOffset: number;
    if (this._reversed) {
      const t = fromSec ?? (this.startedFrom || this.duration);
      this.startedFrom = t;
      startOffset = this.duration - t;
    } else {
      const t = fromSec ?? this.startedFrom;
      this.startedFrom = t;
      startOffset = t;
    }

    if (this._loopRegion) {
      if (this.startedFrom < this._loopRegion.start || this.startedFrom > this._loopRegion.end) {
        const target = this._reversed ? this._loopRegion.end : this._loopRegion.start;
        this.startedFrom = target;
        startOffset = this._reversed ? (this.duration - target) : target;
      }
      this.applyLoopBoundsToSource(src);
    }

    src.onended = () => {
      if (this.endedDueToInternalStop) { this.endedDueToInternalStop = false; return; }
      if (src === this.source) {
        this.playing = false;
        this.source = null;
        this.stopRaf();
        this.onEndedCb?.();
      }
    };

    this.source = src;
    this.startedAtCtx = this.context.currentTime;
    this.playing = true;
    src.start(0, startOffset);
    this.startRaf();
  }

  pause() {
    if (!this.playing) return;
    const pos = this.currentTime;
    this.stopSource();
    this.startedFrom = pos;
  }

  seek(t: number) {
    const clamped = Math.max(0, Math.min(this.duration, t));
    if (this.playing) this.play(clamped);
    else this.startedFrom = clamped;
  }

  stop() {
    this.stopSource();
    this.startedFrom = 0;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopSource();
    try { this.gainNode.disconnect(); } catch {}
    this.buffer = null;
    this.reversedBuffer = null;
  }

  private stopSource() {
    if (this.source) {
      this.endedDueToInternalStop = true;
      try { this.source.stop(); } catch {}
      try { this.source.disconnect(); } catch {}
      this.source = null;
    }
    this.playing = false;
    this.stopRaf();
  }

  private startRaf() {
    const tick = () => {
      if (!this.playing) return;
      this.onTimeCb?.(this.currentTime);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopRaf() {
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }

  computeNormalizationGain(targetDbFs = -18): number {
    if (!this.buffer) return 1;
    const buf = this.buffer;
    const channels = buf.numberOfChannels;
    const len = buf.length;
    const chunkSize = 4096;
    const chunkRMS: number[] = [];
    for (let start = 0; start < len; start += chunkSize) {
      const end = Math.min(start + chunkSize, len);
      let sumSq = 0;
      for (let c = 0; c < channels; c++) {
        const data = buf.getChannelData(c);
        for (let i = start; i < end; i++) sumSq += data[i] * data[i];
      }
      chunkRMS.push(Math.sqrt(sumSq / (channels * (end - start))));
    }
    if (chunkRMS.length === 0) return 1;
    chunkRMS.sort((a, b) => b - a);
    const idx = Math.floor(chunkRMS.length * 0.10);
    const measuredRms = chunkRMS[Math.min(idx, chunkRMS.length - 1)];
    if (measuredRms < 1e-6) return 1;
    const measuredDb = 20 * Math.log10(measuredRms);
    const linearGain = Math.pow(10, (targetDbFs - measuredDb) / 20);
    return Math.max(0.1, Math.min(4, linearGain));
  }

  private makeReversed(buf: AudioBuffer): AudioBuffer {
    const out = this.context.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const src = buf.getChannelData(c);
      const dst = out.getChannelData(c);
      const n = src.length;
      for (let i = 0; i < n; i++) dst[i] = src[n - 1 - i];
    }
    return out;
  }
}

/* ========================================================================== */
/*  MediaTrackPlayer — fallback for files decodeAudioData can't handle        */
/* ========================================================================== */

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

/* ========================================================================== */
/*  Engine                                                                    */
/* ========================================================================== */

/** Try the buffer backend first; on decode failure, fall back to media-element. */
export async function makeTrackPlayer(opts: TrackPlayerOptions): Promise<ITrackPlayer> {
  const buf = new BufferTrackPlayer(opts);
  try {
    await buf.load();
    return buf;
  } catch (err: any) {
    buf.destroy();
    // Fall through to MediaElement only if it's a decode/format issue, not a
    // network/filesystem issue.
    const msg = String(err?.message || err);
    if (msg.startsWith("Couldn't fetch")) throw err;
    const media = new MediaTrackPlayer(opts);
    try {
      await media.load();
      return media;
    } catch (mediaErr) {
      media.destroy();
      throw mediaErr;
    }
  }
}

export class AudioEngine {
  readonly context: AudioContext;
  readonly master: GainNode;
  primary: ITrackPlayer | null = null;
  collage: ITrackPlayer[] = [];
  private loadGen = 0;
  private _masterVolume = 1;

  constructor() {
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.connect(this.context.destination);
  }

  async ensureRunning() {
    if (this.context.state === 'suspended') await this.context.resume();
  }

  setMasterVolume(v: number) {
    this._masterVolume = Math.max(0, Math.min(1, v));
    this.master.gain.value = this._masterVolume;
  }

  get masterVolume() { return this._masterVolume; }

  async loadPrimary(
    url: string,
    opts: { onEnded?: () => void; onTimeUpdate?: (t: number) => void } = {},
  ): Promise<ITrackPlayer> {
    const gen = ++this.loadGen;
    if (this.primary) {
      this.primary.destroy();
      this.primary = null;
    }
    const player = await makeTrackPlayer({
      url,
      context: this.context,
      destination: this.master,
      onEnded: opts.onEnded,
      onTimeUpdate: opts.onTimeUpdate,
    });
    if (gen !== this.loadGen) {
      player.destroy();
      throw new LoadSupersededError();
    }
    this.primary = player;
    return player;
  }

  unloadPrimary() {
    this.loadGen++;
    if (this.primary) {
      this.primary.destroy();
      this.primary = null;
    }
  }

  async addCollagePlayer(url: string): Promise<ITrackPlayer> {
    const player = await makeTrackPlayer({ url, context: this.context, destination: this.master });
    this.collage.push(player);
    return player;
  }

  clearCollage() {
    for (const p of this.collage) p.destroy();
    this.collage = [];
  }

  removeCollagePlayer(idx: number) {
    const p = this.collage[idx];
    if (p) {
      p.destroy();
      this.collage.splice(idx, 1);
    }
  }
}

export class LoadSupersededError extends Error {
  constructor() { super('superseded'); this.name = 'LoadSupersededError'; }
}

let engineSingleton: AudioEngine | null = null;
export function getEngine(): AudioEngine {
  if (!engineSingleton) engineSingleton = new AudioEngine();
  return engineSingleton;
}

/** Back-compat alias so existing imports continue to type-check. */
export type TrackPlayer = ITrackPlayer;
