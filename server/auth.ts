import { createHash, createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Express, Request, Response } from 'express';
import type { Server } from 'socket.io';
import { z } from 'zod';
import type { Store } from './store.js';
import { clientIp, sameOrigin, WindowLimiter } from './security.js';
import { AVATAR_PATTERN, DEFAULT_AVATAR, type AccountUser } from '../shared/types.js';
import type { RecoveryMail } from './mail.js';

export type Account = AccountUser;
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
  private deliveries = new Set<Promise<void>>();
  constructor(private store: Store, private io: Server, private recoveryMail: RecoveryMail | null = null) {}
  private cookie(res: Response, name: string, value: string, maxAge: number) {
    res.cookie(name, value, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge });
  }
  account(req: IncomingMessage): Account | null {
    const token = cookies(req).pp_session;
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const user = this.store.db.prepare(`SELECT users.id, users.email, users.name, users.avatar FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(digest(token), Date.now()) as Omit<Account, 'badges'> | undefined;
    return user ? { ...user, badges: this.store.badges(user.id) } : null;
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
    app.post('/api/password/forgot', (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      if (!sameOrigin(req)) { res.status(403).json({ error: 'Origen no permitido.' }); return; }
      if (!this.recoveryMail) { res.status(503).json({ error: 'La recuperación por correo todavía no está disponible. Intenta más tarde.' }); return; }
      const parsed = credentials.pick({ email: true }).safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Ingresa un correo válido.' }); return; }
      const { email } = parsed.data;
      if (!this.limiter.allow(`forgot-ip:${clientIp(req)}`, 5, 15 * 60000) || !this.limiter.allow(`forgot-email:${digest(email)}`, 3, 60 * 60000)) {
        res.status(429).json({ error: 'Demasiadas solicitudes. Espera antes de pedir otro enlace.' }); return;
      }
      const user = this.store.db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined;
      this.store.db.prepare('DELETE FROM password_resets WHERE expires_at <= ?').run(Date.now());
      if (user) {
        const token = randomBytes(32).toString('hex'); const hash = digest(token);
        this.store.db.prepare(`INSERT INTO password_resets(user_id, token_hash, expires_at) VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET token_hash = excluded.token_hash, expires_at = excluded.expires_at`).run(user.id, hash, Date.now() + 30 * 60000);
        const url = `${this.recoveryMail.origin}/#restablecer=${token}`;
        const delivery = Promise.resolve().then(() => this.recoveryMail!.sendReset(email, url)).catch(() => {
          this.store.db.prepare('DELETE FROM password_resets WHERE token_hash = ?').run(hash);
          console.error('No se pudo enviar un correo de recuperación. Revisa la configuración SMTP.');
        }).finally(() => this.deliveries.delete(delivery));
        this.deliveries.add(delivery);
      }
      res.status(202).json({ message: 'Si ese correo tiene una cuenta, recibirás un enlace para restablecer tu contraseña. Revisa también spam.' });
    });
    app.post('/api/password/reset', async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      if (!sameOrigin(req)) { res.status(403).json({ error: 'Origen no permitido.' }); return; }
      if (!this.limiter.allow(`reset-ip:${clientIp(req)}`, 10, 15 * 60000) || this.activeHashes >= 4) {
        res.status(429).json({ error: 'Demasiados intentos. Prueba más tarde.' }); return;
      }
      const parsed = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: credentials.shape.password }).safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Revisa el enlace y usa una contraseña de 10 a 128 caracteres.' }); return; }
      const { token, password } = parsed.data; const hash = digest(token);
      const reset = this.store.db.prepare('SELECT user_id FROM password_resets WHERE token_hash = ? AND expires_at > ?').get(hash, Date.now()) as { user_id: string } | undefined;
      if (!reset) { res.status(400).json({ error: 'El enlace es inválido o venció. Pide uno nuevo.' }); return; }
      this.activeHashes++;
      try {
        const salt = randomBytes(16).toString('hex'); const key = await derive(password, salt);
        this.store.db.exec('BEGIN');
        try {
          const consumed = this.store.db.prepare('DELETE FROM password_resets WHERE token_hash = ? AND expires_at > ?').run(hash, Date.now());
          if (consumed.changes !== 1) {
            this.store.db.exec('ROLLBACK'); res.status(400).json({ error: 'El enlace es inválido o venció. Pide uno nuevo.' }); return;
          }
          this.store.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(`${salt}:${key.toString('hex')}`, reset.user_id);
          this.store.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(reset.user_id);
          this.store.db.exec('COMMIT');
        } catch (error) { this.store.db.exec('ROLLBACK'); throw error; }
        for (const socket of this.io.sockets.sockets.values()) if (socket.data.userId === reset.user_id) socket.disconnect(true);
        this.cookie(res, 'pp_session', '', 0);
        res.json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión con la nueva.' });
      } catch { res.status(400).json({ error: 'No se pudo cambiar la contraseña. Intenta otra vez.' }); }
      finally { this.activeHashes--; }
    });
    app.post('/api/profile', (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      if (!sameOrigin(req)) { res.status(403).json({ error: 'Origen no permitido.' }); return; }
      const user = this.account(req);
      if (!user) { res.status(401).json({ error: 'Inicia sesión para editar tu perfil.' }); return; }
      if (!this.limiter.allow(`profile:${user.id}`, 20, 60000)) { res.status(429).json({ error: 'Demasiados cambios. Espera un minuto.' }); return; }
      const parsed = z.object({ name: z.string().trim().min(2, 'Tu apodo necesita al menos 2 letras.').max(20, 'Tu apodo admite hasta 20 caracteres.'), avatar: z.string().regex(AVATAR_PATTERN, 'Elige un avatar válido.') }).safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0].message }); return; }
      this.store.db.prepare('UPDATE users SET name = ?, avatar = ? WHERE id = ?').run(parsed.data.name, parsed.data.avatar, user.id);
      res.json({ user: { ...user, ...parsed.data } });
    });
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
        let user = this.store.db.prepare('SELECT id, email, name, avatar, password_hash FROM users WHERE email = ?').get(email) as (Account & { password_hash: string }) | undefined;
        if (operation === 'register') {
          const salt = randomBytes(16).toString('hex'); const key = await derive(password, salt);
          if (user) { res.status(400).json({ error: 'No se pudo crear la cuenta con esos datos.' }); return; }
          user = { id: randomUUID(), email, name: null, avatar: DEFAULT_AVATAR, badges: [], password_hash: `${salt}:${key.toString('hex')}` };
          this.store.db.prepare('INSERT INTO users(id, email, password_hash) VALUES (?, ?, ?)').run(user.id, user.email, user.password_hash);
        } else {
          // Unknown users take the same expensive password derivation path.
          const [salt, expected] = (user?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
          const key = await derive(password, salt);
          if (!user || !timingSafeEqual(key, Buffer.from(expected, 'hex'))
            || (this.store.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string } | undefined)?.password_hash !== user.password_hash) { res.status(401).json({ error: 'Correo o contraseña incorrectos.' }); return; }
        }
        this.revoke(req); this.ensureGuest(req, res);
        this.store.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
        const token = randomBytes(32).toString('hex');
        this.store.db.prepare('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(digest(token), user.id, Date.now() + SESSION_MS);
        this.cookie(res, 'pp_session', token, SESSION_MS);
        res.json({ user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, badges: this.store.badges(user.id) } });
      } catch { res.status(400).json({ error: 'No se pudo completar la operación. Intenta otra vez.' }); }
      finally { this.activeHashes--; }
    });
  }
  async close() { await Promise.allSettled(this.deliveries); }
}
