/**
 * Playback slice — the main player bar. Everything tied to "the one
 * currently playing track."
 *
 * Where it runs: renderer.
 * Owns these State fields: `currentTrack`, `currentTime`, `isPlaying`,
 *   `duration`, `playbackRate`, `reversed`, `loopRegion`, `loopActive`,
 *   `shuffle`, `volume`, `queue`, `queueIndex`, `primaryCanReverse`,
 *   `primaryCanABLoop`, plus all the transport actions.
 *
 * Notes:
 *  - The audio engine is the source of truth for what's actually
 *    playing; this slice mirrors that into store state so the UI can
 *    react. `playTrack` is the one place where a track is loaded into
 *    the engine and store state is wired up.
 *  - `setLoopRegion` mirrors the engine's `currentTime` back into store
 *    state immediately after applying loop bounds — the engine may have
 *    just snapped the playhead to a boundary (see
 *    `BufferTrackPlayer.setLoopRegion`).
 *  - `sendCurrentToMultiTrack` takes whatever's playing — track, loop
 *    region, speed, reverse — and adds it as a new layer in the
 *    collage. It crosses into the collage slice via `get().addToCollage`,
 *    then patches the new collage row.
 *  - `LoadSupersededError` is silently swallowed so a quick second
 *    click on a different track doesn't toast an error about the first
 *    load that got canceled mid-flight.
 */

import type { StoreApi } from 'zustand';
import type { State, CollageTrackState } from '../library';
import { getEngine, LoadSupersededError, PermissionDeniedError } from '../../audio/AudioEngine';

type Set = StoreApi<State>['setState'];
type Get = StoreApi<State>['getState'];

const sonic = () => window.sonic;

const NORMALIZATION_TARGET_DB = -18;

export type PlaybackSlice = Pick<State,
  | 'currentTrack'
  | 'currentTime'
  | 'isPlaying'
  | 'duration'
  | 'playbackRate'
  | 'reversed'
  | 'loopRegion'
  | 'loopActive'
  | 'shuffle'
  | 'volume'
  | 'queue'
  | 'queueIndex'
  | 'primaryCanReverse'
  | 'primaryCanABLoop'
  | 'playTrack'
  | 'togglePlay'
  | 'next'
  | 'previous'
  | 'seek'
  | 'setPlaybackRate'
  | 'setReversed'
  | 'setLoopRegion'
  | 'setLoopActive'
  | 'setLoopStart'
  | 'setLoopEnd'
  | 'setShuffle'
  | 'setVolume'
  | 'stopPlayback'
  | 'sendCurrentToMultiTrack'
>;

