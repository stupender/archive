/**
 * The "Random Review" view — Eno's archive-surfacing tool. Pick whole
 * tracks or short random slices, build a history queue, jump back and
 * forth through it.
 *
 * Where it runs: renderer.
 * Depends on: the Zustand store, Icon, format helpers.
 * Used by:    rendered by `App.tsx` when the view is `random-review`.
 *
 * Notes:
 *  - The slice length is one of `1, 2, 3, 5, 10, 20, 30, 60` seconds,
 *    or `whole`. The actual auto-advance logic is in the store
 *    (`pickRandom` schedules a callback via `onTimeUpdate` that picks
 *    another random track when the slice's end is reached).
 *  - Random picks APPEND to the queue (capped at 200). Prev/Next on
 *    the player bar (or here) walks that queue — so "go back, I liked
 *    that one" works.
 *  - The library scope follows the sidebar — `activeLibraryIds`
 *    determines what pool the random picker draws from. The explainer
 *    paragraph at the top names the scope so you always know what
 *    you're rolling from.
 *  - The "Add to playlist…" popover contains an inline "+ New playlist"
 *    name input — that replaced a broken `window.prompt()` call. See
 *    LEARNED.md about Electron disabling prompt().
 */
import { useEffect, useState } from 'react';
import { useLibrary } from '../store/library';
import type { SliceLength } from '@shared/types';
import { Icon } from './Icon';
import { formatTime, mediaUrl } from '../util/format';

const SLICES: (SliceLength | 'whole')[] = ['whole', 1, 2, 3, 5, 10, 20, 30, 60];

