/**
 * Reusable popover primitive — used by the "..." menu, Speed control,
 * Scenes menu, and anywhere else we want a small floating panel
 * anchored to a button.
 *
 * Where it runs: renderer.
 * Depends on: React, ReactDOM's createPortal.
 * Used by:    PlayerBar (multiple), MultiTrackPanel (Scenes menu), and
 *   anywhere else that calls `usePopover()` + `<Popover>`.
 *
 * Notes:
 *  - Two exports: the `usePopover()` hook (state + position computation
 *    + close handling) and the `<Popover>` component (renders the
 *    panel into a React portal so z-index issues are avoided).
 *  - Closes on three signals: click the trigger again, click outside,
 *    or Escape. Implemented with a document-level mousedown listener
 *    that filters by `popoverRef`/`triggerRef.contains(target)`.
 *  - Position is computed ONCE at open time — `bottom + right` anchor
 *    relative to the trigger's bounding rect. The portal `style` is
 *    `position: fixed`, so the popover is positioned in viewport
 *    coordinates and unaffected by parent transforms.
 *  - The `.popover-portal` class in `index.css` resets `left: auto`
 *    because the base `.popover` class sets `left: 0` for the inline
 *    (non-portal) usage — without the reset, the portal popover
 *    stretches across the full viewport width. See LEARNED.md.
 */
import { useEffect, useRef, useState, useCallback, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

/**
 * Reusable popover anchored to a trigger element. Closes by:
 *   - clicking the trigger again
 *   - clicking anywhere outside the popover
 *   - Escape key
 *
 * Position is computed once on open (above + right-aligned to the trigger).
 */
export function usePopover() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties | null>(null);

  const computePos = useCallback(() => {
    if (!triggerRef.current) return null;
    const rect = triggerRef.current.getBoundingClientRect();
    return {
      position: 'fixed' as const,
      bottom: window.innerHeight - rect.top + 8,
      right: window.innerWidth - rect.right,
    };
  }, []);

  const toggle = useCallback(() => {
    if (open) { setOpen(false); return; }
    const p = computePos();
    if (!p) return;
    setPos(p);
    setOpen(true);
  }, [open, computePos]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return; // trigger handles its own toggle
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return { open, pos, toggle, close, triggerRef, popoverRef };
}

export function Popover({
  pos, popoverRef, children,
}: {
  pos: CSSProperties | null;
  popoverRef: React.RefObject<HTMLDivElement>;
  children: ReactNode;
}) {
  if (!pos) return null;
  return createPortal(
    <div className="popover popover-portal" style={pos} ref={popoverRef}>
      {children}
    </div>,
    document.body,
  );
}
