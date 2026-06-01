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
