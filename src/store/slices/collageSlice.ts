/**
 * Collage slice — the Multi-Track world: up to 5 layered players, each
 * with its own loop / speed / reverse / volume, plus saved "scenes"
 * that snapshot a whole collage configuration.
 *
 * Where it runs: renderer.
 * Owns these State fields: `collageTracks`, `collagePlaying`, `scenes`,
 *   plus every action that touches them.
 *
 * Notes:
 *  - Each row in `collageTracks` is a mirror of one engine `ITrackPlayer`
 *    in `getEngine().collage[idx]`. The two must stay in lock-step;
 *    `updateCollageRow` patches a single row in place to keep that
 *    cheap during drag interactions.
 *  - `loadScene` clears the current collage entirely and rebuilds it
 *    from saved data — the simpler "delete and rehydrate" is small
 *    enough we don't need a clever diff.
 *  - `randomCollage(n)` is the "surprise me" button: clear, fetch N
 *    random tracks, add each. Not playing — the user hits Play after
 *    seeing what showed up.
 */

import type { StoreApi } from 'zustand';
import type { FilterOptions } from '@shared/types';
import type { State, CollageTrackState, SceneData } from '../library';
import { getEngine } from '../../audio/AudioEngine';

type Set = StoreApi<State>['setState'];
type Get = StoreApi<State>['getState'];

const sonic = () => window.sonic;

const NORMALIZATION_TARGET_DB = -18;

/** Patch a single collage row in-place. */
function updateCollageRow(
  set: Set,
  get: Get,
  idx: number,
  patch: Partial<CollageTrackState>,
) {
  const next = [...get().collageTracks];
  if (!next[idx]) return;
  next[idx] = { ...next[idx], ...patch };
  set({ collageTracks: next });
}

export type CollageSlice = Pick<State,
  | 'collageTracks'
  | 'collagePlaying'
  | 'scenes'
  | 'addToCollage'
  | 'removeFromCollage'
  | 'setCollageVolume'
  | 'setCollagePlaybackRate'
  | 'setCollageReversed'
  | 'setCollageLoopRegion'
  | 'setCollageLoopActive'
  | 'setCollageLoopStart'
  | 'setCollageLoopEnd'
  | 'toggleCollagePlay'
  | 'seekCollage'
  | 'playCollage'
  | 'stopCollage'
  | 'randomCollage'
  | 'refreshScenes'
  | 'saveScene'
  | 'loadScene'
  | 'deleteScene'
>;