export function RandomReviewPanel() {
  const randomMode = useLibrary((s) => s.randomMode);
  const setRandomMode = useLibrary((s) => s.setRandomMode);
  const libraries = useLibrary((s) => s.libraries);
  const activeLibraryIds = useLibrary((s) => s.activeLibraryIds);
  const pickRandom = useLibrary((s) => s.pickRandom);
  const next = useLibrary((s) => s.next);
  const previous = useLibrary((s) => s.previous);
  const togglePlay = useLibrary((s) => s.togglePlay);
  const switchToFullPlay = useLibrary((s) => s.switchToFullPlay);
  const jumpToTrackInLibrary = useLibrary((s) => s.jumpToTrackInLibrary);
  const setRating = useLibrary((s) => s.setRating);
  const playlists = useLibrary((s) => s.playlists);
  const addToPlaylist = useLibrary((s) => s.addToPlaylist);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const currentTrack = useLibrary((s) => s.currentTrack);
  const isPlaying = useLibrary((s) => s.isPlaying);

  const [history, setHistory] = useState<any[]>([]);
  const [showAddTo, setShowAddTo] = useState(false);
  // Inline name input for "+ New playlist" inside the Add-to-playlist popover.
  // Replaces a `window.prompt()` call that was silently broken because
  // Electron disables `prompt()` in BrowserWindows.
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  // Reset the inline-input state whenever the popover closes.
  useEffect(() => {
    if (!showAddTo) { setCreatingPlaylist(false); setNewPlaylistName(''); }
  }, [showAddTo]);

  useEffect(() => {
    window.sonic.getRecentHistory(50).then(setHistory);
  }, [currentTrack]);

  const scopeLabel = activeLibraryIds.length === 0
    ? 'all libraries'
    : activeLibraryIds.length === 1
      ? libraries.find((l) => l.id === activeLibraryIds[0])?.name || 'a library'
      : `${activeLibraryIds.length} libraries`;

  return (
    <div className="random-panel">
      <p className="panel-explainer">
        Let the system surprise you — pick whole tracks or short slices from
        {' '}<span className="random-scope">{scopeLabel}</span>. Change the
        source by toggling libraries in the sidebar (⌘-click for multi-select).
      </p>

      <div className="random-controls">
        <div className="random-section">
          <label className="random-label">Length</label>
          <div className="slice-buttons">
            {SLICES.map((s) => (
              <button
                key={s}
                className={`slice-btn ${randomMode === s ? 'active' : ''}`}
                onClick={() => setRandomMode(s as any)}
              >
                {s === 'whole' ? 'Whole track' : `${s}s`}
              </button>
            ))}
          </div>
        </div>

        <div className="random-pick-row">
          <button className="random-pick-btn primary" onClick={() => pickRandom()}>
            <Icon name="dice" size={16} /> {currentTrack ? 'Pick another' : 'Pick a random track'}
          </button>
        </div>
      </div>

      {currentTrack && (
        <div className="random-now-playing">
          <div className="random-now-art">
            {currentTrack.artworkPath ? (
              <img src={mediaUrl(currentTrack.artworkPath)} alt="" />
            ) : (
              <div className="art-placeholder"><Icon name="note" size={28} /></div>
            )}
          </div>
          <div className="random-now-meta">
            <div className="random-now-title">{currentTrack.title}</div>
            <div className="random-now-sub">
              {currentTrack.artist || 'Unknown'}
              {currentTrack.album ? ` · ${currentTrack.album}` : ''}
            </div>
            <div className="random-now-rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={`star ${currentTrack.rating >= n ? 'star-on' : ''}`}
                  onClick={() => setRating(currentTrack.id, currentTrack.rating === n ? 0 : n)}
                >
                  <Icon name={currentTrack.rating >= n ? 'star-filled' : 'star'} size={14} />
                </button>
              ))}
            </div>
          </div>
          <div className="random-now-actions">
            <button className="random-action-btn" onClick={() => previous()} title="Previous (⌘←)">
              <Icon name="previous" size={14} /> Prev
            </button>
            <button className="random-action-btn" onClick={() => togglePlay()} title="Play/Pause (Space)">
              <Icon name={isPlaying ? 'pause' : 'play'} size={14} />
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button className="random-action-btn" onClick={() => next()} title="Next (⌘→)">
              Next <Icon name="next" size={14} />
            </button>
            {randomMode !== 'whole' && (
              <button className="random-action-btn" onClick={() => switchToFullPlay()} title="Stop slicing and play this whole track">
                Play full track
              </button>
            )}
            <button className="random-action-btn" onClick={() => jumpToTrackInLibrary(currentTrack)}>
              View in Library
            </button>
            <div className="random-add-wrapper">
              <button className="random-action-btn" onClick={() => setShowAddTo(!showAddTo)}>
                Add to playlist…
              </button>
              {showAddTo && (
                <div
                  className="popover"
                  // Don't auto-close while the user is mid-typing a playlist name —
                  // the mouseleave-close pattern would otherwise kill the input.
                  onMouseLeave={() => { if (!creatingPlaylist) setShowAddTo(false); }}
                >
                  {playlists.length === 0 && <div className="popover-empty">No playlists yet</div>}
                  {playlists.map((p) => (
                    <button key={p.id} onClick={async () => {
                      await addToPlaylist(p.id, currentTrack.id);
                      setShowAddTo(false);
                    }}>
                      {p.name}
                    </button>
                  ))}
                  <div className="popover-divider" />
                  {creatingPlaylist ? (
                    <input
                      autoFocus
                      className="sidebar-new-playlist"
                      placeholder="Playlist name"
                      value={newPlaylistName}
                      onChange={(e) => setNewPlaylistName(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && newPlaylistName.trim()) {
                          const name = newPlaylistName.trim();
                          await createPlaylist(name);
                          // The store doesn't return the new id, so we fetch
                          // the list back and look it up by name.
                          const updated = await window.sonic.listPlaylists();
                          const created = updated.find((p: any) => p.name === name);
                          if (created) await addToPlaylist(created.id, currentTrack.id);
                          setShowAddTo(false);
                        } else if (e.key === 'Escape') {
                          setCreatingPlaylist(false);
                          setNewPlaylistName('');
                        }
                      }}
                    />
                  ) : (
                    <button onClick={() => setCreatingPlaylist(true)}>
                      + New playlist
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="random-history">
        <h3>Recently surfaced</h3>
        {history.length === 0 && <div className="random-history-empty">No history yet — pick a track above.</div>}
        <div className="random-history-list">
          {history.map((entry) => (
            <div key={entry.id} className="random-history-row">
              <div className="random-history-art">
                {entry.track?.artworkPath ? (
                  <img src={mediaUrl(entry.track.artworkPath)} alt="" />
                ) : (
                  <div className="art-placeholder"><Icon name="note" size={14} /></div>
                )}
              </div>
              <div className="random-history-meta">
                <div className="random-history-title">{entry.track?.title || '(removed)'}</div>
                <div className="random-history-sub">
                  {entry.track?.artist || ''}
                  {entry.mode === 'slice' ? ` · ${entry.sliceLength}s slice from ${formatTime(entry.startPosition)}` : ' · whole track'}
                </div>
              </div>
              <div className="random-history-time">
                {new Date(entry.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              {entry.track && (
                <button
                  className="random-history-jump"
                  title="View in library"
                  onClick={() => jumpToTrackInLibrary(entry.track)}
                >
                  <Icon name="chevron-right" size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
