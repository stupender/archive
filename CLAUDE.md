# CLAUDE.md — operating instructions for any AI assistant

Anyone (a future Claude session, a local Qwen/DeepSeek/Codestral via Ollama,
or me reading this six months later) should read this file first before
touching the code.

## Who is working on this

Stu (GitHub: `stupender`). A musician and composer learning to code. He is
a novice — assume things need to be explained in plain English. He needs to
understand what he's shipping well enough to discuss it in a job interview.

## What "Archive" is

A personal, local-first audio archive and review tool, inspired by the tool
Peter Chilvers built for Brian Eno. It surfaces forgotten tracks from a big
local music archive, plays whole tracks or random short slices (1–60s),
loops selected regions, and layers up to five tracks at once. **Archive
first, creative-collage second.** Local files only — nothing uploads.

## The single design principle

> **Stay embodied while moving fast.**

Reduce screen-friction so the body stays in the music. Keyboard-first.
Fewer modal dives. If a flow takes three clicks where it could be one
keystroke, fix it.

This sentence wins arguments. If you're about to add a feature that
makes the user click more, stop.

## Three goals beyond "it works"

These determine *how* we write code, not just what we build.

### 1. SHIP IT

Get a real release out: a `.dmg` attached to a tagged GitHub release at
`github.com/stupender/archive`, with a clear README. **Small and excellent
beats big and unfinished.** Anything that doesn't help v0.1 ship goes into
`ROADMAP.md`, not the code.

### 2. LEARN IT

Stu must understand the codebase well enough to explain in an interview
and keep building it himself. So:

- Explain in plain English what each part does and why, before and after
  any change you make.
- Add one-line entries to `LEARNED.md` whenever a real concept comes up,
  with a pointer to where it lives in the code.
- Save the big teaching pass for the very end — the final step is to turn
  `LEARNED.md` into a proper `STUDY_GUIDE.md`. Don't pre-emptively over-
  teach during the cleanup; just log concepts as they appear.

### 3. MAINTAIN WITH A SMALL LOCAL MODEL

Later, Stu will maintain this with a 7–14B parameter coding model running
locally (Qwen2.5-Coder, DeepSeek-Coder, Codestral via Ollama). Those
models are good but they are NOT GPT-5. So:

- **Boring and conventional.** Standard React, standard Zustand, standard
  Electron patterns. Nothing tricky.
- **Small files.** Under ~300 lines whenever practical. A small model can
  fit a small file in its context and reason about all of it.
- **Heavy plain-English comments.** Every function gets a short comment
  saying what it does and why. Top of every file gets a short block
  saying what the file does and where it runs (main process / preload /
  renderer).
- **No clever abstractions.** A junior coder should understand the code
  the first time they read it.
- **No exotic dependencies.** Battle-tested packages only. No WASM, no
  custom build steps, no monorepo tools.

Every cleanup choice should make the code easier for a small model and a
novice (Stu) to understand. When in doubt, choose the boring option.

## How we work, session-to-session

- Act as Stu's mentor, but keep moving. Explain before and after each
  change. Pause for a quick example on genuinely new concepts.
- **Propose before you do.** For any non-trivial change, write a short
  plan first and wait for Stu's go.
- **Small reviewable steps.** Never a sweeping change in one go. After
  each step, stop and let Stu run the app and ask questions.
- **Verify before claiming.** When in doubt, run `npx tsc --noEmit` to
  confirm types and tell Stu what you've actually checked vs. what's
  assumed.
- If you can't finish something cleanly, say so. Don't ship half-broken
  code claiming it's done.

## Deliberately not now

These are tempting. We are not building them. They live in `ROADMAP.md`:

- Smart playlists, 5-layer scenes, live folder-watching, loudness
  normalization, DAW-folder filtering (note: many of these are already
  present in the code — leave them as they are; don't extend, don't
  refactor aggressively).
- Cloud sources (Spotify, Apple Music, Suno, podcast RSS, Voice Memos).
- Desktop wrap in Tauri or anything else.
- Any WASM / Pure Data / native DSP backend.
- A web-app rewrite.
- The store / commerce ideas.

If a request would expand scope into any of the above, push back, explain
why, and write the idea into `ROADMAP.md` instead of the code.

## Other docs to read

- **`MAINTENANCE.md`** — the file-tree map, how to run / build / deploy,
  known limitations. Written for a future model orienting itself.
- **`LEARNED.md`** — running log of every real concept we touch, with a
  pointer to where it lives in the code.
- **`ROADMAP.md`** — every feature/idea/vision that is not v0.1. Honor
  the vision by capturing it; protect the codebase by leaving it here
  until it's the next thing to ship.
- **`README.md`** — what visitors to the GitHub repo see. Marketing for
  humans, not instructions for AI.

When in doubt, the answer is in one of these files. If it isn't, ask Stu
before guessing.
