/**
 * The left rail: Libraries (multi-select toggles, drag-to-reorder),
 * Library browse modes (Songs / Random Review / Multi-Track / History),
 * Playlists (manual + smart), Tags, Finder Tags.
 *
 * Where it runs: renderer.
 * Depends on: the Zustand store, SmartPlaylistBuilder, Icon.
 * Used by:    rendered once by `App.tsx`.
 *
 * Notes:
 *  - "Libraries" rows are TOGGLES, not navigation — clicking one filters
 *    every other view to that library. ⌘-click toggles multi-select.
 *    Empty selection = "all libraries."
 *  - Drag-to-reorder uses native HTML5 drag-and-drop. The blue line
 *    that appears between rows during a drag is the `drop-above` /
 *    `drop-below` indicator in `index.css`.
 *  - Tag rows in the lower sections work the same way: clicking a tag
 *    toggles it into the global tag filter (AND-combined with the
 *    current view). The active filters also show as chips in the
 *    Topbar with × to clear.
 *  - The "+" beside Playlists opens a tiny inline menu choosing
 *    between Playlist (manual) and Smart Playlist (rule builder).
 *    Smart playlists render with a dice icon; double-click to edit
 *    their rules in the SmartPlaylistBuilder modal.
 */
import { useState } from 'react';
import { useLibrary } from '../store/library';
import type { View } from '../store/library';
import type { Playlist } from '@shared/types';
import { Icon, type IconName } from './Icon';
import { SmartPlaylistBuilder } from './SmartPlaylistBuilder';

