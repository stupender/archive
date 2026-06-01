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
