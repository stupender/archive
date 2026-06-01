import { useState, useEffect, useRef, useCallback } from 'react';
import { useLibrary } from '../store/library';
import { Icon } from './Icon';
import { mediaUrl, formatTime } from '../util/format';
import { Popover, usePopover } from './Popover';
import { getEngine } from '../audio/engine';

export function MultiTrackPanel() {
  const collageTracks = useLibrary((s) => s.collageTracks);
  const removeFromCollage = useLibrary((s) => s.removeFromCollage);
  const setCollageVolume = useLibrary((s) => s.setCollageVolume);
  const setCollagePlaybackRate = useLibrary((s) => s.setCollagePlaybackRate);
  const setCollageReversed = useLibrary((s) => s.setCollageReversed);
  const setCollageLoopRegion = useLibrary((s) => s.setCollageLoopRegion);
  const setCollageLoopActive = useLibrary((s) => s.setCollageLoopActive);
  const setCollageLoopStart = useLibrary((s) => s.setCollageLoopStart);
  const setCollageLoopEnd = useLibrary((s) => s.setCollageLoopEnd);
  const toggleCollagePlay = useLibrary((s) => s.toggleCollagePlay);
  const seekCollage = useLibrary((s) => s.seekCollage);
  const playCollage = useLibrary((s) => s.playCollage);
  const stopCollage = useLibrary((s) => s.stopCollage);
  const collagePlaying = useLibrary((s) => s.collagePlaying);
  const randomCollage = useLibrary((s) => s.randomCollage);
  const tracks = useLibrary((s) => s.tracks);
  const addToCollage = useLibrary((s) => s.addToCollage);
  const scenes = useLibrary((s) => s.scenes);
  const refreshScenes = useLibrary((s) => s.refreshScenes);
  const saveScene = useLibrary((s) => s.saveScene);
  const loadScene = useLibrary((s) => s.loadScene);
  const deleteScene = useLibrary((s) => s.deleteScene);

  const [n, setN] = useState(3);
  const [picker, setPicker] = useState(false);
  const [filter, setFilter] = useState('');

  // Drive the per-card scrubber from a low-rate poll of the underlying engine
  // players (the engine doesn't push collage time updates the way it does for
  // primary).
  useEffect(() => {
    const id = setInterval(() => {
      // Touch the store: poll each player and update its row state
      const engine = getEngine();
      const cur = useLibrary.getState().collageTracks;
      if (cur.length !== engine.collage.length) return;
      let changed = false;
      const next = cur.map((c, i) => {
        const p = engine.collage[i];
        if (!p) return c;
        const t = p.currentTime;
        const playing = p.isPlaying;
        if (Math.abs(t - c.currentTime) > 0.05 || playing !== c.isPlaying) {
          changed = true;
          return { ...c, currentTime: t, isPlaying: playing };
        }
        return c;
      });
      if (changed) useLibrary.setState({ collageTracks: next });
    }, 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { refreshScenes(); }, [refreshScenes]);

  return (
    <div className="multitrack-panel">
      <p className="panel-explainer">
        Layer up to 5 tracks at once — pure Eno. Each track has its own player with looper, speed and reverse.
        Roll the dice or pick tracks manually, save the combination as a scene, and recall it later.
      </p>

      <div className="multitrack-controls">
        <div className="multitrack-control-row">
          <label>Random count</label>
          <select value={n} onChange={(e) => setN(Number(e.target.value))}>
            {[2, 3, 4, 5].map((v) => <option key={v} value={v}>{v} tracks</option>)}
          </select>
          <button className="random-pick-btn primary" onClick={() => randomCollage(n)}>
            <Icon name="dice" size={14} /> Roll the dice
          </button>
          <button className="multitrack-add-btn" onClick={() => setPicker(true)} disabled={collageTracks.length >= 5}>
            <Icon name="plus" size={14} /> Pick a track
          </button>
          <ScenesMenu
            scenes={scenes}
            onSave={async () => {
              const name = prompt('Scene name:');
              if (name?.trim()) await saveScene(name.trim());
            }}
            onLoad={loadScene}
            onDelete={deleteScene}
            disabled={collageTracks.length === 0 && scenes.length === 0}
          />
        </div>
        <div className="multitrack-control-row">
          {collagePlaying ? (
            <button className="multitrack-play-btn stop" onClick={stopCollage}>
              <Icon name="pause" size={14} /> Stop all
            </button>
          ) : (
            <button className="multitrack-play-btn primary" onClick={playCollage} disabled={collageTracks.length === 0}>
              <Icon name="play" size={14} /> Play all together
            </button>
          )}
        </div>
      </div>

      <div className="multitrack-list">
        {collageTracks.length === 0 && (
          <div className="multitrack-empty">No tracks loaded — pick or roll above.</div>
        )}
        {collageTracks.map((c, idx) => (
          <CollageTrackCard
            key={`${c.track.id}-${idx}`}
            idx={idx}
            track={c.track}
            volume={c.volume}
            playbackRate={c.playbackRate}
            reversed={c.reversed}
            loopRegion={c.loopRegion}
            loopActive={c.loopActive}
            isPlaying={c.isPlaying}
            currentTime={c.currentTime}
            duration={c.duration}
            canReverse={c.canReverse}
            canABLoop={c.canABLoop}
            onRemove={() => removeFromCollage(idx)}
            onVolume={(v) => setCollageVolume(idx, v)}
            onSpeed={(r) => setCollagePlaybackRate(idx, r)}
            onReverse={(b) => setCollageReversed(idx, b)}
            onLoopActive={(b) => setCollageLoopActive(idx, b)}
            onLoopStart={() => setCollageLoopStart(idx)}
            onLoopEnd={() => setCollageLoopEnd(idx)}
            onLoopRegion={(r) => setCollageLoopRegion(idx, r)}
            onTogglePlay={() => toggleCollagePlay(idx)}
            onSeek={(t) => seekCollage(idx, t)}
          />
        ))}
      </div>

      {picker && (
        <div className="multitrack-picker-backdrop" onClick={() => setPicker(false)}>
          <div className="multitrack-picker" onClick={(e) => e.stopPropagation()}>
            <div className="multitrack-picker-header">
              <input
                autoFocus
                placeholder="Search tracks…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <button onClick={() => setPicker(false)}>Done</button>
            </div>
            <div className="multitrack-picker-list">
              {tracks
                .filter((t) =>
                  !filter ||
                  t.title.toLowerCase().includes(filter.toLowerCase()) ||
                  (t.artist || '').toLowerCase().includes(filter.toLowerCase()),
                )
                .slice(0, 200)
                .map((t) => (
                  <div
                    key={t.id}
                    className="multitrack-picker-row"
                    onClick={() => { addToCollage(t); }}
                  >
                    <div className="track-title">{t.title}</div>
                    <div className="track-artist">{t.artist || '—'}</div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScenesMenu({
  scenes, onSave, onLoad, onDelete, disabled,
}: {
  scenes: { id: number; name: string; createdAt: number }[];
  onSave: () => Promise<void>;
  onLoad: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  disabled: boolean;
}) {
  const { open, pos, toggle, close, triggerRef, popoverRef } = usePopover();
  return (
    <>
      <button
        ref={triggerRef}
        className="multitrack-add-btn"
        onClick={toggle}
        disabled={disabled}
      >
        Scenes
      </button>
      {open && (
        <Popover pos={pos} popoverRef={popoverRef}>
          <button onClick={async () => { await onSave(); close(); }}>Save current as scene…</button>
          <div className="popover-divider" />
          {scenes.length === 0 && <div className="popover-empty">No saved scenes</div>}
          {scenes.map((s) => (
            <div key={s.id} className="scene-row">
              <button className="scene-load" onClick={async () => { await onLoad(s.id); close(); }}>
                {s.name}
              </button>
              <button className="scene-delete" onClick={async () => { await onDelete(s.id); }} title="Delete scene">
                <Icon name="close" size={11} />
              </button>
            </div>
          ))}
        </Popover>
      )}
    </>
  );
}

interface CardProps {
  idx: number;
  track: any;
  volume: number;
  playbackRate: number;
  reversed: boolean;
  loopRegion: { start: number; end: number } | null;
  loopActive: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  canReverse: boolean;
  canABLoop: boolean;
  onRemove: () => void;
  onVolume: (v: number) => void;
  onSpeed: (r: number) => void;
  onReverse: (b: boolean) => void;
  onLoopActive: (b: boolean) => void;
  onLoopStart: () => void;
  onLoopEnd: () => void;
  onLoopRegion: (r: { start: number; end: number } | null) => void;
  onTogglePlay: () => void;
  onSeek: (t: number) => void;
}

function CollageTrackCard(props: CardProps) {
  const {
    track, volume, playbackRate, reversed, loopRegion, loopActive,
    isPlaying, currentTime, duration, canReverse, canABLoop,
    onRemove, onVolume, onSpeed, onReverse, onLoopActive, onLoopStart, onLoopEnd, onLoopRegion,
    onTogglePlay, onSeek,
  } = props;

  const scrubberRef = useRef<HTMLDivElement>(null);

  const pctFromEvent = useCallback((clientX: number) => {
    if (!scrubberRef.current || !duration) return 0;
    const rect = scrubberRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, [duration]);

  const clampToLoop = useCallback((t: number) => {
    if (loopActive && loopRegion) {
      return Math.max(loopRegion.start, Math.min(loopRegion.end, t));
    }
    return t;
  }, [loopActive, loopRegion]);

  // Refs so the move handler always sees the latest callbacks even though
  // listeners are attached synchronously on mousedown.
  const propsRef = useRef({ onSeek, onLoopRegion, loopRegion, clampToLoop, duration });
  propsRef.current = { onSeek, onLoopRegion, loopRegion, clampToLoop, duration };

  const startDrag = useCallback((kind: 'playhead' | 'loopStart' | 'loopEnd') => {
    const onMove = (ev: MouseEvent) => {
      const { onSeek, onLoopRegion, loopRegion, clampToLoop, duration } = propsRef.current;
      const pct = pctFromEvent(ev.clientX);
      const t = pct * duration;
      if (kind === 'playhead') onSeek(clampToLoop(t));
      else if (kind === 'loopStart') {
        const end = loopRegion?.end ?? Math.min(duration, t + 1);
        onLoopRegion({ start: Math.min(t, end - 0.1), end });
      } else if (kind === 'loopEnd') {
        const start = loopRegion?.start ?? Math.max(0, t - 1);
        onLoopRegion({ start, end: Math.max(start + 0.1, t) });
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pctFromEvent]);

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const loopStartPct = loopRegion && duration > 0 ? (loopRegion.start / duration) * 100 : 0;
  const loopEndPct = loopRegion && duration > 0 ? (loopRegion.end / duration) * 100 : 0;
  const fillLeftPct = loopActive && loopRegion ? loopStartPct : 0;
  const fillRightPct = loopActive && loopRegion ? Math.min(pct, loopEndPct) : pct;
  const fillWidthPct = Math.max(0, fillRightPct - fillLeftPct);

  const onScrubberDown = (e: React.MouseEvent) => {
    if (!duration) return;
    e.preventDefault();
    const pct = pctFromEvent(e.clientX);
    onSeek(clampToLoop(pct * duration));
    startDrag('playhead');
  };

  const onThumbDown = (e: React.MouseEvent) => {
    if (!duration) return;
    e.preventDefault();
    e.stopPropagation();
    startDrag('playhead');
  };

  const formattedRate = playbackRate === Math.floor(playbackRate)
    ? `${playbackRate.toFixed(1)}×`
    : `${playbackRate}×`;

  return (
    <div className="collage-card">
      <div className="collage-card-top">
        {track.artworkPath ? (
          <img className="collage-card-art" src={mediaUrl(track.artworkPath)} alt="" />
        ) : (
          <div className="collage-card-art collage-card-art-placeholder">
            <Icon name="note" size={28} />
          </div>
        )}
        <div className="collage-card-meta">
          <div className="collage-card-title" title={track.title}>{track.title}</div>
          <div className="collage-card-artist">{track.artist || ''}</div>
        </div>
        <button
          className="player-btn collage-play"
          onClick={(e) => { e.currentTarget.blur(); onTogglePlay(); }}
          title={isPlaying ? 'Pause this track' : 'Play this track'}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size={16} />
        </button>
        <button
          className="multitrack-card-remove"
          onClick={(e) => { e.currentTarget.blur(); onRemove(); }}
          title="Remove from collage"
        >
          <Icon name="close" size={12} />
        </button>
      </div>

      <div className="collage-card-scrubber-row">
        <span className="player-time">{formatTime(currentTime)}</span>
        <div className="scrubber-stack">
          <div className="player-scrubber collage-scrubber" ref={scrubberRef} onMouseDown={onScrubberDown}>
            <div className="player-scrubber-track" />
            {loopActive && loopRegion && (
              <>
                <div className="player-scrubber-outside" style={{ left: 0, width: `${loopStartPct}%` }} />
                <div className="player-scrubber-outside" style={{ left: `${loopEndPct}%`, width: `${Math.max(0, 100 - loopEndPct)}%` }} />
                <div
                  className="player-scrubber-loop"
                  style={{ left: `${loopStartPct}%`, width: `${Math.max(0, loopEndPct - loopStartPct)}%` }}
                />
              </>
            )}
            <div className="player-scrubber-fill" style={{ left: `${fillLeftPct}%`, width: `${fillWidthPct}%` }} />
            <div
              className="player-scrubber-thumb"
              style={{ left: `${pct}%` }}
              onMouseDown={onThumbDown}
            />
            {loopActive && loopRegion && (
              <>
                <div className="player-scrubber-loop-handle" style={{ left: `${loopStartPct}%` }} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); startDrag('loopStart'); }} />
                <div className="player-scrubber-loop-handle" style={{ left: `${loopEndPct}%` }} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); startDrag('loopEnd'); }} />
              </>
            )}
          </div>
          <div className={`player-loop-bar collage-loop-bar ${loopActive ? 'on' : ''} ${canABLoop ? '' : 'disabled'}`}>
            <button
              className="player-loop-btn-edge player-loop-btn-start"
              onClick={(e) => { e.currentTarget.blur(); if (canABLoop) onLoopStart(); }}
              disabled={!canABLoop}
            >
              <span className="player-loop-btn-label">Start</span>
              <span className="player-loop-btn-time">{loopRegion ? formatTime(loopRegion.start) : '0:00'}</span>
            </button>
            <button
              className="player-loop-btn-edge player-loop-btn-end"
              onClick={(e) => { e.currentTarget.blur(); if (canABLoop) onLoopEnd(); }}
              disabled={!canABLoop}
            >
              <span className="player-loop-btn-time">{loopRegion ? formatTime(loopRegion.end) : formatTime(duration)}</span>
              <span className="player-loop-btn-label">End</span>
            </button>
          </div>
        </div>
        <span className="player-time">{formatTime(duration)}</span>
      </div>

      <div className="collage-card-controls">
        <button
          className={`player-btn-sm ${loopActive ? 'on' : ''}`}
          onClick={(e) => { e.currentTarget.blur(); onLoopActive(!loopActive); }}
          title="Loop on/off"
          disabled={!canABLoop}
        >
          <Icon name="loop" size={14} />
        </button>
        <button
          className={`player-btn-sm ${reversed ? 'on' : ''}`}
          onClick={(e) => { e.currentTarget.blur(); onReverse(!reversed); }}
          title={reversed ? 'Playing backward — click to reverse' : 'Playing forward — click to reverse'}
          disabled={!canReverse}
        >
          <Icon name={reversed ? 'arrow-back' : 'arrow-forward'} size={14} />
        </button>
        <div className="speed-stack collage-speed">
          <button className="speed-arrow" onClick={(e) => { e.currentTarget.blur(); onSpeed(nextSpeed(playbackRate, 1)); }} title="Faster">
            <Icon name="chevron-up" size={11} />
          </button>
          <button
            className={`player-btn-sm player-speed-btn ${playbackRate !== 1 ? 'on' : ''}`}
            onClick={(e) => { e.currentTarget.blur(); onSpeed(1); }}
            onDoubleClick={() => onSpeed(1)}
            title="Click to reset to 1×"
          >
            {formattedRate}
          </button>
          <button className="speed-arrow" onClick={(e) => { e.currentTarget.blur(); onSpeed(nextSpeed(playbackRate, -1)); }} title="Slower">
            <Icon name="chevron-down" size={11} />
          </button>
        </div>
        <div className="collage-card-volume">
          <Icon name="volume" size={12} className="player-volume-icon" />
          <input
            type="range"
            min={0} max={1} step={0.01}
            value={volume}
            onChange={(e) => onVolume(Number(e.target.value))}
          />
        </div>
      </div>
    </div>
  );
}

const SPEED_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
function nextSpeed(current: number, dir: 1 | -1): number {
  if (dir > 0) {
    for (const s of SPEED_STEPS) if (s > current + 1e-3) return s;
    return SPEED_STEPS[SPEED_STEPS.length - 1];
  }
  for (let i = SPEED_STEPS.length - 1; i >= 0; i--) if (SPEED_STEPS[i] < current - 1e-3) return SPEED_STEPS[i];
  return SPEED_STEPS[0];
}
