/**
 * "Get Info" — the right-side drawer where the user edits per-track
 * metadata (title, rating, notes, tags) and sees read-only file details.
 *
 * Where it runs: renderer.
 * Depends on: the Zustand store, Icon, format helpers, shared Track type.
 * Used by:    opened from the player bar's `<img>` click, from the
 *   `…` menu's "Get Info" item, and from the track-row right-click menu.
 *
 * Notes:
 *  - The drawer is a CONTROLLED form — local React state holds the edits
 *    until you click Save, at which point it commits via the store's
 *    `updateTrackMeta`.
 *  - Title is editable but writes to the `display_title` column (a
 *    user-override that survives library re-scans). Empty input clears
 *    the override and reverts to the file's metadata. See the
 *    user-override pattern entry in LEARNED.md.
 *  - Artist and album are READ-ONLY in v0.1. Proper file-metadata
 *    writing (ID3 / MP4 atoms) is on the v0.2 roadmap.
 *  - Path tags (folder names) and Finder tags get an "adopt" affordance
 *    — click any one to copy it into the user-tags list.
 */
import { useEffect, useState } from 'react';
import type { Track } from '@shared/types';
import { useLibrary } from '../store/library';
import { Icon } from './Icon';
import { mediaUrl, formatTime, formatBytes } from '../util/format';

