/**
 * The audio engine — owns the single `AudioContext`, the master gain
 * node, the primary track player (what the main player bar drives), and
 * the small collection of "collage" players that Multi-Track stacks on
 * top.
 *
 * Where it runs: renderer.
 * Depends on: `BufferTrackPlayer` (primary backend), `MediaTrackPlayer`
 *   (fallback backend), the `ITrackPlayer` interface.
 * Used by:    `src/store/library.ts` calls `getEngine()` to access the
 *   singleton; `src/components/MultiTrackPanel.tsx` does the same for
 *   the collage layer.
 *
 * Notes:
 *  - `makeTrackPlayer` tries the buffer backend first. If decoding fails
 *    for a format reason (not a network/filesystem reason), it falls
 *    back to a media-element player. The factory returns the
 *    `ITrackPlayer` interface so callers don't need to care which.
 *  - `loadGen` is a load-generation counter: every call to
 *    `loadPrimary` bumps it. If you click track A then immediately
 *    click track B, A's load can complete after we've already started
 *    loading B — without the gen check, A's player would end up routed
 *    to master and bleed audio. The check rejects A with
 *    `LoadSupersededError` so the caller knows to discard it.
 *  - `getEngine()` is a module-level singleton: a fresh `AudioContext`
 *    every time would burn audio-thread resources for nothing. One
 *    context is enough for the whole app.
 */

import type { ITrackPlayer, TrackPlayerOptions } from './TrackPlayer';
import { BufferTrackPlayer } from './BufferTrackPlayer';
import { MediaTrackPlayer } from './MediaTrackPlayer';

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
