/**
 * One global keyboard shortcut handler for the whole app.
 *
 * Where it runs: renderer (called once from `<App />`).
 * Depends on: React, the Zustand store.
 * Used by:    App.tsx — `useKeyboardShortcuts()` mounts a single
 *   document-level `keydown` listener on mount.
 *
 * Notes:
 *  - All shortcuts are skipped when the user is typing in an input or
 *    textarea — except ⌘F (focus search) and ⌘L (jump to current
 *    track), which should always work.
 *  - Most actions read fresh state via `useLibrary.getState()` rather
 *    than React-subscribed values, so the handler always sees the
 *    latest (no stale-closure bugs).
 *  - Space-to-play also blurs whatever button last had focus, so
 *    Space doesn't accidentally re-click Loop/Shuffle/etc.
 */
import { useEffect } from 'react';
import { useLibrary } from '../store/library';

/**
 * Apple Music–style shortcuts:
 *   Space            play/pause (or start the first track if nothing's loaded)
 *   ←/→              seek -5s / +5s
 *   ⌘← / ⌘→          previous / next track
 *   ⌘↑ / ⌘↓          volume up / down
 *   ⌘F               focus search
 *   ⌘L               jump to currently playing song in Songs view
 *   R                toggle reverse
 *   L                toggle loop on/off (default = repeat current song)
 *   1                set loop start at current position
 *   2                set loop end at current position
 *   S                shuffle toggle
 *   Esc              clear loop region / blur search
 *
 * Skipped when typing in inputs/textareas/contenteditables (except ⌘F/⌘L).
 */
export function useKeyboardShortcuts() {
  const togglePlay = useLibrary((s) => s.togglePlay);
  const next = useLibrary((s) => s.next);
  const previous = useLibrary((s) => s.previous);
  const seek = useLibrary((s) => s.seek);
  const setVolume = useLibrary((s) => s.setVolume);
  const setReversed = useLibrary((s) => s.setReversed);
  const setLoopActive = useLibrary((s) => s.setLoopActive);
  const setLoopRegion = useLibrary((s) => s.setLoopRegion);
  const setLoopStart = useLibrary((s) => s.setLoopStart);
  const setLoopEnd = useLibrary((s) => s.setLoopEnd);
  const setShuffle = useLibrary((s) => s.setShuffle);
  const jumpToTrackInLibrary = useLibrary((s) => s.jumpToTrackInLibrary);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isInInput =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;

      const cmd = e.metaKey || e.ctrlKey;
      const s = useLibrary.getState();

      // ⌘F always works to focus search
      if (cmd && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>('.topbar-search');
        if (input) {
          input.focus();
          input.select();
        }
        return;
      }

      // ⌘L → jump to currently playing track in Songs view
      if (cmd && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        if (s.currentTrack) jumpToTrackInLibrary(s.currentTrack);
        return;
      }

      // Esc when in search → blur it
      if (e.key === 'Escape' && tag === 'INPUT' && (target as HTMLInputElement).className.includes('topbar-search')) {
        (target as HTMLInputElement).blur();
        return;
      }

      // Skip everything else if typing
      if (isInInput) return;

      switch (e.key) {
        case ' ':
          // Prevent default *button activation* by blurring whatever button
          // last had focus. Without this, Space "clicks" the focused button
          // (Loop, Shuffle, etc.) instead of toggling play.
          e.preventDefault();
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          togglePlay();
          return;
        case 'ArrowRight':
          e.preventDefault();
          if (cmd) next();
          else if (s.duration) seek(Math.min(s.duration, s.currentTime + 5));
          return;
        case 'ArrowLeft':
          e.preventDefault();
          if (cmd) previous();
          else seek(Math.max(0, s.currentTime - 5));
          return;
        case 'ArrowUp':
          if (cmd) {
            e.preventDefault();
            setVolume(Math.min(1, s.volume + 0.05));
          }
          return;
        case 'ArrowDown':
          if (cmd) {
            e.preventDefault();
            setVolume(Math.max(0, s.volume - 0.05));
          }
          return;
        case 'r':
        case 'R':
          if (cmd) return; // don't hijack ⌘R reload
          e.preventDefault();
          setReversed(!s.reversed);
          return;
        case 'l':
        case 'L':
          if (cmd) return;
          e.preventDefault();
          setLoopActive(!s.loopActive);
          return;
        case '1':
          e.preventDefault();
          setLoopStart();
          return;
        case '2':
          e.preventDefault();
          setLoopEnd();
          return;
        case 's':
        case 'S':
          if (cmd) return;
          e.preventDefault();
          setShuffle(!s.shuffle);
          return;
        case 't':
        case 'T':
          if (cmd) return; // don't hijack ⌘T new-tab type shortcuts
          {
            // Tag target priority: multi-selection → single selection → currently playing.
            let ids: number[] = [];
            if (s.selectedTrackIds.length > 0) ids = s.selectedTrackIds;
            else if (s.currentTrack) ids = [s.currentTrack.id];
            if (ids.length > 0) {
              e.preventDefault();
              useLibrary.getState().openQuickTag(ids);
            }
          }
          return;
        case 'Escape':
          if (s.loopActive || s.loopRegion) {
            e.preventDefault();
            setLoopActive(false);
            setLoopRegion(null);
          }
          return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlay, next, previous, seek, setVolume, setReversed, setLoopActive, setLoopRegion, setLoopStart, setLoopEnd, setShuffle, jumpToTrackInLibrary]);
}
