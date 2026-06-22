# MAINTENANCE.md — how Archive is put together

This file orients a future maintainer (a small local model, a future
session, or Stu six months from now) before they touch the code. Read
this first; the code references will make sense after.

## What Archive is, in one paragraph

Archive is a macOS desktop app that scans local folders of music, plays
tracks (whole or as random short slices), loops selected regions of a
track at varying speed and direction, and layers up to five tracks at
once. It stores ratings, notes, and tags locally in SQLite, and surfaces
forgotten tracks from a personal archive. It is built with Electron +
React + TypeScript + Web Audio. It does not connect to any cloud.

## The two-process model (the thing you have to understand first)

An Electron app is **two JavaScript processes** running at the same time,
each with different powers:

1. **Main process** — Node.js. Lives in the `electron/` folder. Owns the
   OS-level app: the window, the database, the filesystem, the native
   dialogs. Can do anything Node can do.

2. **Renderer process** — Chromium (like a sandboxed browser tab). Lives
   in the `src/` folder. Draws the React UI. **Cannot** read files,
   touch the database, or call OS APIs directly. Cannot import Node
   modules.

These two processes talk through **IPC** (Inter-Process Communication).
The renderer asks for something; the main process does it and replies.

A small bridge file, **`electron/preload.ts`**, runs in the renderer with
slightly elevated privileges. It uses `contextBridge.exposeInMainWorld`
to put a single safe API on the page as `window.sonic`. Every method on
`window.sonic.*` sends a typed IPC message and awaits a reply. So the
renderer thinks it's calling normal async functions; behind the scenes
each call crosses the process boundary.

**Rule of thumb**: if it touches a file, the database, or the OS, it
runs in the main process and the renderer asks for it. If it draws
pixels, it runs in the renderer.

## File tree

```
Archive/
├── package.json          npm scripts + deps + electron-builder config
├── tsconfig.json         TypeScript settings (one config for everything)
├── vite.config.ts        Vite dev/build; wires up Electron's two processes
├── index.html            HTML entry; loads /src/main.tsx
│
├── electron/             ── MAIN PROCESS (Node.js)
│   ├── main.ts             App lifecycle, BrowserWindow, IPC handlers, custom media:// protocol
│   ├── preload.ts          Bridge: exposes window.sonic.* to the renderer
│   ├── db.ts               SQLite schema + every query
│   ├── library.ts          Recursive folder scan; metadata + artwork + tags → DB
│   ├── tags.ts             Reads macOS Finder color tags via mdls / xattr
│   └── watcher.ts          chokidar-based folder watcher
│
├── shared/
│   └── types.ts          Types used by BOTH processes (Track, Library, FilterOptions)
│
└── src/                  ── RENDERER PROCESS (React)
    ├── main.tsx            React entry; mounts <App />
    ├── App.tsx             Top-level layout
    ├── styles/index.css    All CSS (single file)
    │
    ├── store/
    │   ├── library.ts           Zustand State interface + composer (no action impls live here)
    │   └── slices/
    │       ├── librariesSlice.ts  Libraries CRUD, active scope, scan, app init
    │       ├── viewSlice.ts       View / search / sort / selection / tag filters / refreshAll
    │       ├── playbackSlice.ts   Main player: transport, loop, queue, sendToMultiTrack
    │       ├── collageSlice.ts    Multi-Track layers + saved scenes
    │       ├── randomSlice.ts     Random Review (whole + slice modes)
    │       ├── metadataSlice.ts   Track meta writes, playlist CRUD, rating, revealInFinder
    │       └── tagsSlice.ts       Quick-tag overlay + bulk add/remove tag actions
    │
    ├── audio/
    │   ├── TrackPlayer.ts        The ITrackPlayer interface every backend implements
    │   ├── BufferTrackPlayer.ts  Full-featured Web Audio backend (decoded into memory)
    │   ├── MediaTrackPlayer.ts   Fallback backend for un-decodable files (<audio> element)
    │   └── AudioEngine.ts        Singleton: owns the context, master gain, primary + collage players
    │
    ├── hooks/useKeyboardShortcuts.ts   Global keyboard map
    ├── util/format.ts                  Tiny helpers (formatTime, mediaUrl, …)
    │
    └── components/         All React components (one file per component)
```

