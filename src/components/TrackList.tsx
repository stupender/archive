/**
 * The Songs view — the main list of tracks. Virtualized: only the rows on
 * screen are rendered, so it stays fast at thousands of tracks.
 *
 * Where it runs: renderer.
 * Depends on: react-window (virtualization), the Zustand store, Icon,
 *   format helpers, TrackDetailDrawer.
 * Used by:    rendered by `App.tsx` when the view is "songs," "history,"
 *   or a playlist.
 *
 * Notes:
 *  - The tracks array is passed in as a prop, not pulled from the store
 *    directly, so this same component renders any track list (current
 *    library, a playlist, a smart playlist, etc.).
 *  - Multi-select: ⌘-click toggles a row in the selection; shift-click
 *    extends from the last anchor. Plain click replaces. The "Tag (T)"
 *    keyboard shortcut and the right-click context menu both target
 *    the multi-selection if any rows are selected.
 *  - Each row's small play button on the artwork plays the track
 *    without selecting the row. Double-clicking a row also plays.
 *  - Hover star rating: stars only show on hover (or for already-rated
 *    tracks). Click to set; click the same star again to clear.
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { List, type ListImperativeAPI, type RowComponentProps } from 'react-window';
import type { Track } from '@shared/types';
import { useLibrary } from '../store/library';
import { TrackDetailDrawer } from './TrackDetailDrawer';
import { Icon } from './Icon';
import { formatTime, formatLabel, mediaUrl } from '../util/format';

const ROW_HEIGHT = 56;

export function TrackList({ tracks }: { tracks: Track[] }) {
  const playTrack = useLibrary((s) => s.playTrack);
  const togglePlay = useLibrary((s) => s.togglePlay);
  const currentTrack = useLibrary((s) => s.currentTrack);
  const isPlaying = useLibrary((s) => s.isPlaying);
  const setRating = useLibrary((s) => s.setRating);
  const addToCollage = useLibrary((s) => s.addToCollage);
  const playlists = useLibrary((s) => s.playlists);
  const addToPlaylist = useLibrary((s) => s.addToPlaylist);
  const revealInFinder = useLibrary((s) => s.revealInFinder);
  const selectedTrackIds = useLibrary((s) => s.selectedTrackIds);
  const selectTrack = useLibrary((s) => s.selectTrack);
  const selectTracks = useLibrary((s) => s.selectTracks);
  const toggleTrackInSelection = useLibrary((s) => s.toggleTrackInSelection);
  const openQuickTag = useLibrary((s) => s.openQuickTag);
  const scrollToTrackId = useLibrary((s) => s.scrollToTrackId);
  const setScrollToTrackId = useLibrary((s) => s.scrollToTrack);

  const [openDetail, setOpenDetail] = useState<Track | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; track: Track } | null>(null);
  const listRef = useRef<ListImperativeAPI>(null);

  // Scroll into view when requested (e.g. after "View in Library")
  useEffect(() => {
    if (scrollToTrackId == null) return;
    const idx = tracks.findIndex((t) => t.id === scrollToTrackId);
    if (idx >= 0) {
      listRef.current?.scrollToRow({ index: idx, align: 'smart' });
    }
    setScrollToTrackId(null);
  }, [scrollToTrackId, tracks, setScrollToTrackId]);

  const onRowClick = useCallback((e: React.MouseEvent, t: Track) => {
    if (e.metaKey || e.ctrlKey) {
      toggleTrackInSelection(t.id);
      return;
    }
    if (e.shiftKey && selectedTrackIds.length > 0) {
      const anchorId = selectedTrackIds[selectedTrackIds.length - 1];
      const anchorIdx = tracks.findIndex((x) => x.id === anchorId);
      const targetIdx = tracks.findIndex((x) => x.id === t.id);
      if (anchorIdx >= 0 && targetIdx >= 0) {
        const [lo, hi] = anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
        const ids = tracks.slice(lo, hi + 1).map((x) => x.id);
        selectTracks(ids);
        return;
      }
    }
    selectTrack(t.id);
  }, [tracks, selectedTrackIds, selectTrack, selectTracks, toggleTrackInSelection]);

  const rowProps = useMemo(() => ({
    tracks,
    currentTrackId: currentTrack?.id ?? null,
    isPlaying,
    selectedTrackIds,
    onSelect: onRowClick,
    onPlay: (t: Track) => playTrack(t, tracks),
    onTogglePlay: togglePlay,
    onRate: setRating,
    onContextMenu: (e: React.MouseEvent, t: Track) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, track: t });
    },
  }), [tracks, currentTrack?.id, isPlaying, selectedTrackIds, onRowClick, playTrack, togglePlay, setRating]);

  if (tracks.length === 0) {
    return <div className="empty-list">No tracks here yet.</div>;
  }

  return (
    <>
      <div className="track-list-wrap">
        <div className="track-list-header">
          <div className="col-art"></div>
          <div className="col-title">Title</div>
          <div className="col-artist">Artist</div>
          <div className="col-duration">Time</div>
          <div className="col-star">Rating</div>
          <div className="col-format">Type</div>
        </div>
        <div className="track-list-rows">
          <List
            listRef={listRef}
            rowComponent={TrackRow}
            rowCount={tracks.length}
            rowHeight={ROW_HEIGHT}
            rowProps={rowProps}
            overscanCount={8}
            className="track-list-virt"
          />
        </div>
      </div>

      {contextMenu && (() => {
        // If the right-clicked track is part of the multi-selection, the
        // bulk actions target the whole selection. Otherwise just the one.
        const inSelection = selectedTrackIds.includes(contextMenu.track.id);
        const targetIds = inSelection && selectedTrackIds.length > 1
          ? selectedTrackIds
          : [contextMenu.track.id];
        return (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            track={contextMenu.track}
            targetCount={targetIds.length}
            playlists={playlists}
            onClose={() => setContextMenu(null)}
            onPlay={() => playTrack(contextMenu.track, tracks)}
            onInfo={() => setOpenDetail(contextMenu.track)}
            onAddToCollage={() => addToCollage(contextMenu.track)}
            onRevealInFinder={() => revealInFinder(contextMenu.track.path)}
            onTagSelection={() => openQuickTag(targetIds)}
            onAddToPlaylist={(pid: number) => {
              targetIds.forEach((id) => addToPlaylist(pid, id));
            }}
          />
        );
      })()}

      {openDetail && (
        <TrackDetailDrawer track={openDetail} onClose={() => setOpenDetail(null)} />
      )}
    </>
  );
}

interface RowProps {
  tracks: Track[];
  currentTrackId: number | null;
  isPlaying: boolean;
  selectedTrackIds: number[];
  onSelect: (e: React.MouseEvent, t: Track) => void;
  onPlay: (t: Track) => void;
  onTogglePlay: () => void;
  onRate: (id: number, rating: number) => void;
  onContextMenu: (e: React.MouseEvent, t: Track) => void;
}

function TrackRow(props: RowComponentProps<RowProps>) {
  const { index, style, ariaAttributes, tracks, currentTrackId, isPlaying, selectedTrackIds, onSelect, onPlay, onTogglePlay, onRate, onContextMenu } = props;
  const t = tracks[index];
  if (!t) return null;
  const playing = currentTrackId === t.id;
  const selected = selectedTrackIds.includes(t.id);

  return (
    <div
      style={style}
      {...ariaAttributes}
      className={`track-row ${selected ? 'selected' : ''} ${playing ? 'playing' : ''}`}
      onClick={(e) => onSelect(e, t)}
      onDoubleClick={() => onPlay(t)}
      onContextMenu={(e) => onContextMenu(e, t)}
    >
      <div className="col-art">
        <ArtCell track={t} playing={playing} isPlaying={isPlaying} onPlay={() => onPlay(t)} onTogglePlay={onTogglePlay} />
      </div>
      <div className="col-title" title={t.title}>
        <div className="track-title">{t.title}</div>
        {(t.userTags.length > 0 || t.pathTags.length > 0) && (
          <div className="track-pills">
            {t.userTags.slice(0, 3).map((p, i) => <span key={'u'+i} className="pill pill-user">{p}</span>)}
            {t.pathTags.slice(0, 2).map((p, i) => <span key={'p'+i} className="pill">{p}</span>)}
          </div>
        )}
      </div>
      <div className="col-artist" title={`${t.artist || ''}${t.album ? ' — ' + t.album : ''}`}>
        {t.artist || '—'}
        {t.album ? <span className="track-album">  ·  {t.album}</span> : null}
      </div>
      <div className="col-duration">{t.duration ? formatTime(t.duration) : '—'}</div>
      <RatingCell rating={t.rating} onChange={(r) => onRate(t.id, r)} />
      <div className="col-format">
        {formatLabel(t.format, t.path) && (
          <span className="pill pill-format">{formatLabel(t.format, t.path)}</span>
        )}
      </div>
    </div>
  );
}

function RatingCell({ rating, onChange }: { rating: number; onChange: (r: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? rating;
  return (
    <div className="col-star" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          className={`star ${display >= n ? 'star-on' : ''}`}
          onMouseEnter={() => setHover(n)}
          onClick={(e) => {
            e.stopPropagation();
            onChange(rating === n ? 0 : n);
          }}
        >
          <Icon name={display >= n ? 'star-filled' : 'star'} size={11} />
        </button>
      ))}
    </div>
  );
}

function ArtCell({
  track, playing, isPlaying, onPlay, onTogglePlay,
}: {
  track: Track;
  playing: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onTogglePlay: () => void;
}) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (playing) onTogglePlay();
      else onPlay();
    },
    [playing, onPlay, onTogglePlay],
  );
  return (
    <div className="art-cell">
      {track.artworkPath ? (
        <img src={mediaUrl(track.artworkPath)} alt="" />
      ) : (
        <div className="art-placeholder"><Icon name="note" size={18} /></div>
      )}
      <button className="art-play-btn" onClick={handleClick} aria-label={playing && isPlaying ? 'Pause' : 'Play'}>
        <Icon name={playing && isPlaying ? 'pause' : 'play'} size={18} />
      </button>
    </div>
  );
}

function ContextMenu({
  x, y, targetCount, playlists, onClose, onPlay, onInfo, onAddToCollage, onRevealInFinder, onTagSelection, onAddToPlaylist,
}: any) {
  const bulk = targetCount > 1;
  // Only manual (non-auto) playlists make sense as add targets.
  const manualPlaylists = (playlists as any[]).filter((p) => !p.isAuto);
  return (
    <>
      <div className="context-menu-backdrop" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className="context-menu" style={{ left: x, top: y }}>
        {!bulk && <button onClick={() => { onPlay(); onClose(); }}>Play</button>}
        {!bulk && <button onClick={() => { onInfo(); onClose(); }}>Get Info</button>}
        <button onClick={() => { onTagSelection(); onClose(); }}>
          {bulk ? `Tag ${targetCount} tracks…` : 'Tag (T)…'}
        </button>
        {!bulk && <button onClick={() => { onAddToCollage(); onClose(); }}>Add to Multi-Track</button>}
        {!bulk && <button onClick={() => { onRevealInFinder(); onClose(); }}>Show in Finder</button>}
        <div className="context-menu-divider" />
        <div className="context-menu-label">{bulk ? `Add ${targetCount} to playlist` : 'Add to playlist'}</div>
        {manualPlaylists.length === 0 && <div className="context-menu-empty">No playlists yet</div>}
        {manualPlaylists.map((p: any) => (
          <button key={p.id} onClick={() => { onAddToPlaylist(p.id); onClose(); }}>
            {p.name}
          </button>
        ))}
      </div>
    </>
  );
}
