# LEARNED.md — running log of concepts touched

A one-line entry per real concept we encounter, plus a pointer to where
in the code it lives. Grows as we work. At the very end of the project
this gets expanded into a proper `STUDY_GUIDE.md` (the teaching pass).

The format is:

> **Concept name** — short plain-English explanation — `path/to/file.ts:line` (or just `path/to/file.ts`)

## Concepts

> **Removing a feature in a two-process app means walking four layers.**
> A feature reaches across (1) the renderer's UI component that calls
> it, (2) the typed bridge method on `window.sonic` in the preload, (3)
> the `ipcMain.handle('thing:action', …)` handler in main, and (4) any
> helper functions in any of those. Skip a layer and you get either a
> TS compile error or dead unreachable code. The Step-1 Soundscape
> removal touched `MultiTrackPanel.tsx`, `electron/preload.ts`,
> `electron/main.ts`, and deleted `src/audio/loopExport.ts`. Verify with
> `npx tsc --noEmit` and `grep -rn` for any lingering name.

> **`OfflineAudioContext` (concept I noticed while reading, not used in
> v0.1)** — the deleted Soundscape exporter used `OfflineAudioContext`
> to render a loop region to PCM samples without playing it. The same
> mechanism is how the future Loop Library (v0.3) will export `.wav`
> files. Worth knowing it exists. Removed file: was `src/audio/loopExport.ts`.

> **`noUnusedLocals` / `noUnusedParameters` are your free dead-code
> detector.** Turning them on in `tsconfig.json` immediately surfaces
> every unused import and every dead destructure across the whole
> project. They don't catch *exported* but uncalled symbols (TS can't
> know they aren't used by someone outside the project), so for those
> you have to grep manually — see `LEARNED.md` entry about
> grep-for-callers. Strict checking is what found unused `spawn` and
> unused `setLoopRegion` in this step — see `tsconfig.json` lines
> `noUnusedLocals` and `noUnusedParameters`.

> **TypeScript can't tell you about unused *exports*.** `getDB` and
> `findLibraryForPath` in `electron/db.ts` were exported but never
> called anywhere. TS leaves them alone because some other project
> *might* import them. In a single-app codebase, this means: any time
> you see an `export function X`, grep `grep -rn "X\\b" src electron`
> to see if anything calls it. If nothing does, it's dead.

