import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseFile } from 'music-metadata';
import { readTags } from './tags.js';
import * as db from './db.js';
import type { Track, ScanResult, Library } from '../shared/types.js';

const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.aac', '.aif', '.aiff', '.wav', '.flac', '.ogg', '.opus', '.wma', '.alac']);

// Skip DAW project folders — their audio is stems/samples, not finished tracks.
function isDawProjectFolder(name: string): boolean {
  return /\bProject$/i.test(name) || name.endsWith('.logicx') || name.endsWith('.band') || name.endsWith('.ptx');
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isDawProjectFolder(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (AUDIO_EXTS.has(ext)) yield full;
    }
  }
}

function pathSegmentsAsTags(filePath: string, libraryPath: string): string[] {
  const rel = path.relative(libraryPath, filePath);
  const parts = path.dirname(rel).split(path.sep).filter(Boolean);
  return parts;
}

async function extractTrack(
  filePath: string,
  library: Library,
  artworkDir: string,
): Promise<Omit<Track, 'id'>> {
  const stat = await fsp.stat(filePath);
  let title = path.basename(filePath, path.extname(filePath));
  let artist: string | null = null;
  let album: string | null = null;
  let genre: string | null = null;
  let duration: number | null = null;
  let bpm: number | null = null;
  let musicalKey: string | null = null;
  let year: number | null = null;
  let trackNumber: number | null = null;
  let bitrate: number | null = null;
  let sampleRate: number | null = null;
  let format: string | null = null;
  let artworkPath: string | null = null;

  try {
    const meta = await parseFile(filePath, { duration: true, skipCovers: false });
    const c = meta.common;
    title = c.title || title;
    artist = c.artist || (c.artists && c.artists[0]) || null;
    album = c.album || null;
    genre = (c.genre && c.genre[0]) || null;
    duration = meta.format.duration ?? null;
    bpm = c.bpm ?? null;
    musicalKey = (c as any).key ?? null;
    year = c.year ?? null;
    trackNumber = c.track?.no ?? null;
    bitrate = meta.format.bitrate ?? null;
    sampleRate = meta.format.sampleRate ?? null;
    format = meta.format.container ?? null;

    if (c.picture && c.picture[0]) {
      const pic = c.picture[0];
      const ext = pic.format.includes('png') ? 'png' : 'jpg';
      // Use a full SHA-1 of the file path so two tracks in the same album
      // (which share long path prefixes) don't collide on a 24-char prefix.
      const hash = crypto.createHash('sha1').update(filePath).digest('hex');
      const out = path.join(artworkDir, `${hash}.${ext}`);
      try {
        await fsp.writeFile(out, pic.data);
        artworkPath = out;
      } catch {}
    }
  } catch {
    // metadata read failed — fall through with filename-derived defaults
  }

  const finderTags = await readTags(filePath);
  const pathTags = pathSegmentsAsTags(filePath, library.path);

  return {
    libraryId: library.id,
    path: filePath,
    title,
    artist,
    album,
    genre,
    duration,
    bpm,
    musicalKey,
    year,
    trackNumber,
    bitrate,
    sampleRate,
    format,
    size: stat.size,
    mtime: stat.mtimeMs,
    addedAt: Date.now(),
    rating: 0,
    notes: '',
    userTags: [],
    finderTags,
    pathTags,
    artworkPath,
    loudnessGain: null,
    decodeFailed: 0,
  };
}

export async function scanAllLibraries(
  artworkDir: string,
  onProgress?: (done: number, total: number, current: string) => void,
): Promise<ScanResult> {
  const libraries = db.listLibraries();
  const result: ScanResult = { added: 0, updated: 0, removed: 0, errors: [] };
  const seen = new Set<string>();

  // Phase 1: enumerate
  const allFiles: { path: string; library: Library }[] = [];
  for (const lib of libraries) {
    for await (const f of walk(lib.path)) allFiles.push({ path: f, library: lib });
  }

  // Phase 2: extract + upsert
  let done = 0;
  for (const file of allFiles) {
    seen.add(file.path);
    try {
      const stat = await fsp.stat(file.path);
      const existing = db.getTrackByPath(file.path);
      if (existing && existing.mtime === stat.mtimeMs && existing.libraryId === file.library.id) {
        // Refresh tags only — they may have changed in Finder.
        const finderTags = await readTags(file.path);
        const pathTags = pathSegmentsAsTags(file.path, file.library.path);
        if (
          JSON.stringify(finderTags) !== JSON.stringify(existing.finderTags) ||
          JSON.stringify(pathTags) !== JSON.stringify(existing.pathTags)
        ) {
          db.upsertTrack({ ...existing, finderTags, pathTags });
          result.updated++;
        }
      } else {
        const t = await extractTrack(file.path, file.library, artworkDir);
        const wasNew = !existing;
        db.upsertTrack(t);
        if (wasNew) result.added++; else result.updated++;
      }
    } catch (err: any) {
      result.errors.push({ path: file.path, message: err?.message || String(err) });
    }
    done++;
    if (onProgress && done % 5 === 0) onProgress(done, allFiles.length, file.path);
  }
  if (onProgress) onProgress(allFiles.length, allFiles.length, '');

  // Phase 3: remove paths inside known library roots that are no longer there.
  const allPaths = db.getAllPaths();
  for (const p of allPaths) {
    if (!seen.has(p)) {
      const stillExists = libraries.some((l) => p.startsWith(l.path));
      if (stillExists) {
        db.removeTrackByPath(p);
        result.removed++;
      }
    }
  }

  return result;
}

export async function ingestSingleFile(filePath: string, library: Library, artworkDir: string) {
  const t = await extractTrack(filePath, library, artworkDir);
  return db.upsertTrack(t);
}
