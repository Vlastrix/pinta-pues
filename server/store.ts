import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { seeds } from './words.js';
import { DEFAULT_AVATAR, type LeaderboardEntry } from '../shared/types.js';
import { BADGES, type BadgeId } from '../shared/badges.js';

export function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS words (
        id INTEGER PRIMARY KEY, category TEXT NOT NULL, text TEXT NOT NULL,
        UNIQUE(category, text)
      );
      CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY, room_code TEXT NOT NULL, finished_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        scores TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS leaderboard (
        user_id TEXT PRIMARY KEY REFERENCES users(id), name TEXT NOT NULL, avatar TEXT NOT NULL,
        points INTEGER NOT NULL DEFAULT 0, games INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS user_badges (
        user_id TEXT NOT NULL REFERENCES users(id), badge_id TEXT NOT NULL,
        earned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id, badge_id)
      );
      CREATE INDEX IF NOT EXISTS leaderboard_ranking ON leaderboard(points DESC, wins DESC, user_id ASC);
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS password_resets (
        user_id TEXT PRIMARY KEY REFERENCES users(id), token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS moderation (
        id INTEGER PRIMARY KEY, room_code TEXT NOT NULL, actor TEXT NOT NULL, target TEXT NOT NULL,
        action TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
    const userColumns = this.db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
    if (!userColumns.some(column => column.name === 'name')) this.db.exec('ALTER TABLE users ADD COLUMN name TEXT');
    if (!userColumns.some(column => column.name === 'avatar')) this.db.exec(`ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT '${DEFAULT_AVATAR}'`);
    const insert = this.db.prepare('INSERT OR IGNORE INTO words(category, text) VALUES (?, ?)');
    this.db.exec('BEGIN');
    try {
      // Rename the existing category while preserving words in deployed databases.
      this.db.prepare('UPDATE OR IGNORE words SET category = ? WHERE category = ?').run('Fantasía y mitología', 'Fantasía');
      this.db.prepare('DELETE FROM words WHERE category = ?').run('Fantasía');
      for (const [category, words] of Object.entries(seeds)) for (const word of words) insert.run(category, word);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  categories() {
    return (this.db.prepare('SELECT DISTINCT category FROM words ORDER BY category').all() as { category: string }[]).map(row => row.category);
  }
  words(categories: string[]) {
    if (!categories.length) return [];
    return (this.db.prepare(`SELECT text FROM words WHERE category IN (${categories.map(() => '?').join(',')})`).all(...categories) as { text: string }[]).map(row => row.text);
  }
  saveResult(code: string, players: { name: string; score: number; userId?: string; avatar?: string; badges?: BadgeId[] }[]) {
    const best = Math.max(0, ...players.map(player => player.score));
    const update = this.db.prepare(`INSERT INTO leaderboard(user_id, name, avatar, points, games, wins) VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(user_id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar,
      points = leaderboard.points + excluded.points, games = leaderboard.games + 1, wins = leaderboard.wins + excluded.wins`);
    this.db.exec('BEGIN');
    try {
      this.db.prepare('INSERT INTO results(room_code, scores) VALUES (?, ?)').run(code, JSON.stringify(players.map(({ name, score }) => ({ name, score }))));
      const counted = new Set<string>();
      for (const player of players) {
        if (!player.userId || counted.has(player.userId)) continue;
        counted.add(player.userId);
        update.run(player.userId, player.name, player.avatar ?? DEFAULT_AVATAR, player.score, Number(best > 0 && player.score === best));
        for (const badge of player.badges ?? []) {
          if (BADGES.some(definition => definition.id === badge)) this.db.prepare('INSERT OR IGNORE INTO user_badges(user_id, badge_id) VALUES (?, ?)').run(player.userId, badge);
        }
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  leaderboard(viewerId?: string): LeaderboardEntry[] {
    const rows = this.db.prepare(`SELECT user_id, COALESCE(users.name, leaderboard.name) AS name,
      CASE WHEN users.name IS NOT NULL THEN users.avatar ELSE leaderboard.avatar END AS avatar, points, games, wins
      FROM leaderboard JOIN users ON users.id = leaderboard.user_id
      ORDER BY points DESC, wins DESC, user_id ASC LIMIT 10`).all() as { user_id: string; name: string; avatar: string; points: number; games: number; wins: number }[];
    return rows.map(({ user_id, ...entry }, index) => ({ ...entry, rank: index + 1, isYou: user_id === viewerId, badges: this.badges(user_id) }));
  }
  badges(userId?: string): BadgeId[] {
    if (!userId) return [];
    const rows = this.db.prepare('SELECT badge_id FROM user_badges WHERE user_id = ?').all(userId) as { badge_id: string }[];
    return BADGES.filter(badge => rows.some(row => row.badge_id === badge.id)).map(badge => badge.id);
  }
  logModeration(code: string, actor: string, target: string, action: string) {
    this.db.prepare('INSERT INTO moderation(room_code, actor, target, action) VALUES (?, ?, ?, ?)').run(code, actor, target, action);
  }
  close() { this.db.close(); }
}
