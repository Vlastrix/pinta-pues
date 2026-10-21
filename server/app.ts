import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { Server } from 'socket.io';
import { Game } from './game.js';
import { Store } from './store.js';
import { Auth } from './auth.js';
import { clientIp, sameOrigin, WindowLimiter } from './security.js';
import { RECONNECT_GRACE_MS } from '../shared/types.js';
import { recoveryMailFromEnv, type RecoveryMail } from './mail.js';

export function createApp(dbPath = process.env.DB_PATH ?? './data/pinta-pues.sqlite', timing?: { choice: number; reveal: number; turn?: number; reconnect?: number }, recoveryMail: RecoveryMail | null = recoveryMailFromEnv()) {
  const app = express();
  app.disable('x-powered-by');
  const limiter = new WindowLimiter();
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    if (req.path.startsWith('/api/') && !limiter.allow(`http:${clientIp(req)}`, 240, 60000)) {
      res.status(429).json({ error: 'Demasiadas solicitudes. Espera un minuto.' }); return;
    }
    next();
  });
  app.use(express.json({ limit: '8kb' }));
  const http = createServer(app);
  const io = new Server(http, {
    connectionStateRecovery: { maxDisconnectionDuration: timing?.reconnect ?? RECONNECT_GRACE_MS, skipMiddlewares: false },
    maxHttpBufferSize: 32000,
    allowRequest: (req, callback) => callback(null, sameOrigin(req) && limiter.allow(`connect:${clientIp(req)}`, 60, 60000)),
  });
  const store = new Store(dbPath);
  const auth = new Auth(store, io, recoveryMail);
  io.use((socket, next) => {
    if (!sameOrigin(socket.request)) { next(new Error('Origen no permitido.')); return; }
    const ip = clientIp(socket.request);
    const connections = [...io.sockets.sockets.values()].filter(other => other.data.ip === ip).length;
    if (connections >= 24 || io.sockets.sockets.size >= 1000) { next(new Error('Demasiadas conexiones.')); return; }
    const identity = auth.identities(socket.request);
    if (socket.recovered && (socket.data.userId !== identity.account?.id
      || !(socket.data.identities as string[]).some(id => identity.ids.includes(id) || id === `guest:${socket.id}`))) {
      next(new Error('Tu sesión cambió. Vuelve a entrar a la sala.')); return;
    }
    socket.data.ip = ip;
    socket.data.identities = identity.ids.length ? identity.ids : [`guest:${socket.id}`];
    socket.data.userId = identity.account?.id;
    let checkedAt = Date.now();
    socket.use((_packet, done) => {
      if (socket.data.userId && Date.now() - checkedAt >= 30000) {
        checkedAt = Date.now();
        if (auth.account(socket.request)?.id !== socket.data.userId) { socket.disconnect(true); done(new Error('Tu sesión expiró.')); return; }
      }
      done();
    });
    next();
  });
  auth.install(app);
  const game = new Game(io, store, timing);
  app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'Pinta Pues' }));
  app.get('/api/categories', (_req, res) => res.json(store.categories()));
  app.get('/api/leaderboard', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(store.leaderboard(auth.account(req)?.id));
  });
  const client = resolve(fileURLToPath(new URL('../client', import.meta.url)));
  if (existsSync(client)) {
    app.use(express.static(client));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve(client, 'index.html')));
  }
  app.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.status === 413 ? 413 : 400).json({ error: error.status === 413 ? 'La solicitud es demasiado grande.' : 'Solicitud inválida.' });
  });
  return {
    app, http, io, game, store, auth,
    close: () => new Promise<void>(done => { game.close(); io.close(() => { void auth.close().finally(() => { store.close(); done(); }); }); }),
  };
}
