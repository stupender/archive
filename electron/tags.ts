/**
 * Reads macOS Finder color tags from an audio file. macOS-only.
 *
 * Where it runs: main process (Node.js).
 * Depends on: node:child_process (to shell out to `mdls` / `xattr`),
 *   plist (to parse the binary plist that xattr returns).
 * Used by:    library.ts during scan, to copy a file's Finder tags into
 *   the track's `finderTags` array.
 *
 * Notes:
 *  - Finder tags live in an extended attribute called
 *    `com.apple.metadata:_kMDItemUserTags`. The raw value is a binary
 *    plist of strings like "Red\n1" (the "\n1" is the color index).
 *  - Two ways to read them:
 *      `mdls` — uses Spotlight's index; fast for indexed volumes.
 *      `xattr` — reads the attribute directly; works on non-indexed
 *         volumes (external drives, network shares).
 *    `readTags(path)` tries mdls first, falls back to xattr.
 *  - Both return an empty array on failure — Archive tolerates "no
 *    tags" silently.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import plist from 'plist';

const execFileP = promisify(execFile);

/**
 * Read macOS Finder tags via the extended attribute com.apple.metadata:_kMDItemUserTags.
 * Returns tag names without the trailing "\nN" color index.
 */
export async function readFinderTags(filePath: string): Promise<string[]> {
  try {
    const { stdout } = await execFileP('xattr', ['-px', 'com.apple.metadata:_kMDItemUserTags', filePath]);
    const hex = stdout.replace(/\s+/g, '');
    if (!hex) return [];
    const buf = Buffer.from(hex, 'hex');
    const parsed = plist.parse(buf.toString('binary')) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as string[]).map((t) => {
      const i = t.indexOf('\n');
      return i >= 0 ? t.slice(0, i) : t;
    });
  } catch {
    return [];
  }
}

/**
 * Batch tag read via mdls — faster than xattr per file when reading thousands.
 * Falls back to readFinderTags for files mdls cannot index (e.g. external volumes without indexing).
 */
export async function readFinderTagsMdls(filePath: string): Promise<string[]> {
  try {
    const { stdout } = await execFileP('mdls', ['-name', 'kMDItemUserTags', '-raw', filePath]);
    const trimmed = stdout.trim();
    if (!trimmed || trimmed === '(null)') return [];
    // mdls returns a multiline pseudo-array: "(\n    Tag1,\n    Tag2\n)"
    const inner = trimmed.replace(/^\(/, '').replace(/\)$/, '').trim();
    if (!inner) return [];
    return inner
      .split(/,\s*\n?/)
      .map((s) => s.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Try mdls first (fast, indexed), fall back to xattr for unindexed volumes.
 */
export async function readTags(filePath: string): Promise<string[]> {
  const mdlsResult = await readFinderTagsMdls(filePath);
  if (mdlsResult.length > 0) return mdlsResult;
  return readFinderTags(filePath);
}