export function createPlaybackSlice(set: Set, get: Get): PlaybackSlice {
  return {
    currentTrack: null,
    currentTime: 0,
    isPlaying: false,
    duration: 0,
    playbackRate: 1,
    reversed: false,
    loopRegion: null,
    loopActive: false,
    shuffle: false,
    volume: 1,
    queue: [],
    queueIndex: -1,
    primaryCanReverse: true,
    primaryCanABLoop: true,

    playTrack: async (t, queue) => {
      try {
        const engine = getEngine();
        await engine.ensureRunning();
        const url = sonic().toMediaUrl(t.path);
        const player = await engine.loadPrimary(url, {
          onEnded: () => get().next(),
          onTimeUpdate: (currentTime) => set({ currentTime }),
        });

        // Apply known normalization gain immediately, or compute it in the
        // background on first play so the next play is instant.
        if (t.loudnessGain != null) {
          player.setNormalizationGain(t.loudnessGain);
        } else if (player.capabilities.loudnessAnalysis) {
          // Compute synchronously — it's fast enough on a typical buffer
          // (a few ms per minute of audio).
          const gain = player.computeNormalizationGain(NORMALIZATION_TARGET_DB);
          player.setNormalizationGain(gain);
          sonic().setLoudnessGain(t.id, gain).catch(() => {});
        }

        player.setVolume(get().volume);
        player.setPlaybackRate(get().playbackRate);
        // Reverse can't apply to media-element players; UI reflects this via
        // primaryCanReverse.
        if (player.capabilities.reverse && get().reversed) player.setReversed(true);
        // Apply current loop intent
        if (get().loopActive && get().loopRegion && player.capabilities.abLoop) {
          player.setLoopRegion(get().loopRegion);
        }
        player.play(0);

        const q = queue ?? get().tracks;
        const idx = q.findIndex((x) => x.id === t.id);

        set({
          currentTrack: t,
          duration: player.duration,
          isPlaying: true,
          currentTime: 0,
          loopRegion: get().loopActive ? { start: 0, end: player.duration } : null,
          queue: q,
          queueIndex: idx,
          primaryCanReverse: player.capabilities.reverse,
          primaryCanABLoop: player.capabilities.abLoop,
          // If we just loaded a fallback player while reverse was on, reset.
          reversed: player.capabilities.reverse ? get().reversed : false,
        });

        sonic().logPlay({
          trackId: t.id,
          startedAt: Date.now(),
          startPosition: 0,
          duration: 0,
          mode: 'whole',
          sliceLength: null,
        });
      } catch (err: any) {
        if (err instanceof LoadSupersededError) return; // silently
        if (err instanceof PermissionDeniedError) {
          // macOS TCC denied access — usually external drive on an
          // unsigned build. Open the persistent banner instead of a toast
          // since the user has to take action (System Settings) to fix.
          get().openPermissionsBanner(err.path ?? t.path);
          return;
        }
        console.error('playTrack failed:', err);
        set({ toast: { kind: 'error', message: `Couldn't play "${t.title}": ${err?.message || err}` } });
        // Mark un-decodable so we don't keep tripping on it
        if (String(err?.message || '').includes("isn't a decodable")) {
          sonic().markDecodeFailed(t.id).catch(() => {});
        }
      }
    },

    togglePlay: async () => {
      const engine = getEngine();
      const state = get();
      // Nothing loaded yet — start the first track in the current view (or a
      // random one if shuffle is on). Lets Spacebar work as a "start playing"
      // shortcut even before the user has clicked a row.
      if (!engine.primary || !state.currentTrack) {
        const tracks = state.tracks;
        if (tracks.length === 0) return;
        const first = state.shuffle
          ? tracks[Math.floor(Math.random() * tracks.length)]
          : tracks[0];
        await get().playTrack(first, tracks);
        return;
      }
      await engine.ensureRunning();
      const player = engine.primary;
      if (player.isPlaying) {
        player.pause();
        set({ isPlaying: false });
      } else {
        player.play();
        set({ isPlaying: true });
      }
    },

    next: async () => {
      const { queue, queueIndex, shuffle } = get();
      if (queue.length === 0) return;
      let nextIdx: number;
      if (shuffle) {
        nextIdx = Math.floor(Math.random() * queue.length);
        if (nextIdx === queueIndex && queue.length > 1) nextIdx = (nextIdx + 1) % queue.length;
      } else {
        nextIdx = queueIndex + 1;
      }
      if (queue[nextIdx]) {
        await get().playTrack(queue[nextIdx], queue);
      } else {
        set({ isPlaying: false });
      }
    },

    previous: async () => {
      const { queue, queueIndex, currentTime } = get();
      if (currentTime > 3 && queue[queueIndex]) {
        get().seek(0);
        return;
      }
      const prevIdx = queueIndex - 1;
      if (queue[prevIdx]) {
        await get().playTrack(queue[prevIdx], queue);
      } else {
        get().seek(0);
      }
    },

    seek: (t) => {
      getEngine().primary?.seek(t);
      set({ currentTime: t });
    },

    setPlaybackRate: (r) => {
      set({ playbackRate: r });
      getEngine().primary?.setPlaybackRate(r);
    },

    setReversed: (b) => {
      set({ reversed: b });
      getEngine().primary?.setReversed(b);
    },

    setLoopRegion: (r) => {
      set({ loopRegion: r });
      const player = getEngine().primary;
      if (get().loopActive && player) {
        player.setLoopRegion(r);
        // The engine may have just snapped the playhead to a region boundary
        // (e.g. dragging the loop start past the current playback position).
        // Mirror that snap into the store immediately so the visible playhead
        // follows the loop edge — no waiting for the next RAF tick.
        set({ currentTime: player.currentTime });
      }
    },

    setLoopActive: (b) => {
      const s = get();
      if (b) {
        // Always default to the full song when engaging — predictable behavior
        // each time the loop is turned on.
        const region = s.duration ? { start: 0, end: s.duration } : null;
        set({ loopActive: true, loopRegion: region });
        getEngine().primary?.setLoopRegion(region);
      } else {
        set({ loopActive: false, loopRegion: null });
        getEngine().primary?.setLoopRegion(null);
      }
    },

    setLoopStart: () => {
      const s = get();
      if (!s.duration) return;
      const start = s.currentTime;
      // If we already had a region keep its end (clamped > start); otherwise
      // anchor to song end so "Start" pins down the front of a whole-song loop.
      const end = s.loopRegion ? Math.max(start + 0.1, s.loopRegion.end) : s.duration;
      const region = { start, end };
      set({ loopRegion: region, loopActive: true });
      getEngine().primary?.setLoopRegion(region);
    },

    setLoopEnd: () => {
      const s = get();
      if (!s.duration) return;
      const end = s.currentTime;
      const start = s.loopRegion ? Math.min(end - 0.1, s.loopRegion.start) : 0;
      const region = { start, end };
      set({ loopRegion: region, loopActive: true });
      getEngine().primary?.setLoopRegion(region);
    },

    setShuffle: (b) => set({ shuffle: b }),

    setVolume: (v) => {
      set({ volume: v });
      getEngine().primary?.setVolume(v);
      for (const p of getEngine().collage) p.setVolume(v);
    },

    stopPlayback: () => {
      getEngine().unloadPrimary();
      set({
        isPlaying: false,
        currentTrack: null,
        currentTime: 0,
        duration: 0,
        loopRegion: null,
        loopActive: false,
      });
    },

    sendCurrentToMultiTrack: async () => {
      const s = get();
      const track = s.currentTrack;
      if (!track) {
        set({ toast: { kind: 'info', message: 'Nothing playing to send' } });
        return;
      }
      if (s.collageTracks.length >= 5) {
        set({ toast: { kind: 'info', message: 'Multi-Track is full (5 max). Remove one first.' } });
        return;
      }

      const loopRegion = s.loopActive ? s.loopRegion : null;
      const playbackRate = s.playbackRate;
      const reversed = s.reversed;
      const startPos = loopRegion ? loopRegion.start : 0;

      await get().addToCollage(track);
      const idx = get().collageTracks.length - 1;
      const player = getEngine().collage[idx];
      if (player) {
        player.setPlaybackRate(playbackRate);
        if (reversed && player.capabilities.reverse) player.setReversed(true);
        if (loopRegion && player.capabilities.abLoop) {
          player.setLoopRegion(loopRegion);
        }
        player.seek(startPos);
        const next = [...get().collageTracks];
        if (next[idx]) {
          const patch: Partial<CollageTrackState> = {
            playbackRate,
            reversed,
            loopRegion,
            loopActive: !!loopRegion,
            currentTime: startPos,
          };
          next[idx] = { ...next[idx], ...patch };
          set({ collageTracks: next });
        }
      }
      await get().setView({ kind: 'multi-track' });
      set({ toast: { kind: 'info', message: loopRegion ? `Loop sent to Multi-Track` : `Sent "${track.title}" to Multi-Track` } });
    },
  };
}
