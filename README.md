# Archive

A personal, local-first audio archive and review tool for macOS. Surface
forgotten tracks from a big local library, play them whole or as short
random slices, loop selected regions, and layer up to five tracks at
once.

Inspired by the archive-review tool Peter Chilvers built for Brian Eno.

> _**Stay embodied while moving fast.**_

---

_(Screenshots will go here once v0.1 ships.)_

## Download

_(A `.dmg` will be attached to the v0.1 GitHub Release at
`github.com/stupender/archive/releases/latest`.)_

The build is unsigned, so on first launch macOS will say "Archive can't
be opened because it is from an unidentified developer." Right-click the
app and choose "Open" to bypass this once.

### First-launch permissions (for libraries on external drives)

Because the v0.1 build isn't code-signed, macOS won't let Archive read
files on external drives (or in `~/Documents`, `~/Desktop`, `~/Downloads`)
without an explicit grant. If you click Play on a track and nothing
happens, Archive will show a yellow banner explaining this with an
"Open System Settings" button. From the **Privacy & Security → Full
Disk Access** pane, find Archive in the list (or click `+` and add
`/Applications/Archive.app`) and turn it on. Quit and relaunch.

This won't be necessary in a future version once the build is code-signed
and notarized.

## What it does

- **Add folders as "libraries."** Archive scans them recursively, reads
  ID3 tags, copies out embedded artwork, picks up macOS Finder color
  tags, and uses folder names as automatic tags too.
- **Songs view.** Apple Music-style list of every track, with search,
  sort, rating, notes, and tagging.
- **Random Review.** "Pick a random track" or "Pick a 5-second slice
  from a random track" — the whole point of an archive-review tool.
- **A-B loop.** Loop any selected region of a track. Variable playback
  speed. Reverse direction.
- **Multi-Track collage.** Layer up to five tracks at the same time,
  each with its own loop, speed, and direction. Save the combination
  as a Scene and recall it later.
- **Tags everywhere.** Press `T` to tag the playing or selected track
  without leaving your flow. Click tags in the sidebar to AND-combine
  them into a live filter.
- **Smart Playlists.** Saved JSON queries that re-evaluate every time
  you open them — "tracks rated 4+ tagged seed in the Process Catalog
  library, in WAV or AIFF" — auto-curated.
- **All local.** No accounts, no uploads. Your music never leaves your
  Mac. The database lives at `~/Library/Application Support/sonic-archive/`.

## Keyboard

| Key            | Action                                            |
| -------------- | ------------------------------------------------- |
| `Space`        | Play / pause                                      |
| `← / →`        | Seek −5s / +5s                                    |
| `⌘← / ⌘→`      | Previous / next track                             |
| `⌘↑ / ⌘↓`      | Volume up / down                                  |
| `⌘F`           | Focus search                                      |
| `⌘L`           | Jump to the playing track in the Songs view       |
| `R`            | Toggle reverse                                    |
| `L`            | Toggle loop on/off                                |
| `1` / `2`      | Set loop start / end at the current position      |
| `S`            | Toggle shuffle                                    |
| `T`            | Quick-tag the selected or playing track           |
| `Esc`          | Clear the loop or blur the search field           |

## Why I built it

I'm a musician and composer. I keep my music in folders organized by
stage of the process — seed, experimentation, crafting, complete — and
I have decades of material I've largely forgotten. I wanted a tool that
let me re-encounter that material the way Brian Eno does: shuffle the
whole archive, play short slices to refresh memory, layer pieces
together to find unexpected combinations. Existing music players treat
your library as something to play, not something to discover.

This is also the project where I'm learning to code seriously.

## Run it locally

Requires Node.js 22 or newer and macOS.

```sh
git clone https://github.com/stupender/archive.git
cd archive
npm install
npm run dev
```

To build a `.dmg`:

```sh
npm run build
```

The build output lands in `dist/`.

## Acknowledgments

Built in long mentor-paired sessions with Claude. The original idea is
[Peter Chilvers's archive tool for Brian Eno](https://en.wikipedia.org/wiki/Brian_Eno),
which was the inspiration; this is my own (open-source) version.

— Stu
