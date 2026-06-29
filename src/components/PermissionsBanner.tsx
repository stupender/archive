/**
 * Persistent banner shown when macOS TCC blocks file access — typically
 * when the library is on an external drive and the app is unsigned.
 *
 * Where it runs: renderer.
 * Depends on: the Zustand store (reads `permissionsBanner`, calls
 *   `closePermissionsBanner` and `openSystemPrivacySettings`).
 * Used by:    `App.tsx` renders this above everything else when
 *   `permissionsBanner.open` is true.
 *
 * Notes:
 *  - Unlike Toast, this banner does NOT auto-dismiss — the user needs to
 *    take action (grant Full Disk Access in System Settings) before
 *    playback works.
 *  - The "Open System Settings" button deeplinks to the right Settings
 *    pane via `shell.openExternal` in the main process.
 *  - Once permission is granted, the user re-clicks Play and we just
 *    proceed normally; we don't poll for permission changes.
 */
import { useLibrary } from '../store/library';
import { Icon } from './Icon';

export function PermissionsBanner() {
  const banner = useLibrary((s) => s.permissionsBanner);
  const close = useLibrary((s) => s.closePermissionsBanner);
  const openSettings = useLibrary((s) => s.openSystemPrivacySettings);

  if (!banner.open) return null;

  return (
    <div className="permissions-banner">
      <div className="permissions-banner-icon"><Icon name="info" size={20} /></div>
      <div className="permissions-banner-body">
        <div className="permissions-banner-title">Archive needs permission to read this file</div>
        <div className="permissions-banner-message">
          macOS is blocking access — usually because your library is on an external drive.
          Grant Archive “Full Disk Access” in System Settings and try playing again.
          {banner.path && (
            <div className="permissions-banner-path" title={banner.path}>{banner.path}</div>
          )}
        </div>
      </div>
      <div className="permissions-banner-actions">
        <button className="permissions-banner-btn primary" onClick={() => openSettings()}>
          Open System Settings
        </button>
        <button className="permissions-banner-btn" onClick={() => close()}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