## How to run, build, and where things live

### Develop (live-reload)

```
npm install                # one-time
npm run dev                # starts Vite + opens the Electron window
```

The dev server hot-reloads the renderer. Main-process changes require
quitting and re-running `npm run dev`.

### Build a release `.dmg`

```
npm run build              # tsc + vite build + electron-builder
```

The `.dmg` ends up in `dist/`. It is unsigned — first launch on another
Mac will show "from an unidentified developer." This is fine for personal
release through GitHub Releases.

### Where data lives on disk

Archive writes data to the standard macOS user-data folder:

```
~/Library/Application Support/sonic-archive/
  library.db               SQLite database (libraries, tracks, playlists, history, scenes, settings)
  artwork/                 cached album-art images, named <sha1-of-path>.jpg
```

If you ever want to wipe Archive's state and start fresh, delete that
folder.

### Where the music lives

The music files themselves are not copied or moved. Archive only stores
the *paths*. The actual audio files stay in whichever folders Stu added
as "libraries."

## The TrackPlayer seam (and why)

`src/audio/TrackPlayer.ts` defines the interface called `ITrackPlayer`.
Two concrete implementations exist:

- **`BufferTrackPlayer`** — the full-featured path. Decodes a file into
  an `AudioBuffer`, plays it through an `AudioBufferSourceNode`. Supports
  variable speed, reverse, sample-accurate A-B looping, loudness
  analysis.
- **`MediaTrackPlayer`** — the fallback. Used when `decodeAudioData`
  rejects a file (some AIFF variants, ADPCM WAV, ALAC). Plays through
  a hidden `<audio>` element wired into the Web Audio graph. Fewer
  features: no reverse, only whole-track loop.

Each player exposes `capabilities: { reverse, abLoop, loudnessAnalysis }`
so the UI can disable buttons it can't honor.

Why this matters for the future: if Stu ever wants to add a Pure Data
backend, a generative-music-from-JavaScript backend, or any other DSP
path, it's one new file implementing `ITrackPlayer`. The UI doesn't
change.

## Known limitations (be honest)

- **macOS only.** The whole app is built around mdls/xattr for Finder
  tags, AppKit vibrancy for the sidebar, and `.dmg` for distribution.
  Windows/Linux would require rework.
- **Unsigned.** Users see the "unidentified developer" warning on first
  open. Fixing this needs an Apple Developer account (~$99/yr) and
  notarization. Not v0.1.
- **No cloud, no sync.** Stu's library lives on this machine only.
- **Path-based.** If Stu moves a music folder on disk, Archive forgets
  those tracks (their `path` no longer resolves) and re-adds them as
  "new" tracks on the next scan, losing ratings and tags.
- **No undo.** Deleting a library, a playlist, or a tag is final.

## Common things to verify after a change

When you touch the **store**, run the app and:
- Open the Songs view, double-click a track, confirm it plays.
- Open Random Review, pick a slice mode, click Pick another, confirm
  slices auto-advance.
- Open Multi-Track, roll the dice, click Play all together.

When you touch the **engine** or the **PlayerBar**, additionally:
- Press Space to play/pause.
- Engage a loop with L, drag the Start and End handles, confirm the
  playhead always rides along and never escapes the loop region.
- Change playback speed with the up/down arrows mid-play, confirm the
  playhead doesn't visibly jump.
- Toggle reverse, confirm the loop still respects the region.

When you touch the **main process**:
- Quit and re-run `npm run dev` (main-process changes don't hot-reload).
- Add a library through the UI, confirm tracks get scanned in.

When you touch **`tsconfig.json`** or **`vite.config.ts`**:
- Run `npx tsc --noEmit` first to confirm types still compile.
- Then quit and re-run `npm run dev`.

## Pointers to the other docs

- **`CLAUDE.md`** — instructions for any AI assistant. Read first.
- **`LEARNED.md`** — running list of every concept we've touched, with a
  pointer to where it lives.
- **`ROADMAP.md`** — every future idea/feature. The current code stays
  small and focused; the dream lives there.
- **`README.md`** — public-facing description on the GitHub repo.