export function createCollageSlice(set: Set, get: Get): CollageSlice {
  return {
    collageTracks: [],
    collagePlaying: false,
    scenes: [],

    addToCollage: async (t) => {
      if (get().collageTracks.find((c) => c.track.id === t.id)) return;
      if (get().collageTracks.length >= 5) return;
      try {
        const engine = getEngine();
        await engine.ensureRunning();
        const url = sonic().toMediaUrl(t.path);
        const player = await engine.addCollagePlayer(url);
        if (t.loudnessGain != null) {
          player.setNormalizationGain(t.loudnessGain);
        } else if (player.capabilities.loudnessAnalysis) {
          const gain = player.computeNormalizationGain(NORMALIZATION_TARGET_DB);
          player.setNormalizationGain(gain);
          sonic().setLoudnessGain(t.id, gain).catch(() => {});
        }
        player.setVolume(0.7);

        // Refresh the row's currentTime/isPlaying mirror once so duration
        // is correctly populated. Ongoing time updates come from a periodic
        // refresh inside MultiTrackPanel — we don't wire a per-player
        // time-update callback through the engine.
        const updateTime = () => {
          const cur = get().collageTracks;
          const i = cur.findIndex((c) => c.track.id === t.id);
          if (i < 0) return;
          const next = [...cur];
          next[i] = { ...next[i], currentTime: player.currentTime, isPlaying: player.isPlaying };
          set({ collageTracks: next });
        };

        set({
          collageTracks: [...get().collageTracks, {
            track: t,
            volume: 0.7,
            playbackRate: 1,
            reversed: false,
            loopRegion: null,
            loopActive: false,
            isPlaying: false,
            currentTime: 0,
            duration: player.duration,
            canReverse: player.capabilities.reverse,
            canABLoop: player.capabilities.abLoop,
          }],
        });
        updateTime();
      } catch (err: any) {
        console.error('addToCollage failed:', err);
        set({ toast: { kind: 'error', message: `Couldn't add "${t.title}" to collage: ${err?.message || err}` } });
      }
    },

    removeFromCollage: (idx) => {
      getEngine().removeCollagePlayer(idx);
      const next = [...get().collageTracks];
      next.splice(idx, 1);
      set({ collageTracks: next });
    },

    setCollageVolume: (idx, v) => {
      const players = getEngine().collage;
      if (players[idx]) players[idx].setVolume(v);
      updateCollageRow(set, get, idx, { volume: v });
    },

    setCollagePlaybackRate: (idx, r) => {
      const players = getEngine().collage;
      if (players[idx]) players[idx].setPlaybackRate(r);
      updateCollageRow(set, get, idx, { playbackRate: r });
    },

    setCollageReversed: (idx, b) => {
      const players = getEngine().collage;
      if (players[idx]) players[idx].setReversed(b);
      updateCollageRow(set, get, idx, { reversed: b });
    },

    setCollageLoopRegion: (idx, r) => {
      const cur = get().collageTracks[idx];
      const players = getEngine().collage;
      updateCollageRow(set, get, idx, { loopRegion: r });
      if (cur?.loopActive && players[idx]) players[idx].setLoopRegion(r);
    },

    setCollageLoopActive: (idx, b) => {
      const cur = get().collageTracks[idx];
      if (!cur) return;
      let region = cur.loopRegion;
      if (b && !region && cur.duration) region = { start: 0, end: cur.duration };
      const players = getEngine().collage;
      if (players[idx]) players[idx].setLoopRegion(b ? region : null);
      updateCollageRow(set, get, idx, { loopActive: b, loopRegion: region });
    },

    setCollageLoopStart: (idx) => {
      const cur = get().collageTracks[idx];
      if (!cur || !cur.duration) return;
      const start = cur.currentTime;
      const end = cur.loopRegion ? Math.max(start + 0.1, cur.loopRegion.end) : Math.min(cur.duration, start + 4);
      const region = { start, end };
      const players = getEngine().collage;
      if (players[idx]) players[idx].setLoopRegion(region);
      updateCollageRow(set, get, idx, { loopRegion: region, loopActive: true });
    },

    setCollageLoopEnd: (idx) => {
      const cur = get().collageTracks[idx];
      if (!cur || !cur.duration) return;
      const end = cur.currentTime;
      const start = cur.loopRegion ? Math.min(end - 0.1, cur.loopRegion.start) : Math.max(0, end - 4);
      const region = { start, end };
      const players = getEngine().collage;
      if (players[idx]) players[idx].setLoopRegion(region);
      updateCollageRow(set, get, idx, { loopRegion: region, loopActive: true });
    },

    toggleCollagePlay: (idx) => {
      const players = getEngine().collage;
      const player = players[idx];
      const cur = get().collageTracks[idx];
      if (!player || !cur) return;
      if (player.isPlaying) player.pause();
      else player.play();
      updateCollageRow(set, get, idx, { isPlaying: player.isPlaying });
    },

    seekCollage: (idx, t) => {
      const players = getEngine().collage;
      if (players[idx]) players[idx].seek(t);
      updateCollageRow(set, get, idx, { currentTime: t });
    },

    playCollage: async () => {
      const engine = getEngine();
      await engine.ensureRunning();
      engine.collage.forEach((p, idx) => {
        const cur = get().collageTracks[idx];
        const startAt = cur ? cur.currentTime : Math.random() * Math.max(0, p.duration - 30);
        p.play(startAt);
      });
      const next = get().collageTracks.map((c) => ({ ...c, isPlaying: true }));
      set({ collageTracks: next, collagePlaying: true });
    },

    stopCollage: () => {
      for (const p of getEngine().collage) p.pause();
      const next = get().collageTracks.map((c) => ({ ...c, isPlaying: false }));
      set({ collageTracks: next, collagePlaying: false });
    },

    randomCollage: async (n) => {
      get().stopCollage();
      getEngine().clearCollage();
      set({ collageTracks: [] });
      // Random pick uses the active library scope only (no other filters).
      const filter: FilterOptions = {};
      if (get().activeLibraryIds.length > 0) filter.libraryIds = get().activeLibraryIds;
      const result = await sonic().randomTracks(n, filter);
      const tracks = Array.isArray(result) ? result : result ? [result] : [];
      for (const t of tracks) await get().addToCollage(t);
    },

    refreshScenes: async () => {
      const scenes = await sonic().listScenes();
      set({ scenes });
    },

    saveScene: async (name) => {
      const cur = get().collageTracks;
      const data: SceneData = {
        tracks: cur.map((c) => ({
          trackId: c.track.id,
          volume: c.volume,
          playbackRate: c.playbackRate,
          reversed: c.reversed,
          loopRegion: c.loopRegion,
          loopActive: c.loopActive,
          startPosition: c.currentTime,
        })),
      };
      await sonic().saveScene(name, JSON.stringify(data));
      await get().refreshScenes();
    },

    loadScene: async (sceneId) => {
      const scene = (get().scenes).find((s) => s.id === sceneId);
      if (!scene) return;
      let parsed: SceneData;
      try { parsed = JSON.parse(scene.data); } catch { return; }
      // Reset
      get().stopCollage();
      getEngine().clearCollage();
      set({ collageTracks: [] });
      // Re-add each track and reapply settings
      for (const entry of parsed.tracks) {
        const track = await sonic().getTrack(entry.trackId);
        if (!track) continue;
        await get().addToCollage(track);
        const idx = get().collageTracks.length - 1;
        const player = getEngine().collage[idx];
        if (!player) continue;
        player.setVolume(entry.volume);
        player.setPlaybackRate(entry.playbackRate);
        if (entry.reversed && player.capabilities.reverse) player.setReversed(true);
        if (entry.loopActive && entry.loopRegion && player.capabilities.abLoop) {
          player.setLoopRegion(entry.loopRegion);
        }
        player.seek(entry.startPosition);
        updateCollageRow(set, get, idx, {
          volume: entry.volume,
          playbackRate: entry.playbackRate,
          reversed: entry.reversed,
          loopRegion: entry.loopRegion,
          loopActive: entry.loopActive,
          currentTime: entry.startPosition,
        });
      }
    },

    deleteScene: async (sceneId) => {
      await sonic().deleteScene(sceneId);
      await get().refreshScenes();
    },
  };
}
