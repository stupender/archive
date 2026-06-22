/**
 * The strip across the top of the main pane: the page heading, the
 * track count, the search field, the sort selector, the rescan
 * button, and any active tag-filter chips.
 *
 * Where it runs: renderer.
 * Depends on: the Zustand store, Icon.
 * Used by:    rendered once inside `App.tsx`'s `.main` column.
 *
 * Notes:
 *  - The heading is computed from the current view kind plus the
 *    active library selection. "All Songs" when no libraries are
 *    selected, the library name when one is, "N libraries" when many.
 *  - Search / sort / rescan / filter chips only appear in views where
 *    they make sense (i.e. they hide on Random Review and Multi-Track).
 *  - The Topbar is also the drag region for the macOS window — the
 *    whole bar is `-webkit-app-region: drag` in the CSS, with the
 *    interactive children explicitly opted out.
 */
import { useLibrary } from '../store/library';
import { Icon } from './Icon';

export function Topbar() {
  const search = useLibrary((s) => s.search);
  const setSearch = useLibrary((s) => s.setSearch);
  const view = useLibrary((s) => s.view);
  const sort = useLibrary((s) => s.sort);
  const setSort = useLibrary((s) => s.setSort);
  const scan = useLibrary((s) => s.scan);
  const tracks = useLibrary((s) => s.tracks);
  const libraries = useLibrary((s) => s.libraries);
  const activeLibraryIds = useLibrary((s) => s.activeLibraryIds);
  const filterUserTags = useLibrary((s) => s.filterUserTags);
  const filterFinderTags = useLibrary((s) => s.filterFinderTags);
  const toggleUserTagFilter = useLibrary((s) => s.toggleUserTagFilter);
  const toggleFinderTagFilter = useLibrary((s) => s.toggleFinderTagFilter);
  const clearTagFilters = useLibrary((s) => s.clearTagFilters);
  const hasFilters = filterUserTags.length > 0 || filterFinderTags.length > 0;

  const heading = (() => {
    switch (view.kind) {
      case 'songs': {
        if (activeLibraryIds.length === 0) return 'All Songs';
        if (activeLibraryIds.length === 1) {
          const lib = libraries.find((l) => l.id === activeLibraryIds[0]);
          return lib ? lib.name : 'Songs';
        }
        return `${activeLibraryIds.length} libraries`;
      }
      case 'history': return 'Listening History';
      case 'random-review': return 'Random Review';
      case 'multi-track': return 'Multi-Track Collage';
      case 'playlist':  return view.name;
    }
  })();

  const showControls = view.kind !== 'random-review' && view.kind !== 'multi-track';

  return (
    <div className="topbar">
      <div className="topbar-left">
        <h1 className="topbar-title">{heading}</h1>
        {showControls && (
          <span className="topbar-count">{tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}</span>
        )}
        {showControls && hasFilters && (
          <div className="topbar-filter-chips">
            {filterUserTags.map((t) => (
              <button key={'u' + t} className="topbar-filter-chip" onClick={() => toggleUserTagFilter(t)} title="Remove filter">
                <Icon name="tag" size={10} /> {t} <Icon name="close" size={10} />
              </button>
            ))}
            {filterFinderTags.map((t) => (
              <button key={'f' + t} className="topbar-filter-chip" onClick={() => toggleFinderTagFilter(t)} title="Remove filter">
                <Icon name="tag" size={10} /> {t} <Icon name="close" size={10} />
              </button>
            ))}
            {(filterUserTags.length + filterFinderTags.length) > 1 && (
              <button className="topbar-filter-clear" onClick={() => clearTagFilters()}>clear all</button>
            )}
          </div>
        )}
      </div>
      <div className="topbar-right">
        {showControls && (
          <>
            <div className="topbar-search-wrap">
              <Icon name="search" size={13} className="topbar-search-icon" />
              <input
                className="topbar-search"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="topbar-sort"
              value={`${sort.field}:${sort.direction}`}
              onChange={(e) => {
                const [field, direction] = e.target.value.split(':');
                setSort({ field: field as any, direction: direction as any });
              }}
            >
              <option value="addedAt:desc">Recently Added</option>
              <option value="title:asc">Title (A–Z)</option>
              <option value="title:desc">Title (Z–A)</option>
              <option value="artist:asc">Artist (A–Z)</option>
              <option value="rating:desc">Highest Rated</option>
              <option value="duration:asc">Shortest</option>
              <option value="duration:desc">Longest</option>
              <option value="bpm:asc">BPM (slow → fast)</option>
            </select>
          </>
        )}
        <button className="topbar-btn" onClick={() => scan()} title="Rescan all libraries">
          <Icon name="refresh" size={14} />
        </button>
      </div>
    </div>
  );
}
