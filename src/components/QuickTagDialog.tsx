/**
 * The "Quick Tag" overlay — a Spotlight-style centered dialog for tagging
 * one or many tracks without leaving your listening flow.
 *
 * Where it runs: renderer.
 * Depends on: the Zustand store (`quickTagTrackIds` state +
 *   `addTagToTracks` / `removeTagFromTracks` actions), Icon.
 * Used by:    rendered once at the App level; opened by the `T`
 *   keyboard shortcut and by the right-click "Tag (T)…" menu item.
 *
 * Notes:
 *  - Opening is driven by the store's `quickTagTrackIds` array. Empty
 *    array = closed. Setting it to a non-empty array opens the dialog
 *    pointed at those tracks (bulk tagging).
 *  - The dialog remembers what had focus when it opened, and restores
 *    it on close — important for keyboard-driven flow. (You don't lose
 *    your selection in the track list.)
 *  - Enter adds the typed tag and clears the input so you can rapid-
 *    fire multiple tags. Tab autocompletes the top suggestion.
 *  - For bulk, the "current tags" chips show only tags COMMON to all
 *    selected tracks (so removing a tag is meaningful for the whole
 *    selection).
 *  - Designed to "stay embodied" — single keystroke open, no drawer
 *    dive, single keystroke close.
 */
import { useEffect, useState, useMemo } from 'react';
import { useLibrary } from '../store/library';
import { Icon } from './Icon';

/**
 * Spotlight-style inline tag dialog. Opens with T (or from the bulk-select
 * action). Focuses an input, suggests existing tags from a fuzzy prefix
 * match. Enter adds the tag and clears the input so you can fire several
 * tags rapidly; Esc closes.
 *
 * Designed to "stay embodied" — single keystroke open, no drawer dive,
 * focus returns to wherever it was when the dialog closes.
 */
export function QuickTagDialog() {
  const trackIds = useLibrary((s) => s.quickTagTrackIds);
  const close = useLibrary((s) => s.closeQuickTag);
  const addTag = useLibrary((s) => s.addTagToTracks);
  const removeTag = useLibrary((s) => s.removeTagFromTracks);
  const tracks = useLibrary((s) => s.tracks);
  const userTags = useLibrary((s) => s.userTags);
  const currentTrack = useLibrary((s) => s.currentTrack);

  const [input, setInput] = useState('');
  const [restoreFocusEl, setRestoreFocusEl] = useState<HTMLElement | null>(null);
  const open = trackIds.length > 0;

  // Remember what had focus when we opened so we can restore on close —
  // important for keyboard-driven flow.
  useEffect(() => {
    if (open) {
      setRestoreFocusEl(document.activeElement as HTMLElement | null);
      setInput('');
    } else if (restoreFocusEl) {
      try { restoreFocusEl.focus(); } catch {}
      setRestoreFocusEl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Resolve target tracks (prefer in-memory, fall back to currentTrack).
  const targets = useMemo(() => {
    if (!open) return [] as { id: number; title: string; userTags: string[] }[];
    const out: { id: number; title: string; userTags: string[] }[] = [];
    for (const id of trackIds) {
      const t = tracks.find((tr) => tr.id === id);
      if (t) out.push({ id: t.id, title: t.title, userTags: t.userTags });
      else if (currentTrack?.id === id) {
        out.push({ id: currentTrack.id, title: currentTrack.title, userTags: currentTrack.userTags });
      } else {
        out.push({ id, title: '…', userTags: [] });
      }
    }
    return out;
  }, [open, trackIds, tracks, currentTrack]);

  // Tags shared by ALL selected tracks (so "remove" works sensibly on bulk).
  const commonTags = useMemo(() => {
    if (targets.length === 0) return [];
    const first = new Set(targets[0].userTags);
    for (const t of targets.slice(1)) {
      for (const tag of Array.from(first)) {
        if (!t.userTags.includes(tag)) first.delete(tag);
      }
    }
    return Array.from(first);
  }, [targets]);

  // Suggestions: existing tags not already on (all of) the selection that
  // match the typed prefix. Case-insensitive.
  const suggestions = useMemo(() => {
    const lower = input.trim().toLowerCase();
    const excluded = new Set(commonTags);
    return userTags
      .filter((t) => !excluded.has(t) && (lower === '' || t.toLowerCase().includes(lower)))
      .slice(0, 6);
  }, [userTags, input, commonTags]);

  if (!open) return null;

  const submit = async (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    await addTag(trackIds, trimmed);
    setInput('');
  };

  return (
    <div className="quicktag-backdrop" onMouseDown={() => close()}>
      <div className="quicktag-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="quicktag-header">
          <Icon name="tag" size={14} />
          <span className="quicktag-target">
            {targets.length === 1
              ? <>Tag <strong>{targets[0].title}</strong></>
              : <>Tag {targets.length} tracks</>}
          </span>
        </div>

        {commonTags.length > 0 && (
          <div className="quicktag-existing">
            {commonTags.map((t) => (
              <button
                key={t}
                className="genre-tag quicktag-existing-chip"
                onClick={() => removeTag(trackIds, t)}
                title="Click to remove"
              >
                {t}
                <Icon name="close" size={10} />
              </button>
            ))}
          </div>
        )}

        <input
          autoFocus
          className="quicktag-input"
          value={input}
          placeholder={commonTags.length > 0 ? 'Add another tag…' : 'Type a tag and press Enter'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              // If user is hovering a suggestion via Tab, use that; otherwise the typed value.
              submit(input);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              close();
            } else if (e.key === 'Tab' && suggestions[0]) {
              e.preventDefault();
              setInput(suggestions[0]);
            }
          }}
        />

        {suggestions.length > 0 && (
          <div className="quicktag-suggestions">
            {suggestions.map((s) => (
              <button
                key={s}
                className="quicktag-suggestion"
                onMouseDown={(e) => { e.preventDefault(); submit(s); }}
              >
                <Icon name="plus" size={10} /> {s}
              </button>
            ))}
          </div>
        )}

        <div className="quicktag-hint">
          <kbd>Enter</kbd> add &amp; continue · <kbd>Tab</kbd> complete · <kbd>Esc</kbd> close
        </div>
      </div>
    </div>
  );
}
