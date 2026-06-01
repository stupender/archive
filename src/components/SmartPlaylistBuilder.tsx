import { useState, useEffect } from 'react';
import type { FilterOptions } from '@shared/types';
import { useLibrary } from '../store/library';
import { Icon } from './Icon';

/**
 * Rule builder for Smart Playlists. Saves a JSON query into the playlist's
 * auto_query column. The query is later evaluated by listTracks every time
 * the playlist is viewed, so membership stays current automatically.
 *
 * Fields kept intentionally small: min rating, tags (AND), libraries, file
 * formats, "has notes". These are the most useful axes for archive review.
 */
export function SmartPlaylistBuilder({
  initial,
  onClose,
}: {
  /** When provided, edits an existing smart playlist; otherwise creates new. */
  initial?: { id: number; name: string; query: FilterOptions };
  onClose: () => void;
}) {
  const userTags = useLibrary((s) => s.userTags);
  const finderTags = useLibrary((s) => s.finderTags);
  const libraries = useLibrary((s) => s.libraries);
  const createSmartPlaylist = useLibrary((s) => s.createSmartPlaylist);
  const updateSmartPlaylist = useLibrary((s) => s.updateSmartPlaylist);

  const [name, setName] = useState(initial?.name ?? '');
  const [rating, setRating] = useState<number>(initial?.query.rating ?? 0);
  const [userTagsAll, setUserTagsAll] = useState<string[]>(initial?.query.userTagsAll ?? []);
  const [finderTagsAll, setFinderTagsAll] = useState<string[]>(initial?.query.finderTagsAll ?? []);
  const [libraryIds, setLibraryIds] = useState<number[]>(initial?.query.libraryIds ?? []);
  const [formats, setFormats] = useState<string[]>(initial?.query.formats ?? []);
  const [hasNotes, setHasNotes] = useState<boolean>(initial?.query.hasNotes ?? false);

  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleIn = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  const buildQuery = (): FilterOptions => {
    const q: FilterOptions = {};
    if (rating > 0) q.rating = rating;
    if (userTagsAll.length > 0) q.userTagsAll = userTagsAll;
    if (finderTagsAll.length > 0) q.finderTagsAll = finderTagsAll;
    if (libraryIds.length > 0) q.libraryIds = libraryIds;
    if (formats.length > 0) q.formats = formats;
    if (hasNotes) q.hasNotes = true;
    return q;
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const q = buildQuery();
    if (initial) await updateSmartPlaylist(initial.id, trimmed, q);
    else await createSmartPlaylist(trimmed, q);
    onClose();
  };

  return (
    <div className="smart-backdrop" onMouseDown={onClose}>
      <div className="smart-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="smart-header">
          <Icon name="playlist" size={16} />
          <span>{initial ? 'Edit Smart Playlist' : 'New Smart Playlist'}</span>
          <button className="smart-close" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>

        <div className="smart-body">
          <label className="smart-field">
            <span className="smart-label">Name</span>
            <input
              autoFocus
              className="smart-input"
              value={name}
              placeholder="e.g. Crowd Pleasers, Needs Lyrics, Field Sketches"
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <div className="smart-field">
            <span className="smart-label">Minimum rating</span>
            <div className="smart-stars">
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={`smart-star ${rating === n ? 'on' : ''}`}
                  onClick={() => setRating(n)}
                >
                  {n === 0 ? 'Any' : '★'.repeat(n)}
                </button>
              ))}
            </div>
          </div>

          {userTags.length > 0 && (
            <div className="smart-field">
              <span className="smart-label">Has all of these tags</span>
              <div className="smart-chips">
                {userTags.map((t) => (
                  <button
                    key={t}
                    className={`smart-chip ${userTagsAll.includes(t) ? 'on' : ''}`}
                    onClick={() => setUserTagsAll(toggleIn(userTagsAll, t))}
                  >
                    {userTagsAll.includes(t) && <Icon name="check" size={10} />} {t}
                  </button>
                ))}
                <input
                  className="smart-chip-input"
                  placeholder="+ tag…"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && tagInput.trim()) {
                      e.preventDefault();
                      const trimmed = tagInput.trim();
                      if (!userTagsAll.includes(trimmed)) setUserTagsAll([...userTagsAll, trimmed]);
                      setTagInput('');
                    }
                  }}
                />
              </div>
            </div>
          )}

          {finderTags.length > 0 && (
            <div className="smart-field">
              <span className="smart-label">Has all of these Finder tags</span>
              <div className="smart-chips">
                {finderTags.map((t) => (
                  <button
                    key={t}
                    className={`smart-chip ${finderTagsAll.includes(t) ? 'on' : ''}`}
                    onClick={() => setFinderTagsAll(toggleIn(finderTagsAll, t))}
                  >
                    {finderTagsAll.includes(t) && <Icon name="check" size={10} />} {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {libraries.length > 1 && (
            <div className="smart-field">
              <span className="smart-label">In libraries</span>
              <div className="smart-chips">
                {libraries.map((lib) => (
                  <button
                    key={lib.id}
                    className={`smart-chip ${libraryIds.includes(lib.id) ? 'on' : ''}`}
                    onClick={() => setLibraryIds(toggleIn(libraryIds, lib.id))}
                  >
                    {libraryIds.includes(lib.id) && <Icon name="check" size={10} />} {lib.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="smart-field">
            <span className="smart-label">File formats</span>
            <div className="smart-chips">
              {['wav', 'aif', 'aiff', 'mp3', 'm4a', 'flac', 'ogg'].map((f) => (
                <button
                  key={f}
                  className={`smart-chip ${formats.includes(f) ? 'on' : ''}`}
                  onClick={() => setFormats(toggleIn(formats, f))}
                >
                  {formats.includes(f) && <Icon name="check" size={10} />} {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <label className="smart-field smart-checkbox">
            <input type="checkbox" checked={hasNotes} onChange={(e) => setHasNotes(e.target.checked)} />
            <span>Has notes</span>
          </label>
        </div>

        <div className="smart-footer">
          <button className="smart-btn" onClick={onClose}>Cancel</button>
          <button className="smart-btn primary" onClick={save} disabled={!name.trim()}>
            {initial ? 'Save changes' : 'Create playlist'}
          </button>
        </div>
      </div>
    </div>
  );
}
