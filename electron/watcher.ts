import chokidar, { type FSWatcher } from 'chokidar';
import path from 'node:path';
import * as db from './db.js';
import { ingestSingleFile } from './library.js';

const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.aac', '.aif', '.aiff', '.wav', '.flac', '.ogg', '.opus', '.wma', '.alac']);

function isInsideDawProjectFolder(p: string): boolean {
  return p.split(path.sep).some(
    (seg) =>
      /\bProject$/i.test(seg) ||
      seg.endsWith('.logicx') ||
      seg.endsWith('.band') ||
      seg.endsWith('.ptx'),
  );
}

let watcher: FSWatcher | null = null;

export function startWatcher(
  artworkDir: string,
  onChange: () => void,
) {
  stopWatcher();
  const libraries = db.listLibraries();
  if (libraries.length === 0) return;
  const paths = libraries.map((l) => l.path);

  watcher = chokidar.watch(paths, {
    ignored: /(^|[\/\\])\../,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 },
    depth: 99,
  });

  const isAudio = (p: string) =>
    AUDIO_EXTS.has(path.extname(p).toLowerCase()) && !isInsideDawProjectFolder(p);

  const findLibrary = (p: string) =>
    libraries.find((l) => p.startsWith(l.path + path.sep));

  watcher.on('add', async (p: string) => {
    if (!isAudio(p)) return;
    const lib = findLibrary(p);
    if (!lib) return;
    try {
      await ingestSingleFile(p, lib, artworkDir);
      onChange();
    } catch {}
  });
  watcher.on('change', async (p: string) => {
    if (!isAudio(p)) return;
    const lib = findLibrary(p);
    if (!lib) return;
    try {
      await ingestSingleFile(p, lib, artworkDir);
      onChange();
    } catch {}
  });
  watcher.on('unlink', (p: string) => {
    if (!isAudio(p)) return;
    db.removeTrackByPath(p);
    onChange();
  });
}

export function stopWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}
