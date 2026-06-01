import { useState, useRef, useCallback, useEffect } from 'react';
import { useLibrary } from '../store/library';
import { Icon } from './Icon';
import { formatTime, mediaUrl } from '../util/format';
import { Popover, usePopover } from './Popover';
import { TrackDetailDrawer } from './TrackDetailDrawer';

export function PlayerBar() {
  const currentTrack = useLibrary((s) => s.currentTrack);
  const isPlaying = useLibrary((s) => s.isPlaying);
  const currentTime = useLibrary((s) => s.currentTime);
  const duration = useLibrary((s) => s.duration);
  const togglePlay = useLibrary((s) => s.togglePlay);
  const next = useLibrary((s) => s.next);
  const previous = useLibrary((s) => s.previous);
  const seek = useLibrary((s) => s.seek);
  const playbackRate = useLibrary((s) => s.playbackRate);
  const setPlaybackRate = useLibrary((s) => s.setPlaybackRate);
  const reversed = useLibrary((s) => s.reversed);
  const setReversed = useLibrary((s) => s.setReversed);
  const volume = useLibrary((s) => s.volume);
  const setVolume = useLibrary((s) => s.setVolume);
  const loopRegion = useLibrary((s) => s.loopRegion);
  const loopActive = useLibrary((s) => s.loopActive);
  const setLoopActive = useLibrary((s) => s.setLoopActive);
  const setLoopStart = useLibrary((s) => s.setLoopStart);
  const setLoopEnd = useLibrary((s) => s.setLoopEnd);
  const setLoopRegion = useLibrary((s) => s.setLoopRegion);
  const shuffle = useLibrary((s) => s.shuffle);
  const setShuffle = useLibrary((s) => s.setShuffle);
  const jumpToTrackInLibrary = useLibrary((s) => s.jumpToTrackInLibrary);
  const revealInFinder = useLibrary((s) => s.revealInFinder);
  const stopPlayback = useLibrary((s) => s.stopPlayback);
  const setRating = useLibrary((s) => s.setRating);
  const sendCurrentToMultiTrack = useLibrary((s) => s.sendCurrentToMultiTrack);
  const primaryCanReverse = useLibrary((s) => s.primaryCanReverse);
  const primaryCanABLoop = useLibrary((s) => s.primaryCanABLoop);

  const scrubberRef = useRef<HTMLDivElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const pctFromEvent = useCallback((clientX: number) => {
    if (!scrubberRef.current || !duration) return 0;
    const rect = scrubberRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, [duration]);

  /**
   * Begin a drag of the playhead, loop start, or loop end. Attaches window
   * listeners synchronously so even fast click-drags or click-and-release
   * sequences don't lose their mousemove/mouseup events to React's render
   * scheduling. Reads loop state from the store on every move so handle
   * drags see the latest region they're updating.
   */
  const startDrag = useCallback((kind: 'playhead' | 'loopStart' | 'loopEnd') => {
    const onMove = (ev: MouseEvent) => {
      const pct = pctFromEvent(ev.clientX);
      const t = pct * duration;
      const s = useLibrary.getState();
      if (kind === 'playhead') {
        let target = t;
        if (s.loopActive && s.loopRegion) {
          target = Math.max(s.loopRegion.start, Math.min(s.loopRegion.end, t));
        }
        s.seek(target);
      } else if (kind === 'loopStart') {
        const end = s.loopRegion?.end ?? Math.min(duration, t + 1);
        s.setLoopRegion({ start: Math.min(t, end - 0.1), end });
      } else if (kind === 'loopEnd') {
        const start = s.loopRegion?.start ?? Math.max(0, t - 1);
        s.setLoopRegion({ start, end: Math.max(start + 0.1, t) });
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pctFromEvent, duration]);

  const clampToLoop = useCallback((t: number) => {
    if (loopActive && loopRegion) {
      return Math.max(loopRegion.start, Math.min(loopRegion.end, t));
    }
    return t;
  }, [loopActive, loopRegion]);

  const onScrubberMouseDown = (e: React.MouseEvent) => {
    if (!duration) return;
    // Prevent the browser's default text-select / drag behavior — that was
    // intercepting our mousemove events on some elements.
    e.preventDefault();
    const pct = pctFromEvent(e.clientX);
    seek(clampToLoop(pct * duration));
    startDrag('playhead');
  };

  const onThumbMouseDown = (e: React.MouseEvent) => {
    if (!duration) return;
    e.preventDefault();
    e.stopPropagation();
    startDrag('playhead');
  };

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const loopStartPct = loopRegion && duration > 0 ? (loopRegion.start / duration) * 100 : 0;
  const loopEndPct = loopRegion && duration > 0 ? (loopRegion.end / duration) * 100 : 0;

  // Fill represents "played progress" — when looping, clip it to live entirely
  // inside the loop region so the dim outside region stays dim.
  const fillLeftPct = loopActive && loopRegion ? loopStartPct : 0;
  const fillRightPct = loopActive && loopRegion ? Math.min(pct, loopEndPct) : pct;
  const fillWidthPct = Math.max(0, fillRightPct - fillLeftPct);

  // Loop "Start" button engages the loop with start=current; if loop wasn't
  // active, it activates. Pressing without a track does nothing.
  const onLoopStartBtn = () => {
    if (!duration || !primaryCanABLoop) return;
    setLoopStart();
  };
  const onLoopEndBtn = () => {
    if (!duration || !primaryCanABLoop) return;
    setLoopEnd();
  };

  return (
    <>
      <div className="player-bar">
        {/* Left: artwork + title block (with hover info icon and inline ...) */}
        <div className="player-now">
          <div className="player-art-wrap" onClick={() => currentTrack && setDrawerOpen(true)}>
            {currentTrack?.artworkPath ? (
              <img className="player-art" src={mediaUrl(currentTrack.artworkPath)} alt="" />
            ) : (
              <div className="player-art player-art-placeholder"><Icon name="note" size={28} /></div>
            )}
            {currentTrack && (
              <div className="player-art-overlay" title="Get info">
                <Icon name="info" size={20} />
              </div>
            )}
          </div>
          <div className="player-meta">
            {currentTrack ? (
              <>
                <div className="player-title-row">
                  <MarqueeText text={currentTrack.title} className="player-title" />
                  <TitleMoreMenu />
                </div>
                <MarqueeText
                  text={`${currentTrack.artist || ''}${currentTrack.album ? ' — ' + currentTrack.album : ''}`}
                  className="player-artist"
                />
                <div className="player-meta-row">
                  <PlayerStars
                    rating={currentTrack.rating}
                    onChange={(r) => setRating(currentTrack.id, r)}
                  />
                  {currentTrack.userTags.length > 0 && (
                    <div className="player-tags">
                      {currentTrack.userTags.slice(0, 3).map((t, i) => (
                        <span key={i} className="pill pill-user pill-sm">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="player-title">Nothing playing</div>
            )}
          </div>
        </div>

        {/* Center: transport + scrubber + loop bar */}
        <div className="player-center">
          <div className="player-controls">
            <button
              className={`player-btn-sm ${shuffle ? 'on' : ''}`}
              onClick={(e) => { e.currentTarget.blur(); setShuffle(!shuffle); }}
              title="Shuffle (S)"
            >
              <Icon name="shuffle" size={14} />
            </button>
            <button className="player-btn" onClick={(e) => { e.currentTarget.blur(); previous(); }} title="Previous (⌘←)">
              <Icon name="previous" size={20} />
            </button>
            <button className="player-btn player-btn-main" onClick={(e) => { e.currentTarget.blur(); togglePlay(); }} title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
              <Icon name={isPlaying ? 'pause' : 'play'} size={18} />
            </button>
            <button className="player-btn" onClick={(e) => { e.currentTarget.blur(); next(); }} title="Next (⌘→)">
              <Icon name="next" size={20} />
            </button>
            <button
              className={`player-btn-sm ${loopActive ? 'on' : ''}`}
              onClick={(e) => { e.currentTarget.blur(); setLoopActive(!loopActive); }}
              title={loopActive ? 'Loop on (L) — click to disable' : 'Loop off (L)'}
              disabled={!primaryCanABLoop}
            >
              <Icon name="loop" size={14} />
            </button>
          </div>
          <div className="player-scrubber-row">
            <span className="player-time">{formatTime(currentTime)}</span>
            <div className="scrubber-stack">
              <div
                className="player-scrubber"
                ref={scrubberRef}
                onMouseDown={onScrubberMouseDown}
              >
                <div className="player-scrubber-track" />
                {loopActive && loopRegion && (
                  <>
                    {/* Dim segments outside the loop region so the active loop
                     * stands out and the playhead's "jail" is visible. */}
                    <div
                      className="player-scrubber-outside"
                      style={{ left: 0, width: `${loopStartPct}%` }}
                    />
                    <div
                      className="player-scrubber-outside"
                      style={{ left: `${loopEndPct}%`, width: `${Math.max(0, 100 - loopEndPct)}%` }}
                    />
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
                  onMouseDown={onThumbMouseDown}
                />
                {loopActive && loopRegion && (
                  <>
                    <div
                      className="player-scrubber-loop-handle"
                      style={{ left: `${loopStartPct}%` }}
                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); startDrag('loopStart'); }}
                      title="Loop start (drag, or press 1)"
                    />
                    <div
                      className="player-scrubber-loop-handle"
                      style={{ left: `${loopEndPct}%` }}
                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); startDrag('loopEnd'); }}
                      title="Loop end (drag, or press 2)"
                    />
                  </>
                )}
              </div>
              {/* Loop bar — Start at left edge, End at right edge of scrubber.
                  Always visible; light when loop is off. Clicking either engages. */}
              <div className={`player-loop-bar ${loopActive ? 'on' : ''} ${primaryCanABLoop ? '' : 'disabled'}`}>
                <button
                  className="player-loop-btn-edge player-loop-btn-start"
                  onClick={(e) => { e.currentTarget.blur(); onLoopStartBtn(); }}
                  title="Set loop start at current position (1)"
                  disabled={!primaryCanABLoop}
                >
                  <span className="player-loop-btn-label">Start</span>
                  <span className="player-loop-btn-time">{loopRegion ? formatTime(loopRegion.start) : '0:00'}</span>
                </button>
                <button
                  className="player-loop-btn-edge player-loop-btn-end"
                  onClick={(e) => { e.currentTarget.blur(); onLoopEndBtn(); }}
                  title="Set loop end at current position (2)"
                  disabled={!primaryCanABLoop}
                >
                  <span className="player-loop-btn-time">{loopRegion ? formatTime(loopRegion.end) : formatTime(duration)}</span>
                  <span className="player-loop-btn-label">End</span>
                </button>
              </div>
            </div>
            <span className="player-time">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: speed (with up/down arrows + reverse alongside) + volume */}
        <div className="player-right">
          <SpeedReverseCluster
            playbackRate={playbackRate}
            setPlaybackRate={setPlaybackRate}
            reversed={reversed}
            setReversed={setReversed}
            canReverse={primaryCanReverse}
          />

          <div className="player-volume">
            <Icon name={volume === 0 ? 'volume-mute' : 'volume'} size={14} className="player-volume-icon" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {drawerOpen && currentTrack && (
        <TrackDetailDrawer track={currentTrack} onClose={() => setDrawerOpen(false)} />
      )}
    </>
  );

  function TitleMoreMenu() {
    const { open, pos, toggle, close, triggerRef, popoverRef } = usePopover();
    if (!currentTrack) return null;
    return (
      <>
        <button
          ref={triggerRef}
          className="player-title-more"
          onClick={toggle}
          title="More"
        >
          <Icon name="more" size={14} />
        </button>
        {open && (
          <Popover pos={pos} popoverRef={popoverRef}>
            <button onClick={() => { jumpToTrackInLibrary(currentTrack); close(); }}>View in Library</button>
            <button onClick={() => { setDrawerOpen(true); close(); }}>Get Info</button>
            <button onClick={() => { revealInFinder(currentTrack.path); close(); }}>Show in Finder</button>
            <div className="popover-divider" />
            <button onClick={() => { sendCurrentToMultiTrack(); close(); }}>
              {loopActive && loopRegion ? 'Send loop to Multi-Track' : 'Send to Multi-Track'}
            </button>
            <div className="popover-divider" />
            <button onClick={() => { stopPlayback(); close(); }}>Stop</button>
          </Popover>
        )}
      </>
    );
  }
}

/* ---------- Subcomponents ------------------------------------------------ */

function PlayerStars({ rating, onChange }: { rating: number; onChange: (r: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? rating;
  return (
    <div className="player-stars" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          className={`star ${display >= n ? 'star-on' : ''}`}
          onMouseEnter={() => setHover(n)}
          onClick={(e) => { e.currentTarget.blur(); onChange(rating === n ? 0 : n); }}
          aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
        >
          <Icon name={display >= n ? 'star-filled' : 'star'} size={11} />
        </button>
      ))}
    </div>
  );
}

const SPEED_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

function nextSpeed(current: number, dir: 1 | -1): number {
  // Move to the next preset above/below the current value.
  const sorted = [...SPEED_STEPS];
  if (dir > 0) {
    for (const s of sorted) if (s > current + 1e-3) return s;
    return sorted[sorted.length - 1];
  }
  for (let i = sorted.length - 1; i >= 0; i--) if (sorted[i] < current - 1e-3) return sorted[i];
  return sorted[0];
}

function SpeedReverseCluster({
  playbackRate, setPlaybackRate, reversed, setReversed, canReverse,
}: {
  playbackRate: number;
  setPlaybackRate: (r: number) => void;
  reversed: boolean;
  setReversed: (b: boolean) => void;
  canReverse: boolean;
}) {
  const { open, pos, toggle, close, triggerRef, popoverRef } = usePopover();

  const formatted = playbackRate === Math.floor(playbackRate)
    ? `${playbackRate.toFixed(1)}×`
    : `${playbackRate}×`;

  const onSlide = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = Number(e.target.value);
    if (Math.abs(v - 1) < 0.04) v = 1;
    setPlaybackRate(v);
  };

  return (
    <div className="speed-cluster">
      {/* Reverse: shows the current direction the music is moving in. */}
      <button
        className={`player-btn-sm reverse-btn ${reversed ? 'on' : ''}`}
        onClick={(e) => { e.currentTarget.blur(); setReversed(!reversed); }}
        title={reversed ? 'Currently playing backward (R) — click to reverse' : 'Currently playing forward (R) — click to reverse'}
        disabled={!canReverse}
      >
        <Icon name={reversed ? 'arrow-back' : 'arrow-forward'} size={14} />
      </button>

      {/* Speed control: stacked ↑ value ↓ for quick stepping. Click value to open slider. */}
      <div className="speed-stack">
        <button
          className="speed-arrow"
          onClick={(e) => { e.currentTarget.blur(); setPlaybackRate(nextSpeed(playbackRate, 1)); }}
          title="Faster"
        >
          <Icon name="chevron-up" size={11} />
        </button>
        <button
          ref={triggerRef}
          className={`player-btn-sm player-speed-btn ${playbackRate !== 1 ? 'on' : ''}`}
          onClick={toggle}
          onDoubleClick={() => setPlaybackRate(1)}
          title="Speed (click for slider, double-click to reset)"
        >
          {formatted}
        </button>
        <button
          className="speed-arrow"
          onClick={(e) => { e.currentTarget.blur(); setPlaybackRate(nextSpeed(playbackRate, -1)); }}
          title="Slower"
        >
          <Icon name="chevron-down" size={11} />
        </button>
      </div>

      {open && (
        <Popover pos={pos} popoverRef={popoverRef}>
          {SPEED_STEPS.map((r) => (
            <button
              key={r}
              className={r === playbackRate ? 'active' : ''}
              onClick={() => { setPlaybackRate(r); close(); }}
            >
              {r}×{r === 1 ? '  (normal)' : ''}
            </button>
          ))}
          <div className="popover-slider">
            <input type="range" min={0.25} max={2} step={0.01} value={playbackRate} onChange={onSlide} />
            <div className="popover-slider-detent" />
          </div>
        </Popover>
      )}
    </div>
  );
}

/**
 * Renders text and only animates a marquee scroll when the text overflows its
 * container. A clear gap separates each cycle.
 */
function MarqueeText({ text, className }: { text: string; className: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;
    setOverflows(inner.scrollWidth > wrap.clientWidth + 2);
  }, [text]);

  return (
    <div className={`${className} marquee-wrap`} ref={wrapRef}>
      <div className={`marquee-inner ${overflows ? 'marquee-anim' : ''}`} ref={innerRef}>
        <span>{text}</span>
        {overflows && <span className="marquee-spacer" aria-hidden>—</span>}
        {overflows && <span>{text}</span>}
      </div>
    </div>
  );
}
