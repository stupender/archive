/**
 * Random Review slice — the "surface forgotten tracks" mode. Picks one
 * random track from the active library scope and plays either the
 * whole thing or a short slice. Pressing "next random" picks again.
 *
 * Where it runs: renderer.
 * Owns these State fields: `randomMode`, plus `pickRandom` and
 *   `switchToFullPlay`.
 *
 * Notes:
 *  - `randomMode` is either `'whole'` or a number (slice length in
 *    seconds — 5, 15, 30, etc.). In slice mode, an `onTimeUpdate`
 *    callback watches for the slice end and triggers the next pick.
 *  - A `queue` is built up from picked tracks (capped at 200) so the
 *    user can use the previous/next buttons to navigate the random
 *    history afterwards.
 *  - `switchToFullPlay` is the "actually, keep listening to this one"
 *    button — switches from slice mode to whole-track mode without
 *    re-picking.
 */

import type { StoreApi } from 'zustand';
import type { FilterOptions } from '@shared/types';
import type { State } from '../library';
import { getEngine, LoadSupersededError, PermissionDeniedError } from '../../audio/AudioEngine';

type Set = StoreApi<State>['setState'];
type Get = StoreApi<State>['getState'];

const sonic = () => window.sonic;

const NORMALIZATION_TARGET_DB = -18;

export type RandomSlice = Pick<State,
  | 'randomMode'
  | 'setRandomMode'
  | 'pickRandom'
  | 'switchToFullPlay'
>;

export function createRandomSlice(set: Set, get: Get): RandomSlice {
  return {
    randomMode: 'whole',

    setRandomMode: (m) => set({ randomMode: m }),

    pickRandom: async () => {
      try {
        // Random pick uses the active library scope only.
        const filter: FilterOptions = {};
        if (get().activeLibraryIds.length > 0) filter.libraryIds = get().activeLibraryIds;

        const t = await sonic().randomTracks(1, filter);
        if (!t) return;
        const track = Array.isArray(t) ? t[0] : t;
        if (!track) return;

        const mode = get().randomMode;
        const engine = getEngine();
        await engine.ensureRunning();
        const url = sonic().toMediaUrl(track.path);

        let sliceEnd: number | null = null;
        const player = await engine.loadPrimary(url, {
          // When the track naturally ends, pick another. (For slice mode the
          // slice-end check in onTimeUpdate normally fires first; this onEnded
          // is just the fallback when a slice extends to the end of the file.)
          onEnded: () => get().pickRandom(),
          onTimeUpdate: (currentTime) => {
            set({ currentTime });
            if (sliceEnd != null && currentTime >= sliceEnd) {
              // Slice complete — pick another
              sliceEnd = null;
              get().pickRandom();
            }
          },
        });

        if (track.loudnessGain != null) {
          player.setNormalizationGain(track.loudnessGain);
        } else {
          const gain = player.computeNormalizationGain(NORMALIZATION_TARGET_DB);
          player.setNormalizationGain(gain);
          sonic().setLoudnessGain(track.id, gain).catch(() => {});
        }

        player.setVolume(get().volume);

        let startPos = 0;
        if (mode !== 'whole') {
          const sliceLen = mode;
          const dur = player.duration;
          startPos = Math.random() * Math.max(0, dur - sliceLen);
          sliceEnd = startPos + sliceLen;
        }

        player.play(startPos);

        // Build a queue from the random history so prev/next navigates it.
        const prevQueue = get().queue;
        const newQueue = [...prevQueue, track];
        // Cap at 200 to avoid unbounded growth
        const trimmed = newQueue.length > 200 ? newQueue.slice(-200) : newQueue;
        set({
          currentTrack: track,
          duration: player.duration,
          isPlaying: true,
          currentTime: startPos,
          queue: trimmed,
          queueIndex: trimmed.length - 1,
          loopRegion: null,
          loopActive: false,
        });

        sonic().logPlay({
          trackId: track.id,
          startedAt: Date.now(),
          startPosition: startPos,
          duration: 0,
          mode: mode === 'whole' ? 'whole' : 'slice',
          sliceLength: mode === 'whole' ? null : (mode as number),
        });
      } catch (err: any) {
        if (err instanceof LoadSupersededError) return;
        if (err instanceof PermissionDeniedError) {
          get().openPermissionsBanner(err.path ?? null);
          return;
        }
        console.error('pickRandom failed:', err);
        // If decode failed, mark and try another
        if (String(err?.message || '').includes("isn't a decodable")) {
          const probable = get().currentTrack;
          if (probable) sonic().markDecodeFailed(probable.id).catch(() => {});
        }
        set({ toast: { kind: 'error', message: `Random pick failed: ${err?.message || err}` } });
      }
    },

    switchToFullPlay: () => {
      // From a slice, switch to playing the full track from the same position.
      const { currentTrack, currentTime } = get();
      if (!currentTrack) return;
      set({ randomMode: 'whole' });
      const player = getEngine().primary;
      if (player) {
        player.play(currentTime);
        set({ isPlaying: true });
      }
    },
  };
}
