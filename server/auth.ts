import { createHash, createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Express, Request, Response } from 'express';
import type { Server } from 'socket.io';
import { z } from 'zod';
import type { Store } from './store.js';
import { clientIp, sameOrigin, WindowLimiter } from './security.js';

export type Account = { id: string; email: string };
const credentials = z.object({
  email: z.email('Ingresa un correo válido.').max(254).transform(value => value.toLowerCase()),
  password: z.string().min(10, 'Usa al menos 10 caracteres.').max(128, 'Máximo 128 caracteres.'),
});
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64,
    { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}
function cookies(req: IncomingMessage) {
  const values: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) values[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return values;
}

export class Auth {
  private guestSecret = randomBytes(32);
  private limiter = new WindowLimiter();
  private activeHashes = 0;
  constructor(private store: Store, private io: Server) {}
  private cookie(res: Response, name: string, value: string, maxAge: number) {
    res.cookie(name, value, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge });
  }
  account(req: IncomingMessage): Account | null {
    const token = cookies(req).pp_session;
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return (this.store.db.prepare(`SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(digest(token), Date.now()) as Account | undefined) ?? null;
  }
  identities(req: IncomingMessage) {
    const account = this.account(req); const guest = cookies(req).pp_guest;
    const ids: string[] = [];
    if (account) ids.push(`user:${account.id}`);
    if (guest && /^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(guest)) {
      const [id, signature] = guest.split('.');
      const expected = createHmac('sha256', this.guestSecret).update(id).digest();
      if (timingSafeEqual(Buffer.from(signature, 'hex'), expected)) ids.push(`guest:${id}`);
    }
    return { account, ids };
  }
  private ensureGuest(req: Request, res: Response) {
    if (this.identities(req).ids.some(id => id.startsWith('guest:'))) return;
    const id = randomBytes(32).toString('hex');
    this.cookie(res, 'pp_guest', `${id}.${createHmac('sha256', this.guestSecret).update(id).digest('hex')}`, SESSION_MS);
  }
  private revoke(req: IncomingMessage) {
    const token = cookies(req).pp_session;
    if (!token) return;
    this.store.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token));
    for (const socket of this.io.sockets.sockets.values()) {
      if (cookies(socket.request).pp_session === token) socket.disconnect(true);
    }
  }
  install(app: Express) {
    app.get('/api/session', (req, res) => {
      res.setHeader('Cache-Control', 'no-store'); this.ensureGuest(req, res);
      res.json({ user: this.account(req) });
    });
    app.post('/api/auth/:operation', async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      if (!sameOrigin(req)) { res.status(403).json({ error: 'Origen no permitido.' }); return; }
      const operation = req.params.operation;
      if (!['register', 'login', 'logout'].includes(operation)) { res.status(404).json({ error: 'Acción desconocida.' }); return; }
      if (operation === 'logout') {
        this.revoke(req); this.cookie(res, 'pp_session', '', 0); res.json({ user: null }); return;
      }
      if (!this.limiter.allow(`ip:${clientIp(req)}`, 15, 15 * 60000)) { res.status(429).json({ error: 'Demasiados intentos. Vuelve en 15 minutos.' }); return; }
      const parsed = credentials.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0].message }); return; }
      const { email, password } = parsed.data;
      if (!this.limiter.allow(`email:${digest(email)}`, 10, 15 * 60000) || this.activeHashes >= 4) {
        res.status(429).json({ error: 'Demasiados intentos. Prueba más tarde.' }); return;
      }
      this.activeHashes++;
      try {
        let user = this.store.db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(email) as (Account & { password_hash: string }) | undefined;
        if (operation === 'register') {
          const salt = randomBytes(16).toString('hex'); const key = await derive(password, salt);
          if (user) { res.status(400).json({ error: 'No se pudo crear la cuenta con esos datos.' }); return; }
          user = { id: randomUUID(), email, password_hash: `${salt}:${key.toString('hex')}` };
          this.store.db.prepare('INSERT INTO users(id, email, password_hash) VALUES (?, ?, ?)').run(user.id, user.email, user.password_hash);
        } else {
          // Unknown users take the same expensive password derivation path.
          const [salt, expected] = (user?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
          const key = await derive(password, salt);
          if (!user || !timingSafeEqual(key, Buffer.from(expected, 'hex'))) { res.status(401).json({ error: 'Correo o contraseña incorrectos.' }); return; }
        }
        this.revoke(req); this.ensureGuest(req, res);
        this.store.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
        const token = randomBytes(32).toString('hex');
        this.store.db.prepare('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(digest(token), user.id, Date.now() + SESSION_MS);
        this.cookie(res, 'pp_session', token, SESSION_MS);
        res.json({ user: { id: user.id, email: user.email } });
      } catch { res.status(400).json({ error: 'No se pudo completar la operación. Intenta otra vez.' }); }
      finally { this.activeHashes--; }
    });
  }
}