export function TrackDetailDrawer({ track, onClose }: { track: Track; onClose: () => void }) {
  const updateTrackMeta = useLibrary((s) => s.updateTrackMeta);
  const refreshAll = useLibrary((s) => s.refreshAll);
  const revealInFinder = useLibrary((s) => s.revealInFinder);
  const allUserTags = useLibrary((s) => s.userTags);

  const [title, setTitle] = useState(track.title);
  const [rating, setRating] = useState(track.rating);
  const [notes, setNotes] = useState(track.notes);
  const [tags, setTags] = useState<string[]>(track.userTags);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    setTitle(track.title);
    setRating(track.rating);
    setNotes(track.notes);
    setTags(track.userTags);
  }, [track.id]);

  const save = async () => {
    // Only send the title if it actually changed — skips a pointless write
    // and avoids a no-op DB row update. Trimming matches the DB's
    // empty-string-as-clear semantics.
    const patch: Partial<typeof track> = { rating, notes, userTags: tags };
    if (title.trim() !== track.title) (patch as any).title = title.trim();
    await updateTrackMeta(track.id, patch);
    await refreshAll();
    onClose();
  };

  const suggestions = allUserTags.filter(
    (t) => !tags.includes(t) && (tagInput === '' || t.toLowerCase().startsWith(tagInput.toLowerCase())),
  ).slice(0, 6);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          {track.artworkPath ? (
            <img className="drawer-art" src={mediaUrl(track.artworkPath)} alt="" />
          ) : (
            <div className="drawer-art drawer-art-placeholder"><Icon name="note" size={40} /></div>
          )}
          <div className="drawer-title-block">
            {/* The title is editable: click and type. Clearing the field and
             *  saving reverts to whatever's in the file's metadata. Artist /
             *  album are read-only in v0.1 — proper file-metadata writing is
             *  on the v0.2 roadmap. */}
            <input
              className="drawer-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              title="Edit the displayed title. Clearing it reverts to the file's metadata."
            />
            <div className="drawer-artist">{track.artist || 'Unknown artist'}</div>
            {track.album && <div className="drawer-album">{track.album}</div>}
          </div>
          <button className="drawer-close" onClick={onClose}><Icon name="close" size={16} /></button>
        </div>

        <div className="drawer-body">
          <div className="drawer-section">
            <label>Rating</label>
            <div className="rating-stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={`rating-star ${rating >= n ? 'on' : ''}`}
                  onClick={() => setRating(rating === n ? 0 : n)}
                ><Icon name={rating >= n ? 'star-filled' : 'star'} size={18} /></button>
              ))}
            </div>
          </div>

          <div className="drawer-section">
            <label>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What needs to be done? Who's it for? Any thoughts?"
              rows={5}
            />
          </div>

          <div className="drawer-section">
            <label>Tags</label>
            <div className="tag-editor">
              {tags.map((t, i) => (
                <span key={i} className="genre-tag">
                  {t}
                  <button onClick={() => setTags(tags.filter((_, idx) => idx !== i))}>
                    <Icon name="close" size={10} />
                  </button>
                </span>
              ))}
              <input
                placeholder="Add tag…"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tagInput.trim()) {
                    if (!tags.includes(tagInput.trim())) setTags([...tags, tagInput.trim()]);
                    setTagInput('');
                  }
                }}
              />
            </div>
            {suggestions.length > 0 && (
              <div className="tag-suggestions">
                {suggestions.map((s) => (
                  <button key={s} className="tag-suggestion" onClick={() => {
                    if (!tags.includes(s)) setTags([...tags, s]);
                    setTagInput('');
                  }}>+ {s}</button>
                ))}
              </div>
            )}
          </div>

          <div className="drawer-section">
            <label>Details</label>
            <div className="drawer-details">
              <Detail k="Duration" v={track.duration ? formatTime(track.duration) : '—'} />
              <Detail k="BPM" v={track.bpm ? String(Math.round(track.bpm)) : '—'} />
              <Detail k="Key" v={track.musicalKey || '—'} />
              <Detail k="Year" v={track.year ? String(track.year) : '—'} />
              <Detail k="Format" v={track.format || '—'} />
              <Detail k="Bitrate" v={track.bitrate ? `${Math.round(track.bitrate / 1000)} kbps` : '—'} />
              <Detail k="Sample rate" v={track.sampleRate ? `${track.sampleRate} Hz` : '—'} />
              <Detail k="Size" v={track.size ? formatBytes(track.size) : '—'} />
              <Detail k="Built-in genre" v={track.genre || '—'} />
              <Detail k="Loudness gain" v={track.loudnessGain ? `${(20 * Math.log10(track.loudnessGain)).toFixed(1)} dB` : '—'} />
            </div>
          </div>

          {track.finderTags.length > 0 && (
            <div className="drawer-section">
              <label>Finder tags</label>
              <div className="genre-tags">
                {track.finderTags.map((t) => {
                  const adopted = tags.includes(t);
                  return (
                    <button
                      key={t}
                      className={`genre-tag ${adopted ? '' : 'readonly adoptable'}`}
                      title={adopted ? 'Already a user tag' : 'Click to adopt as user tag'}
                      onClick={() => { if (!adopted) setTags([...tags, t]); }}
                    >
                      {t}{!adopted && <Icon name="plus" size={10} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {track.pathTags.length > 0 && (() => {
            const unadopted = track.pathTags.filter((t) => !tags.includes(t));
            return (
              <div className="drawer-section">
                <div className="drawer-section-header">
                  <label>Folder path</label>
                  {unadopted.length > 0 && (
                    <button
                      className="drawer-link"
                      onClick={() => setTags([...tags, ...unadopted])}
                      title="Add all folder segments as user tags"
                    >
                      <Icon name="plus" size={11} /> Adopt all as tags
                    </button>
                  )}
                </div>
                <div className="genre-tags">
                  {track.pathTags.map((t, i) => {
                    const adopted = tags.includes(t);
                    return (
                      <button
                        key={i}
                        className={`genre-tag ${adopted ? '' : 'readonly adoptable'}`}
                        title={adopted ? 'Already a user tag' : 'Click to adopt as user tag'}
                        onClick={() => { if (!adopted) setTags([...tags, t]); }}
                      >
                        {t}{!adopted && <Icon name="plus" size={10} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <div className="drawer-section">
            <label>File path</label>
            <div className="drawer-path">{track.path}</div>
            <button className="drawer-link" onClick={() => revealInFinder(track.path)}>
              <Icon name="finder" size={12} /> Show in Finder
            </button>
          </div>
        </div>

        <div className="drawer-footer">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <div className="drawer-detail">
      <span className="drawer-detail-k">{k}</span>
      <span className="drawer-detail-v">{v}</span>
    </div>
  );
}
