# ROADMAP.md — where the vision lives

Everything in this file is **deliberately not in v0.1**. The point of
this document is to honor the vision by capturing it precisely, so the
code stays small and shippable.

Ordered loosely from "next release" to "long-term." Nothing here is a
commitment; it is a memory.

---

## v0.1.1 — first polish patch (after shipping v0.1.0)

- **App icon.** Real artwork in `.icns` format so the Dock, About panel,
  Finder, and the `.dmg` mount window all show a proper Archive icon
  instead of Electron's default. Needs source SVG/PNG at 1024×1024 then
  multiple sizes baked into the icns. Electron-builder picks it up from
  `build.icon` in package.json.
- **Code-signing + notarization.** Unsigned `.dmg` triggers Gatekeeper's
  "from an unidentified developer" warning on every first-launch
  machine, and constrains the app's macOS permissions. Requires an
  Apple Developer account ($99/yr). Once in place: signed `.app`,
  notarized `.dmg`, no scary warning, full file-access permission flow.
- **README screenshots.** If v0.1.0 ships without them; add 3–4 PNGs.

## v0.2 — the UX unification (the next focused release)

The shared insight: the playback bar can be thought of as a single
**tape-loop machine**. Multi-Track is just stacking more tape-loop
machines. Random Review is just one machine in random-pick mode.
Folding these together would let the user stay in the library view while
they're listening, looping, layering — never losing the archive in
sight.

- **Inline Multi-Track.** Layers appear as additional player bars
  stacked above the main one rather than a separate page. Each layer
  is collapsible to a mini-height so the library stays visible.
- **Random Review folded into the main toolbar.** A Dice icon on the
  main player bar shuffles to a random track or random slice; the
  current view stays the Songs list. History keeps its own page.
- **Click anywhere on the timeline jumps the playhead** (current code
  should do this; verify and harden in v0.1 Step 4).
- **Editable title in Get Info that also renames the file on disk.**
  Already in v0.1 Step 2.

## v0.3 — the Loop Library + zoomable timeline

A first-class concept: a "tape loop" is `{ track, region, speed,
direction }`. Save them, name them, organize them, recall them in
Multi-Track.

- A new top-level page: **Loops** (sibling of Songs, Playlists, etc.).
- A loop can be exported as a `.wav`. Export dialog asks: "How many
  repeats?" (1, 2, 4, 8, …, or a total duration). Optional light
  fade-out at the end.
- A **Multi-Track Loop Group** export writes a folder: each layer as a
  standalone `.wav` plus a final layered bounce of a user-chosen total
  duration with optional fade-out.
- **Zoomable timeline.** On long tracks (a 90-minute live recording, a
  full concert), placing precise loop boundaries on the standard
  scrubber is fiddly. A 2× / 4× / 8× zoom on the playback timeline lets
  the user fine-tune to within a fraction of a second. Zoom + Loop
  Library compose well: you make precise loops, save them, recall them.
- Use cases: practice loops for transcription work; soundscape loops
  for sleep/meditation; building blocks for a DAW project.
- The Loop Library makes the Soundscape bridge we just removed
  unnecessary — bouncing a loop to a WAV is more general and more
  portable than a custom bridge to one other app.

## v0.4 — Timed Sessions

Wellness-studio mode. A session has a target length and optional
markers.

- Start a session of N minutes. Optional **fade-out** in the last
  M seconds.
- Optional **bell tracks** at the start, end, and configurable
  intervals (every 15 minutes, every 5 minutes, etc.). Bell is an
  audio file the user picks.
- Works on a single track, a playlist, a Loop, or a Multi-Track Loop
  Group.
- Research before designing: what does Wavepaths' player provide?
  What did the Johns Hopkins psilocybin sessions use? What do yoga
  and meditation studios actually need from a session tool?

## v0.5 — Multi-Track with mini-playlists in a layer

One layer is one looping tape; another layer is a *queue* of two or
three pieces that cycle in turn. The first layer keeps looping the
whole time. Concrete example: a single field-recording soundscape
looping continuously while a sequence of three practice tracks for
the voice plays alongside, looping the sequence.

## v0.6 — Chord progression notes

A simple chord UI inside Get Info: a row of "tags" where each tag is a
chord. The app normalizes common spellings (e.g. `Cm7` → `C minor 7`,
`Eb` → `E♭`). Useful for transcription work and for one-tap copy/paste
into the user's notation tool. Can stay as a free-text Notes field if
the structured version proves over-engineered.

## v0.7 — Version sets

A musician often has several takes of the same piece. Group them: each
"track" in the Songs list is really a **version set** with one
**keynote** version that plays by default. Click a disclosure triangle
to expand and hear the rest. Shuffle plays the keynote; Random Review
sometimes picks a non-keynote.

---

## Bigger directions (no commitment, just direction)

### Cloud and external sources

- Sync downloaded files from **Spotify** / **Apple Music** on-device.
- Sync a **podcast RSS feed**; stream or download; layer over a
  Multi-Track soundscape.
- Sync from **Suno** and other generative-AI music services.
- Sync from **Voice Memos** preserving date and name.

### Generative playback

- A `TrackPlayer` backend that runs a **JavaScript generative
  composition** rather than playing a fixed file. (This is the right
  shape for the existing `ITrackPlayer` interface — a new file
  implementing it, no UI changes.)
- A `TrackPlayer` backend wrapping **Pure Data** (via libpd) — same
  pattern.

### Video

- Play video files alongside audio (Stu's "Courses" folders).
- Crop loops/clips out of a video the same way Loops work for audio.
  Save to the Loop Library.

### Integrations out

- **Ableton Live Extension** that receives Multi-Track or Loop exports
  directly. Skip the disk-write step.
- A clean export for transcribed chord progressions to **Method**.

### Aesthetic

- Glass surfaces, slow gradient animations, color shifting through the
  session. Brian Eno's colored light turntable × James Turrell × Teenage
  Engineering. Slowest movement near the end of a track or session, as
  things wind down.

### Distribution

- A landing-page website at `archive.audio` (or wherever) with separate
  Getting Started flows: Musician, Recording Artist, Therapist, Holistic
  Health Care Provider.
- A built-in or web-based store for curated **Packs**: Soundscapes for
  Sleep, Guided Practices, Five Elements Field Recordings, Soundscapes
  for Yoga, etc.
- App Store / Mac App Store distribution (requires Apple Developer
  account and notarization).

---

## Research before building (open questions)

- What do **Wavepaths** sessions actually feel like, and what does their
  player provide that ordinary players don't? How is fade timing
  handled?
- What did the **Johns Hopkins** psilocybin trials use for music
  playback? What were their criteria?
- What do **wellness studios** (yoga, meditation, breathwork) need that
  a normal music player doesn't give them?
- What is the simplest possible audio file for a **bell**? Where does
  one ethically source good bell samples?
- For the v0.4 Timed Session: does the user pick a piece and the app
  fits it to N minutes, or does the user pick a duration and the app
  builds a playlist that fills it?

---

## Mission statement (the long arc)

To be the *premier*, most stable, and most flexible audio playback app
on the market — for all kinds of music playback needs: therapeutic,
creative archiving, music enjoyment, musical transcription and practice,
and more.

Everything in this file is in service of that arc. Nothing in this file
gets built until v0.1 ships.
