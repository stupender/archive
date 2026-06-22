/**
 * SQLite-backed persistence for Archive. All DB queries live in this file.
 *
 * Where it runs: main process (Node.js).
 * Depends on: better-sqlite3 (native module, rebuilt against Electron by
 *   the `electron-rebuild` postinstall), shared types.
 * Used by:    main.ts's IPC handlers; library.ts's scanner; watcher.ts.
 *
 * Notes:
 *  - `initDB(userDataPath)` is called once on app start. It creates the
 *    database file at `<userData>/library.db`, defines the schema with
 *    `CREATE TABLE IF NOT EXISTS …`, then runs lightweight migrations
 *    via the `migrate()` helper.
 *  - "Migration" here just means: check if a column exists with
 *    `colExists(table, col)`, and if not, `ALTER TABLE … ADD COLUMN`.
 *    Cheap and good enough for a single-user local app. Don't reach for
 *    a full migration framework unless the schema gets significantly
 *    more complex.
 *  - Each table has a `rowToXxx(row)` helper that converts the raw
 *    SQLite row (snake_case columns) into the shared TypeScript type
 *    (camelCase fields). JSON-encoded array columns (tags, etc.) are
 *    parsed here.
 *  - `display_title` is a "user override" column — see LEARNED.md's
 *    "user-override pattern" entry.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import type { Track, Playlist, PlayHistoryEntry, FilterOptions, SortOption, Library } from '../shared/types.js';

let db: Database.Database;

export function initDB(userDataPath: string) {
  const dbPath = path.join(userDataPath, 'library.db');
  fs.mkdirSync(userDataPath, { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS libraries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      path TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS multitrack_scenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      artist TEXT,
      album TEXT,
      genre TEXT,
      duration REAL,
      bpm REAL,
      musical_key TEXT,
      year INTEGER,
      track_number INTEGER,
      bitrate INTEGER,
      sample_rate INTEGER,
      format TEXT,
      size INTEGER,
      mtime INTEGER NOT NULL,
      added_at INTEGER NOT NULL,
      rating INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      custom_genres TEXT NOT NULL DEFAULT '[]',
      finder_tags TEXT NOT NULL DEFAULT '[]',
      path_tags TEXT NOT NULL DEFAULT '[]',
      artwork_path TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_tracks_added ON tracks(added_at);
    CREATE INDEX IF NOT EXISTS idx_tracks_rating ON tracks(rating);

    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      is_auto INTEGER NOT NULL DEFAULT 0,
      auto_query TEXT
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id INTEGER NOT NULL,
      track_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (playlist_id, track_id),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS play_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      start_position REAL NOT NULL DEFAULT 0,
      duration REAL NOT NULL DEFAULT 0,
      mode TEXT NOT NULL DEFAULT 'whole',
      slice_length REAL,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_history_started ON play_history(started_at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Lightweight migrations for new columns added after v0.1.
  migrate();

  return db;
}

function colExists(table: string, col: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
  return rows.some((r) => r.name === col);
}

function migrate() {
  if (!colExists('libraries', 'position')) {
    db.exec(`ALTER TABLE libraries ADD COLUMN position INTEGER NOT NULL DEFAULT 0`);
    // Backfill: order by created_at so existing libraries keep their order
    const rows = db.prepare('SELECT id FROM libraries ORDER BY created_at').all() as any[];
    const upd = db.prepare('UPDATE libraries SET position = ? WHERE id = ?');
    rows.forEach((r, i) => upd.run(i, r.id));
  }
  if (!colExists('tracks', 'library_id')) {
    db.exec(`ALTER TABLE tracks ADD COLUMN library_id INTEGER`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tracks_library ON tracks(library_id)`);
  }
  if (!colExists('tracks', 'user_tags')) {
    db.exec(`ALTER TABLE tracks ADD COLUMN user_tags TEXT NOT NULL DEFAULT '[]'`);
    // Carry forward any data the user already had under custom_genres.
    db.exec(`UPDATE tracks SET user_tags = custom_genres WHERE user_tags = '[]'`);
  }
  if (!colExists('tracks', 'loudness_gain')) {
    db.exec(`ALTER TABLE tracks ADD COLUMN loudness_gain REAL`);
  }
  if (!colExists('tracks', 'decode_failed')) {
    db.exec(`ALTER TABLE tracks ADD COLUMN decode_failed INTEGER NOT NULL DEFAULT 0`);
  }
  if (!colExists('tracks', 'display_title')) {
    // User override for the displayed title. Null = no override; fall back
    // to the `title` column (which came from the file's metadata). Survives
    // library re-scans because upsertTrack only writes the `title` column,
    // not this one. See LEARNED.md "user-override pattern."
    db.exec(`ALTER TABLE tracks ADD COLUMN display_title TEXT`);
  }

  // First-time migration: if libraries table is empty but we have a legacy
  // rootFolders setting, seed libraries from it.
  const libCount = (db.prepare('SELECT COUNT(*) as c FROM libraries').get() as any).c;
  if (libCount === 0) {
    const raw = (db.prepare('SELECT value FROM settings WHERE key = ?').get('rootFolders') as any)?.value;
    if (raw) {
      try {
        const folders: string[] = JSON.parse(raw);
        const insert = db.prepare('INSERT OR IGNORE INTO libraries (name, path, created_at) VALUES (?, ?, ?)');
        for (const f of folders) {
          insert.run(path.basename(f) || f, f, Date.now());
        }
        // Backfill library_id on existing tracks
        const libs = db.prepare('SELECT id, path FROM libraries').all() as any[];
        const update = db.prepare('UPDATE tracks SET library_id = ? WHERE library_id IS NULL AND path LIKE ?');
        for (const lib of libs) {
          update.run(lib.id, lib.path + '%');
        }
      } catch {}
    }
  }
}

// === Libraries =============================================================

function rowToLibrary(row: any): Library {
  return { id: row.id, name: row.name, path: row.path, createdAt: row.created_at };
}

export function listLibraries(): Library[] {
  return (db.prepare('SELECT * FROM libraries ORDER BY position, created_at').all() as any[]).map(rowToLibrary);
}

export function createLibrary(name: string, p: string): Library {
  const max = (db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM libraries').get() as any).m;
  const result = db.prepare('INSERT INTO libraries (name, path, created_at, position) VALUES (?, ?, ?, ?)')
    .run(name, p, Date.now(), max + 1);
  return rowToLibrary(db.prepare('SELECT * FROM libraries WHERE id = ?').get(result.lastInsertRowid));
}

export function reorderLibraries(orderedIds: number[]) {
  const upd = db.prepare('UPDATE libraries SET position = ? WHERE id = ?');
  const tx = db.transaction(() => {
    orderedIds.forEach((id, i) => upd.run(i, id));
  });
  tx();
}

export function deleteLibrary(id: number) {
  db.prepare('DELETE FROM tracks WHERE library_id = ?').run(id);
  db.prepare('DELETE FROM libraries WHERE id = ?').run(id);
}

export function renameLibrary(id: number, name: string) {
  db.prepare('UPDATE libraries SET name = ? WHERE id = ?').run(name, id);
}

// === Tracks ================================================================

function rowToTrack(row: any): Track {
  return {
    id: row.id,
    libraryId: row.library_id,
    path: row.path,
    // If the user has edited the title in Get Info, that override wins;
    // otherwise we show the title that came from the file's metadata.
    title: row.display_title ?? row.title,
    artist: row.artist,
    album: row.album,
    genre: row.genre,
    duration: row.duration,
    bpm: row.bpm,
    musicalKey: row.musical_key,
    year: row.year,
    trackNumber: row.track_number,
    bitrate: row.bitrate,
    sampleRate: row.sample_rate,
    format: row.format,
    size: row.size,
    mtime: row.mtime,
    addedAt: row.added_at,
    rating: row.rating,
    notes: row.notes,
    userTags: JSON.parse(row.user_tags || '[]'),
    finderTags: JSON.parse(row.finder_tags || '[]'),
    pathTags: JSON.parse(row.path_tags || '[]'),
    artworkPath: row.artwork_path,
    loudnessGain: row.loudness_gain,
    decodeFailed: row.decode_failed ?? 0,
  };
}

export function upsertTrack(t: Omit<Track, 'id'>): number {
  const existing = db.prepare('SELECT id FROM tracks WHERE path = ?').get(t.path) as any;
  if (existing) {
    db.prepare(`
      UPDATE tracks SET
        library_id=?, title=?, artist=?, album=?, genre=?, duration=?, bpm=?, musical_key=?,
        year=?, track_number=?, bitrate=?, sample_rate=?, format=?, size=?,
        mtime=?, finder_tags=?, path_tags=?, artwork_path=?
      WHERE id=?
    `).run(
      t.libraryId, t.title, t.artist, t.album, t.genre, t.duration, t.bpm, t.musicalKey,
      t.year, t.trackNumber, t.bitrate, t.sampleRate, t.format, t.size,
      t.mtime, JSON.stringify(t.finderTags), JSON.stringify(t.pathTags),
      t.artworkPath, existing.id,
    );
    return existing.id;
  }
  const result = db.prepare(`
    INSERT INTO tracks (
      library_id, path, title, artist, album, genre, duration, bpm, musical_key,
      year, track_number, bitrate, sample_rate, format, size,
      mtime, added_at, rating, notes, user_tags,
      finder_tags, path_tags, artwork_path
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    t.libraryId, t.path, t.title, t.artist, t.album, t.genre, t.duration, t.bpm, t.musicalKey,
    t.year, t.trackNumber, t.bitrate, t.sampleRate, t.format, t.size,
    t.mtime, t.addedAt, t.rating, t.notes, JSON.stringify(t.userTags),
    JSON.stringify(t.finderTags), JSON.stringify(t.pathTags), t.artworkPath,
  );
  return result.lastInsertRowid as number;
}

export function removeTrackByPath(p: string) {
  db.prepare('DELETE FROM tracks WHERE path = ?').run(p);
}

export function getAllPaths(): string[] {
  return (db.prepare('SELECT path FROM tracks').all() as any[]).map((r) => r.path);
}

export function getTrack(id: number): Track | null {
  const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as any;
  return row ? rowToTrack(row) : null;
}

export function getTrackByPath(p: string): Track | null {
  const row = db.prepare('SELECT * FROM tracks WHERE path = ?').get(p) as any;
  return row ? rowToTrack(row) : null;
}

export function listTracks(filter: FilterOptions = {}, sort: SortOption = { field: 'addedAt', direction: 'desc' }): Track[] {
  const where: string[] = ['decode_failed = 0'];
  const params: any[] = [];

  if (filter.search) {
    const q = `%${filter.search}%`;
    where.push('(title LIKE ? OR artist LIKE ? OR album LIKE ? OR notes LIKE ?)');
    params.push(q, q, q, q);
  }
  if (filter.rating !== undefined) {
    where.push('rating >= ?');
    params.push(filter.rating);
  }
  if (filter.genre) {
    where.push('(genre = ? OR user_tags LIKE ?)');
    params.push(filter.genre, `%"${filter.genre}"%`);
  }
  if (filter.userTagsAll) {
    for (const tag of filter.userTagsAll) {
      where.push('user_tags LIKE ?');
      params.push(`%"${tag}"%`);
    }
  }
  if (filter.finderTagsAll) {
    for (const tag of filter.finderTagsAll) {
      where.push('finder_tags LIKE ?');
      params.push(`%"${tag}"%`);
    }
  }
  if (filter.pathTagsAll) {
    for (const tag of filter.pathTagsAll) {
      where.push('path_tags LIKE ?');
      params.push(`%"${tag}"%`);
    }
  }
  if (filter.libraryIds && filter.libraryIds.length > 0) {
    where.push(`library_id IN (${filter.libraryIds.map(() => '?').join(',')})`);
    params.push(...filter.libraryIds);
  }
  if (filter.formats && filter.formats.length > 0) {
    // Match by file extension on the path. More reliable than the `format`
    // column (which is the ID3 container name).
    const conds = filter.formats.map(() => 'lower(path) LIKE ?').join(' OR ');
    where.push(`(${conds})`);
    for (const f of filter.formats) params.push(`%.${f.toLowerCase()}`);
  }
  if (filter.hasNotes) {
    where.push("notes != ''");
  }

  const fieldMap: Record<string, string> = {
    title: 'title COLLATE NOCASE',
    artist: 'artist COLLATE NOCASE',
    album: 'album COLLATE NOCASE',
    addedAt: 'added_at',
    rating: 'rating',
    duration: 'duration',
    bpm: 'bpm',
  };
  const orderField = fieldMap[sort.field] || 'added_at';

  let sql = 'SELECT * FROM tracks';
  if (filter.playlistId !== undefined) {
    sql += ' WHERE id IN (SELECT track_id FROM playlist_tracks WHERE playlist_id = ?)';
    params.unshift(filter.playlistId);
    if (where.length > 0) sql += ' AND ' + where.join(' AND ');
  } else if (where.length > 0) {
    sql += ' WHERE ' + where.join(' AND ');
  }
  sql += ` ORDER BY ${orderField} ${sort.direction.toUpperCase()}`;
  return (db.prepare(sql).all(...params) as any[]).map(rowToTrack);
}

export function getRandomTrack(filter: FilterOptions = {}): Track | null {
  const tracks = listTracks(filter);
  if (tracks.length === 0) return null;
  return tracks[Math.floor(Math.random() * tracks.length)];
}

export function getRandomTracks(n: number, filter: FilterOptions = {}): Track[] {
  const tracks = listTracks(filter);
  const out: Track[] = [];
  const taken = new Set<number>();
  while (out.length < Math.min(n, tracks.length)) {
    const idx = Math.floor(Math.random() * tracks.length);
    if (!taken.has(idx)) {
      taken.add(idx);
      out.push(tracks[idx]);
    }
  }
  return out;
}

export function updateTrackUserMeta(
  id: number,
  patch: Partial<Pick<Track, 'rating' | 'notes' | 'userTags' | 'title'>>,
) {
  const fields: string[] = [];
  const params: any[] = [];
  if (patch.rating !== undefined) { fields.push('rating = ?'); params.push(patch.rating); }
  if (patch.notes !== undefined) { fields.push('notes = ?'); params.push(patch.notes); }
  if (patch.userTags !== undefined) { fields.push('user_tags = ?'); params.push(JSON.stringify(patch.userTags)); }
  if (patch.title !== undefined) {
    // Title edits write to display_title (the user-override column), NOT the
    // canonical `title` column. Empty string means "clear the override and
    // revert to whatever's in the file's metadata."
    fields.push('display_title = ?');
    params.push(patch.title.trim() === '' ? null : patch.title);
  }
  if (fields.length === 0) return;
  params.push(id);
  db.prepare(`UPDATE tracks SET ${fields.join(', ')} WHERE id = ?`).run(...params);
}

export function setTrackLoudnessGain(id: number, gain: number) {
  db.prepare('UPDATE tracks SET loudness_gain = ? WHERE id = ?').run(gain, id);
}

export function markTrackDecodeFailed(id: number) {
  db.prepare('UPDATE tracks SET decode_failed = 1 WHERE id = ?').run(id);
}

export function listGenres(): string[] {
  return (db.prepare("SELECT DISTINCT genre FROM tracks WHERE genre IS NOT NULL AND genre != '' ORDER BY genre COLLATE NOCASE").all() as any[]).map((r) => r.genre);
}

export function listUserTags(): string[] {
  const rows = db.prepare('SELECT user_tags FROM tracks').all() as any[];
  const set = new Set<string>();
  for (const r of rows) {
    try { for (const t of JSON.parse(r.user_tags) as string[]) set.add(t); } catch {}
  }
  return Array.from(set).sort();
}

export function listFinderTags(): string[] {
  const rows = db.prepare('SELECT finder_tags FROM tracks').all() as any[];
  const set = new Set<string>();
  for (const r of rows) {
    try { for (const t of JSON.parse(r.finder_tags) as string[]) set.add(t); } catch {}
  }
  return Array.from(set).sort();
}

export function listPathTags(): string[] {
  const rows = db.prepare('SELECT path_tags FROM tracks').all() as any[];
  const set = new Set<string>();
  for (const r of rows) {
    try { for (const t of JSON.parse(r.path_tags) as string[]) set.add(t); } catch {}
  }
  return Array.from(set).sort();
}

// === Playlists =============================================================

export function rowToPlaylist(row: any): Playlist {
  const trackIds = (db.prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position').all(row.id) as any[]).map((r) => r.track_id);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    isAuto: !!row.is_auto,
    autoQuery: row.auto_query,
    trackIds,
  };
}

export function listPlaylists(): Playlist[] {
  const rows = db.prepare('SELECT * FROM playlists ORDER BY name COLLATE NOCASE').all() as any[];
  return rows.map(rowToPlaylist);
}

export function createPlaylist(name: string, description = ''): Playlist {
  const result = db.prepare('INSERT INTO playlists (name, description, created_at) VALUES (?, ?, ?)').run(name, description, Date.now());
  return rowToPlaylist(db.prepare('SELECT * FROM playlists WHERE id = ?').get(result.lastInsertRowid));
}

export function createSmartPlaylist(name: string, queryJson: string, description = ''): Playlist {
  const result = db.prepare(
    'INSERT INTO playlists (name, description, created_at, is_auto, auto_query) VALUES (?, ?, ?, 1, ?)',
  ).run(name, description, Date.now(), queryJson);
  return rowToPlaylist(db.prepare('SELECT * FROM playlists WHERE id = ?').get(result.lastInsertRowid));
}

export function updateSmartPlaylist(id: number, name: string, queryJson: string) {
  db.prepare('UPDATE playlists SET name = ?, auto_query = ?, is_auto = 1 WHERE id = ?').run(name, queryJson, id);
}

export function deletePlaylist(id: number) {
  db.prepare('DELETE FROM playlists WHERE id = ?').run(id);
}

export function renamePlaylist(id: number, name: string) {
  db.prepare('UPDATE playlists SET name = ? WHERE id = ?').run(name, id);
}

export function addToPlaylist(playlistId: number, trackId: number) {
  const max = (db.prepare('SELECT COALESCE(MAX(position), -1) as m FROM playlist_tracks WHERE playlist_id = ?').get(playlistId) as any).m;
  db.prepare('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, added_at) VALUES (?, ?, ?, ?)').run(playlistId, trackId, max + 1, Date.now());
}

export function removeFromPlaylist(playlistId: number, trackId: number) {
  db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?').run(playlistId, trackId);
}

// === History ==============================================================

export function logPlay(entry: Omit<PlayHistoryEntry, 'id'>) {
  db.prepare(`INSERT INTO play_history (track_id, started_at, start_position, duration, mode, slice_length) VALUES (?,?,?,?,?,?)`)
    .run(entry.trackId, entry.startedAt, entry.startPosition, entry.duration, entry.mode, entry.sliceLength);
}

export function getRecentHistory(limit = 100): (PlayHistoryEntry & { track: Track | null })[] {
  const rows = db.prepare('SELECT * FROM play_history ORDER BY started_at DESC LIMIT ?').all(limit) as any[];
  return rows.map((r) => ({
    id: r.id,
    trackId: r.track_id,
    startedAt: r.started_at,
    startPosition: r.start_position,
    duration: r.duration,
    mode: r.mode,
    sliceLength: r.slice_length,
    track: getTrack(r.track_id),
  }));
}

// === Multi-track scenes ====================================================

export interface SceneRow {
  id: number;
  name: string;
  createdAt: number;
  data: string;
}

export function listScenes(): SceneRow[] {
  return (db.prepare('SELECT id, name, created_at, data FROM multitrack_scenes ORDER BY created_at DESC').all() as any[])
    .map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, data: r.data }));
}

export function saveScene(name: string, data: string): SceneRow {
  const r = db.prepare('INSERT INTO multitrack_scenes (name, created_at, data) VALUES (?, ?, ?)')
    .run(name, Date.now(), data);
  const row = db.prepare('SELECT id, name, created_at, data FROM multitrack_scenes WHERE id = ?').get(r.lastInsertRowid) as any;
  return { id: row.id, name: row.name, createdAt: row.created_at, data: row.data };
}

export function deleteScene(id: number) {
  db.prepare('DELETE FROM multitrack_scenes WHERE id = ?').run(id);
}

// === Settings =============================================================

export function getSetting(key: string): string | null {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
  return r ? r.value : null;
}

export function setSetting(key: string, value: string) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
