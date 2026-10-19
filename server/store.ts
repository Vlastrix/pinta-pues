import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const seeds: Record<string, string[]> = {
  Bolivia: ['salteña', 'llajua', 'teleférico', 'charango', 'api morado', 'chola', 'Illimani', 'anticucho', 'toborochi', 'marraqueta', 'caporal', 'ekeko', 'trancadera', 'caserita', 'choclo'],
  Cotidianas: ['bicicleta', 'paraguas', 'gato', 'helado', 'astronauta', 'volcán', 'castillo', 'pulpo', 'guitarra', 'dinosaurio', 'avión', 'pizza', 'robot', 'tiburón', 'mochila'],
  Sistemas: ['bug', 'teclado', 'servidor', 'base de datos', 'programador', 'cable de red', 'mouse', 'computadora', 'wifi', 'nube', 'impresora', 'pantalla azul'],
  Anime: ['Naruto', 'Goku', 'Pikachu', 'Dragon Ball', 'Death Note', 'Luffy', 'Totoro', 'Pokébola', 'Shenlong', 'Doraemon', 'kunai', 'Sharingan'],
};

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
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS moderation (
        id INTEGER PRIMARY KEY, room_code TEXT NOT NULL, actor TEXT NOT NULL, target TEXT NOT NULL,
        action TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
    const insert = this.db.prepare('INSERT OR IGNORE INTO words(category, text) VALUES (?, ?)');
    this.db.exec('BEGIN');
    try {
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
  saveResult(code: string, players: { name: string; score: number }[]) {
    this.db.prepare('INSERT INTO results(room_code, scores) VALUES (?, ?)').run(code, JSON.stringify(players));
  }
  logModeration(code: string, actor: string, target: string, action: string) {
    this.db.prepare('INSERT INTO moderation(room_code, actor, target, action) VALUES (?, ?, ?, ?)').run(code, actor, target, action);
  }
  close() { this.db.close(); }
}
