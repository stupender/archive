/**
 * Full-featured AudioBuffer-based player — decodes the whole file into
 * memory and drives an `AudioBufferSourceNode`. This is the primary
 * backend, used for any file Web Audio can decode (`.wav`, `.aiff`,
 * `.flac`, `.mp3`, `.m4a` with AAC, …).
 *
 * Where it runs: renderer.
 * Depends on: Web Audio API only, plus the `ITrackPlayer` interface.
 * Used by:    `AudioEngine`'s `makeTrackPlayer` factory tries this first.
 *
 * Features (what this backend can do that the media-element fallback can't):
 *  - Sample-accurate A-B looping with live loop-bound updates while playing.
 *  - Reverse playback (we generate a reversed copy of the buffer lazily).
 *  - RMS-based loudness analysis for normalization.
 *  - Continuous, click-free rate changes (with time-base rebasing so the
 *    visible playhead stays in sync — see `setPlaybackRate`).
 *
 * Time-keeping (the subtle part):
 *  - `startedFrom` = the buffer offset the current source was started at.
 *  - `startedAtCtx` = the audio-context time when the current source started.
 *  - `currentTime = projectSourcePosition(startedFrom, elapsed, …)` —
 *    mirrors the source's actual sample position including loop wrapping.
 *  - Any inflection that changes the source's *future* behavior (rate
 *    change, loop bounds change, reverse) rebases `startedFrom` and
 *    `startedAtCtx` so the projection stays accurate. Without that,
 *    elapsed wall-clock time gets retroactively reinterpreted under the
 *    new rule and the visible playhead drifts.
 */

import type { ITrackPlayer, PlayerCapabilities, TrackPlayerOptions } from './TrackPlayer';

/** Compute the source's actual playhead position given its start offset,
 *  the audio time elapsed since it started, and the loop bounds.
 *
 *  Mirrors AudioBufferSourceNode's real behavior:
 *    - source plays linearly from startedFrom in its direction of travel,
 *    - on reaching the loop boundary in that direction, it wraps,
 *    - subsequent positions are modular within the loop.
 *
 *  The "pre-loop" branch (raw still on the start-side of the wrap point) is
 *  what keeps the visible playhead matching the audio when the loop bounds
 *  are moved mid-playback to a region the audio hasn't entered yet. Plain
 *  modular wrap would teleport the visual to a misleading spot inside the
 *  new region while the audio source is actually still en route to it. */
function projectSourcePosition(
  startedFrom: number,
  elapsed: number,
  reversed: boolean,
  loop: { start: number; end: number } | null,
  duration: number,
): number {
  const raw = reversed ? startedFrom - elapsed : startedFrom + elapsed;
  if (!loop) {
    return reversed ? Math.max(0, raw) : Math.min(duration, raw);
  }
  const { start, end } = loop;
  const len = end - start;
  if (len <= 0) return Math.max(start, Math.min(end, raw));
  if (!reversed) {
    // Forward: source plays linearly until raw reaches loopEnd, then wraps.
    if (raw <= end) return Math.max(0, raw);
    const over = raw - end;
    return start + (over % len);
  } else {
    // Reverse: source travels downward; wraps when raw reaches loopStart.
    if (raw >= start) return Math.min(duration, raw);
    const under = start - raw;
    return end - (under % len);
  }
}

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
    return projectSourcePosition(this.startedFrom, elapsed, this._reversed, this._loopRegion, this.duration);
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
    // Snapshot the audio source's *actual* current sample position before
    // changing _loopRegion — currentTime reads _loopRegion, so this MUST
    // happen first. We use this as the new time reference below.
    const isLive = this.source && this.playing;
    const actualPosBeforeChange = isLive ? this.currentTime : null;

    if (region) {
      const start = Math.max(0, Math.min(this.duration, region.start));
      const end = Math.max(start + 0.05, Math.min(this.duration, region.end));
      this._loopRegion = { start, end };
    } else {
      this._loopRegion = null;
    }

    if (isLive) {
      // Rebase our time reference to the audio's actual current position.
      // Changing the source's loop bounds doesn't move its sample cursor —
      // it only changes where it will wrap next. We rebase so the new
      // currentTime calculation starts from where the source really is,
      // and matches the source's behavior going forward.
      if (actualPosBeforeChange !== null) {
        this.startedFrom = actualPosBeforeChange;
        this.startedAtCtx = this.context.currentTime;
      }

      // Update the running source's loop bounds in place — avoids creating a
      // new BufferSourceNode on every mousemove during a loop-handle drag.
      this.applyLoopBoundsToSource(this.source!);

      // Snap only when the playhead is *past* the loop in its direction of
      // travel — the source would otherwise play to the buffer end (or
      // behave inconsistently). When the playhead is *before* the loop in
      // its direction of travel, leave it alone: the source will reach the
      // loop boundary on its own and the smart wrap will follow it.
      if (this._loopRegion) {
        const pos = this.startedFrom;
        const past = this._reversed
          ? pos < this._loopRegion.start
          : pos > this._loopRegion.end;
        if (past) {
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