export function Sidebar() {
  const view = useLibrary((s) => s.view);
  const setView = useLibrary((s) => s.setView);
  const playlists = useLibrary((s) => s.playlists);
  const userTags = useLibrary((s) => s.userTags);
  const finderTags = useLibrary((s) => s.finderTags);
  const libraries = useLibrary((s) => s.libraries);
  const activeLibraryIds = useLibrary((s) => s.activeLibraryIds);
  const toggleLibrary = useLibrary((s) => s.toggleLibrary);
  const addLibrary = useLibrary((s) => s.addLibrary);
  const deleteLibrary = useLibrary((s) => s.deleteLibrary);
  const renameLibrary = useLibrary((s) => s.renameLibrary);
  const reorderLibraries = useLibrary((s) => s.reorderLibraries);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const deletePlaylist = useLibrary((s) => s.deletePlaylist);
  const filterUserTags = useLibrary((s) => s.filterUserTags);
  const filterFinderTags = useLibrary((s) => s.filterFinderTags);
  const toggleUserTagFilter = useLibrary((s) => s.toggleUserTagFilter);
  const toggleFinderTagFilter = useLibrary((s) => s.toggleFinderTagFilter);
  const clearTagFilters = useLibrary((s) => s.clearTagFilters);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [smartOpen, setSmartOpen] = useState<null | { id: number; name: string; query: any } | true>(null);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);

  const isActive = (v: View) => JSON.stringify(view) === JSON.stringify(v);

  return (
    <aside className="sidebar">
      <div className="sidebar-drag-region" />

      {/* Libraries — multi-select toggles. They scope every other view. */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">
          <span>Libraries</span>
          <button className="sidebar-add-btn" title="Add library" onClick={() => addLibrary()}>
            <Icon name="plus" size={14} />
          </button>
        </div>

        {libraries.map((lib) => {
          const on = activeLibraryIds.includes(lib.id);
          // Compute which side of the target the drop line should appear on.
          // The splice logic inserts BEFORE the target when dragging up the
          // list and AFTER the target when dragging down, so the visual line
          // matches that real behavior.
          let dropClass = '';
          if (dragOverId === lib.id && dragId != null && dragId !== lib.id) {
            const dragIdx = libraries.findIndex((l) => l.id === dragId);
            const targetIdx = libraries.findIndex((l) => l.id === lib.id);
            dropClass = targetIdx < dragIdx ? 'drop-above' : 'drop-below';
          }
          return (
            <div
              key={lib.id}
              className={`sidebar-toggle ${on ? 'on' : ''} ${dropClass} ${dragId === lib.id ? 'dragging' : ''}`}
              draggable={renaming !== lib.id}
              onDragStart={(e) => {
                setDragId(lib.id);
                e.dataTransfer.effectAllowed = 'move';
                try { e.dataTransfer.setData('text/plain', String(lib.id)); } catch {}
              }}
              onDragOver={(e) => {
                if (dragId == null || dragId === lib.id) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverId(lib.id);
              }}
              onDragLeave={() => setDragOverId((cur) => (cur === lib.id ? null : cur))}
              onDrop={async (e) => {
                e.preventDefault();
                if (dragId == null || dragId === lib.id) {
                  setDragId(null); setDragOverId(null);
                  return;
                }
                const order = libraries.map((l) => l.id);
                const fromIdx = order.indexOf(dragId);
                const toIdx = order.indexOf(lib.id);
                if (fromIdx < 0 || toIdx < 0) { setDragId(null); setDragOverId(null); return; }
                order.splice(fromIdx, 1);
                order.splice(toIdx, 0, dragId);
                setDragId(null); setDragOverId(null);
                await reorderLibraries(order);
              }}
              onDragEnd={() => { setDragId(null); setDragOverId(null); }}
              onClick={(e) => {
                if (renaming === lib.id) return;
                toggleLibrary(lib.id, !(e.metaKey || e.shiftKey));
              }}
              onDoubleClick={() => { setRenaming(lib.id); setRenameVal(lib.name); }}
              title={`${lib.path} — drag to reorder; ⌘-click to multi-select`}
            >
              <span className="sidebar-toggle-grip" title="Drag to reorder">
                <Icon name="grip" size={12} />
              </span>
              <span className="sidebar-toggle-check">
                {on && <Icon name="check" size={11} />}
              </span>
              {renaming === lib.id ? (
                <input
                  autoFocus
                  className="sidebar-rename-input"
                  value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={() => { setRenaming(null); }}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && renameVal.trim()) {
                      await renameLibrary(lib.id, renameVal.trim());
                      setRenaming(null);
                    } else if (e.key === 'Escape') {
                      setRenaming(null);
                    }
                  }}
                />
              ) : (
                <span className="sidebar-toggle-label">{lib.name}</span>
              )}
              <button
                className="sidebar-item-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Remove library "${lib.name}"? Tracks will be removed from the database.`)) {
                    deleteLibrary(lib.id);
                  }
                }}
                title="Remove library"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Browse — different ways to surface the active libraries */}
      <div className="sidebar-section">
        <div className="sidebar-section-title"><span>Library</span></div>
        <SidebarItem
          icon="library"
          label="Songs"
          active={isActive({ kind: 'songs' })}
          onClick={() => setView({ kind: 'songs' })}
        />
        <SidebarItem
          icon="dice"
          label="Random Review"
          active={isActive({ kind: 'random-review' })}
          onClick={() => setView({ kind: 'random-review' })}
        />
        <SidebarItem
          icon="layers"
          label="Multi-Track"
          active={isActive({ kind: 'multi-track' })}
          onClick={() => setView({ kind: 'multi-track' })}
        />
        <SidebarItem
          icon="history"
          label="History"
          active={isActive({ kind: 'history' })}
          onClick={() => setView({ kind: 'history' })}
        />
      </div>

      {/* Playlists — above Tags */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">
          <span>Playlists</span>
          <div className="sidebar-add-wrapper">
            <button className="sidebar-add-btn" title="Add playlist" onClick={() => setShowPlaylistMenu(!showPlaylistMenu)}>
              <Icon name="plus" size={14} />
            </button>
            {showPlaylistMenu && (
              <>
                <div className="sidebar-add-backdrop" onClick={() => setShowPlaylistMenu(false)} />
                <div className="sidebar-add-menu">
                  <button onClick={() => { setShowPlaylistMenu(false); setAdding(true); }}>
                    <Icon name="playlist" size={12} /> New Playlist
                  </button>
                  <button onClick={() => { setShowPlaylistMenu(false); setSmartOpen(true); }}>
                    <Icon name="dice" size={12} /> New Smart Playlist…
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        {adding && (
          <input
            autoFocus
            className="sidebar-new-playlist"
            placeholder="Playlist name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={() => { setAdding(false); setNewName(''); }}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && newName.trim()) {
                await createPlaylist(newName.trim());
                setAdding(false);
                setNewName('');
              } else if (e.key === 'Escape') {
                setAdding(false);
                setNewName('');
              }
            }}
          />
        )}
        {playlists.length === 0 && !adding && (
          <div className="sidebar-empty-hint">No playlists yet</div>
        )}
        {playlists.map((p: Playlist) => (
          <div
            key={p.id}
            className={`sidebar-item ${isActive({ kind: 'playlist', id: p.id, name: p.name }) ? 'active' : ''}`}
            onClick={() => setView({ kind: 'playlist', id: p.id, name: p.name })}
            onDoubleClick={() => {
              if (p.isAuto) {
                try {
                  const q = p.autoQuery ? JSON.parse(p.autoQuery) : {};
                  setSmartOpen({ id: p.id, name: p.name, query: q });
                } catch {}
              }
            }}
            title={p.isAuto ? 'Smart playlist — double-click to edit rules' : p.name}
          >
            <span className="sidebar-item-icon">
              <Icon name={p.isAuto ? 'dice' : 'playlist'} size={16} />
            </span>
            <span className="sidebar-item-label">{p.name}</span>
            <button
              className="sidebar-item-delete"
              onClick={(e) => { e.stopPropagation(); deletePlaylist(p.id); }}
              title="Delete"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>

      {smartOpen !== null && (
        <SmartPlaylistBuilder
          initial={smartOpen === true ? undefined : smartOpen}
          onClose={() => setSmartOpen(null)}
        />
      )}

      {/* Tags — click to AND-combine into the filter. */}
      {userTags.length > 0 && (
        <div className="sidebar-section">
          <div className="sidebar-section-title">
            <span>Tags</span>
            {filterUserTags.length > 0 && (
              <button className="sidebar-clear" onClick={() => clearTagFilters()} title="Clear tag filters">
                clear
              </button>
            )}
          </div>
          {userTags.map((t) => (
            <TagToggle
              key={t}
              label={t}
              on={filterUserTags.includes(t)}
              onClick={() => toggleUserTagFilter(t)}
            />
          ))}
        </div>
      )}

      {finderTags.length > 0 && (
        <div className="sidebar-section">
          <div className="sidebar-section-title"><span>Finder Tags</span></div>
          {finderTags.map((t) => (
            <TagToggle
              key={t}
              label={t}
              on={filterFinderTags.includes(t)}
              onClick={() => toggleFinderTagFilter(t)}
            />
          ))}
        </div>
      )}
    </aside>
  );
}

function TagToggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <div className={`sidebar-toggle sidebar-tag ${on ? 'on' : ''}`} onClick={onClick} title={label}>
      <span className="sidebar-toggle-check">{on && <Icon name="check" size={11} />}</span>
      <span className="sidebar-item-icon"><Icon name="tag" size={14} /></span>
      <span className="sidebar-toggle-label">{label}</span>
    </div>
  );
}

function SidebarItem({
  icon, label, active, onClick, onDelete,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className={`sidebar-item ${active ? 'active' : ''}`} onClick={onClick} title={label}>
      <span className="sidebar-item-icon"><Icon name={icon} size={16} /></span>
      <span className="sidebar-item-label">{label}</span>
      {onDelete && (
        <button
          className="sidebar-item-delete"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete"
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}
