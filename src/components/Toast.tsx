/**
 * Tiny notification banner at the bottom of the screen — auto-dismisses
 * after 6 seconds, or click to dismiss.
 *
 * Where it runs: renderer.
 * Depends on: the Zustand store (`toast` state + `setToast` action).
 * Used by:    `App.tsx` renders one of these globally. Any code path
 *   (a store action, a component) can summon a toast by calling
 *   `setToast({ kind: 'info' | 'error', message })`.
 */
import { useEffect } from 'react';
import { useLibrary } from '../store/library';

export function Toast() {
  const toast = useLibrary((s) => s.toast);
  const setToast = useLibrary((s) => s.setToast);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast, setToast]);

  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.kind}`} onClick={() => setToast(null)}>
      <span className="toast-message">{toast.message}</span>
      <button className="toast-close">×</button>
    </div>
  );
}