> **Electron's userData path comes from `app.getName()`, which defaults
> to package.json's `name`.** That coupling means renaming the package
> moves the data folder too — destroying existing libraries, ratings,
> and tags on disk (they're still there, just at the old path). One
> line at the top of `electron/main.ts` — `app.setName('sonic-archive')`
> — locks the internal name *before* anything reads the userData path,
> so we can rename the user-facing product to "Archive" without
> shifting where data is stored. See `electron/main.ts` near the top.

> **Vestigial code reproduces itself.** Two "view kinds" called
> `userTag` and `finderTag` existed in the View union, were handled in
> `buildFilter`, and were rendered in the Topbar — but nothing in the
> app actually *set* a view to either of them anymore (the UX moved to
> AND-combine filters). They'd been left behind during a refactor,
> labeled "vestigial for back-compat." Three months later the next
> session has to read all of it and reason about it. Lesson: when you
> finish a refactor, delete the old code in the same commit. If you
> can't, leave a `TODO(decommission)` with a date.

> **Electron disables `window.prompt()` (and the modal `window.alert()`
> blocks the main thread, and `window.confirm()` doesn't show a native
> dialog).** Calls to `prompt()` silently return `undefined`. Two bugs
> in Archive were caused by this: "Save current as scene" and
> "+ New playlist". The fix is the **inline-input-in-popover** pattern:
> the menu item *becomes* a small `<input autoFocus>` when clicked;
> Enter submits, Esc cancels. See `ScenesMenu` in
> `src/components/MultiTrackPanel.tsx` and the popover in
> `src/components/RandomReviewPanel.tsx`. This pattern matches Archive's
> "stay embodied" principle better than a modal dialog anyway.

> **When you mount a small input UI inside a conditionally-rendered
> popover, reset its state when the popover closes.** Without a
> `useEffect(() => { if (!open) reset(...) }, [open])`, reopening the
> popover would show stale half-typed text. See `ScenesMenu` and the
> Add-to-playlist popover in `RandomReviewPanel.tsx`.

> **`onMouseLeave`-to-close on a popover is fragile.** It works fine
> for a menu of buttons, but the moment the popover contains an
> `<input>` the user is typing in, moving the cursor a few pixels can
> dismiss the input mid-keystroke. Either use a click-outside listener
> (like the `usePopover` hook in `src/components/Popover.tsx`) or
> conditionally suppress `onMouseLeave` while in input mode — Archive
> does the latter in the Random Review playlist popover for minimal
> change.

> **Setting `left` AND `right` on a positioned element stretches it
> across the available width.** This caused the Scenes / "..." / speed
> popovers to unfurl across the entire screen to the left edge. The
> base `.popover` class set `left: 0` for inline popovers; the portal
> variant added a `right: <px>` inline — so the popover suddenly had
> both, and CSS dutifully made it span from one to the other. The fix
> is `left: auto` on `.popover-portal` so only the `right` anchor is in
> effect. Same gotcha applies to `top` + `bottom`. See `src/styles/index.css`
> `.popover-portal`.

> **`package.json` has three name fields, and they do different things
> in an Electron app.** `name` is the npm/internal id (URL-safe, lower-
> case). `productName` is what macOS shows in the Dock, Finder, the
> About panel, and the .dmg filename. `build.appId` is the macOS bundle
> identifier (reverse-domain like `com.stupender.archive`) used for
> code-signing and OS-level identity. We renamed Archive's
> `productName` to "Archive" and the `appId` to `com.stupender.archive`,
> but kept `name: "sonic-archive"` so the userData path (locked by
> `app.setName` in `electron/main.ts`) stays stable across the rename.

> **User-override pattern: split "from-source" and "user-edit" into
> separate DB columns.** When you have data that gets refreshed from
> an external source (like a file's metadata being re-read on every
> library scan), letting the user edit that value naively leads to:
> user edits, scan runs, edit is silently overwritten. The fix is two
> columns: `title` is the canonical from-the-file value (re-written on
> every scan), `display_title` is the user override (only touched by
> user actions). The read layer does `display_title ?? title` so every
> consumer transparently sees the override. The renderer doesn't even
> need to know about the override column — it just thinks
> `track.title` is "the title to show." Same pattern will work for
> other "user-can-edit-things-that-also-come-from-the-file" fields if
> we add them. See `electron/db.ts` `rowToTrack` and
> `updateTrackUserMeta`.

> **`box-shadow: inset` follows the element's `border-radius`.** This
> meant the sidebar drag-reorder indicator (a 2px "line" drawn with an
> inset shadow on the hovered row) had rounded ends, because the
> hovered row's corners were rounded. For a sharp-edged line, use an
> absolutely-positioned pseudo-element instead — `::before { content: ''; position: absolute; left: 0; right: 0; height: 2px; background: var(--accent); }`
> — which is unaffected by the parent's border-radius. See
> `src/styles/index.css` `.sidebar-toggle.drop-above::before`.

> **Drag-reorder visual indicator should match the actual drop
> behavior.** When `splice(fromIdx, 1); splice(toIdx, 0, item)` is used
> to reorder, the dropped item lands BEFORE the target when dragging up
> the list and AFTER when dragging down. So the indicator line needs
> two variants — `.drop-above` and `.drop-below` — chosen at render
> time based on `targetIdx < dragIdx`. This matches Notion / Apple
> Music / Finder list reordering. See `src/components/Sidebar.tsx`'s
> libraries map.

> **Audio time vs wall time vs visual time — three different clocks.**
> The Web Audio AudioBufferSourceNode has its own internal "sample
> position" advancing at the source's playbackRate. Wall time advances
> 1s per second. We compute the visible playhead from these as
> `pos = startedFrom + (audioCtx.currentTime - startedAtCtx) * rate`.
> The pitfall: anything that changes the audio's behavior mid-flight
> (rate change, loop bounds change, reversal) without rebasing
> `startedFrom` and `startedAtCtx` makes our visible playhead reflect
> a fictional audio that never existed — the new behavior applied
> retroactively to elapsed wall time. Always rebase on inflection
> points. See `BufferTrackPlayer.setPlaybackRate` and
> `BufferTrackPlayer.setLoopRegion` in `src/audio/BufferTrackPlayer.ts`.

> **Modular wrap is wrong during the "pre-loop" transient.** When you
> move loop bounds in-place under a running source, the source's actual
> sample position is unchanged — it just sees new bounds and will wrap
> when it next reaches them. If the position is currently *outside* the
> new loop region, a naive `wrap(pos, start, end)` will teleport the
> visible playhead into the loop while the audio source is still
> en route to it. The fix is a position projection that distinguishes
> "before first wrap" (return raw position) from "after first wrap"
> (apply modular). See `projectSourcePosition` in `src/audio/BufferTrackPlayer.ts`.
> Without this, dragging Loop Start past the playhead made the visible
> playhead jump to loopEnd and march backward — a pure math artifact.

> **Looping convention in Ableton / Logic / GarageBand: audio is the
> truth.** When you adjust loop bounds while playing, the audio
> continues smoothly from its actual position and the visible playhead
> shows exactly where the audio is — including the "settling" period
> if you've placed the loop ahead of the current position. The visible
> playhead does NOT snap into the loop the instant you drag the bracket.
> Audacity and similar take the opposite shortcut (stop + restart at
> loop start). The smoother behavior is more work but worth it. Archive
> follows the smoother convention. We DO snap in one case: when the
> playhead is *past* the loop in its direction of travel and the source
> would otherwise play to buffer end without wrapping.

> **Split by responsibility, not by line count.** The audio engine was
> ~650 lines in one file. Splitting it cleanly meant asking "what's the
> one thing each file is responsible for?" — not "where can I cut to
> halve the size?" The four files: `TrackPlayer.ts` (the interface every
> backend implements), `BufferTrackPlayer.ts` (the full-featured Web
> Audio backend), `MediaTrackPlayer.ts` (the fallback for un-decodable
> files), `AudioEngine.ts` (the singleton that owns the context and
> picks a backend via `makeTrackPlayer`). Each is small enough to fit a
> 7B local model's context window with room to reason about it. The
> `ITrackPlayer` interface is the seam that lets the engine not know or
> care which backend it has.

