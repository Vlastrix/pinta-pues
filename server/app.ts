import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { Server } from 'socket.io';
import { Game } from './game.js';
import { Store } from './store.js';

export function createApp(dbPath = process.env.DB_PATH ?? './data/pinta-pues.sqlite', timing?: { choice: number; reveal: number; turn?: number }) {
  const app = express();
  app.disable('x-powered-by');
  const http = createServer(app);
  const io = new Server(http, { maxHttpBufferSize: 32000 });
  const store = new Store(dbPath);
  const game = new Game(io, store, timing);
  app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'Pinta Pues' }));
  app.get('/api/categories', (_req, res) => res.json(store.categories()));
  const client = resolve(fileURLToPath(new URL('../client', import.meta.url)));
  if (existsSync(client)) {
    app.use(express.static(client));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve(client, 'index.html')));
  }
  return {
    app, http, io, game, store,
    close: () => new Promise<void>(done => { game.close(); io.close(() => { store.close(); done(); }); }),
  };
}