> **Zustand "boring slice" pattern: one State interface, many slice
> creators.** Same idea as Zustand's documented slice pattern but
> without the `StateCreator` middleware-type machinery — which is
> idiomatic but fancy. The pattern: define ALL of `State` in one file
> (the composer's table of contents), then each slice exports a
> `create<Name>Slice(set: StoreApi<State>['setState'], get: StoreApi<State>['getState']): Pick<State, …>`
> function. The composer just spreads them:
> `create<State>((set, get) => ({ ...createA(set, get), ...createB(set, get) }))`.
> Cross-slice calls work through `get()` because every slice sees the
> full `State` type. Each slice's `Pick<State, …>` return type acts as
> a self-documenting field list AND a TS verifier — if you forget a
> field, the composer fails to satisfy `State` and the error points at
> the missing piece. See `src/store/library.ts` (composer) and
> `src/store/slices/*.ts` (slices).

> **A circular type import that works.** Each slice file imports
> `State` from `../library`; `library.ts` imports slice *creators* from
> `./slices/*`. The cycle is fine because: (1) `library.ts`'s import of
> the slice creators is a value import resolved at module-load time
> (and the creator functions don't run until `create()` calls them);
> (2) the slice files only need `State` as a *type* (`import type`),
> which is erased at compile time. TS handles the circle without
> complaint as long as the type-only imports stay type-only.
