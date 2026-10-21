import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import { createApp } from '../server/app.js';
import type { RecoveryMail } from '../server/mail.js';

async function fixture(configured = true, fail = false) {
  const messages: { email: string; url: string }[] = [];
  const mail: RecoveryMail = { origin: 'https://pintapues.test', sendReset: async (email, url) => {
    if (fail) throw new Error('SMTP no disponible');
    messages.push({ email, url });
  } };
  const app = createApp(':memory:', undefined, configured ? mail : null);
  app.http.listen(0, '127.0.0.1'); await once(app.http, 'listening');
  const url = `http://127.0.0.1:${(app.http.address() as { port: number }).port}`;
  const jar = () => {
    const cookies = new Map<string, string>();
    const header = () => [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    return { header, async request(path: string, data?: unknown, origin = url) {
      const response = await fetch(url + path, { method: data === undefined ? 'GET' : 'POST', headers: { Cookie: header(), Origin: origin, 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
      for (const cookie of response.headers.getSetCookie()) { const [pair] = cookie.split(';'); const i = pair.indexOf('='); cookies.set(pair.slice(0, i), pair.slice(i + 1)); }
      return { response, data: await response.json() };
    } };
  };
  return { app, url, jar, messages, token: () => new URLSearchParams(new URL(messages.at(-1)!.url).hash.slice(1)).get('restablecer')! };
}

test('recuperación: correo genérico, hash del enlace, cambio de clave y sesiones anteriores revocadas', async () => {
  const f = await fixture(); const jar = f.jar();
  const email = 'recuperar@example.com'; const oldPassword = 'Clave-anterior-123'; const password = 'Nueva-clave-45678';
  let socket: ReturnType<typeof io> | undefined;
  try {
    const signup = await jar.request('/api/auth/register', { email, password: oldPassword });
    socket = io(f.url, { transports: ['websocket'], extraHeaders: { Cookie: jar.header() }, reconnection: false });
    await once(socket, 'connect');
    const missing = await jar.request('/api/password/forgot', { email: 'no-existe@example.com' });
    const known = await jar.request('/api/password/forgot', { email });
    await f.app.auth.close();
    assert.equal(known.response.status, 202); assert.deepEqual(missing.data, known.data);
    assert.equal(f.messages.length, 1); assert.equal(f.messages[0].email, email);
    assert.ok(f.messages[0].url.startsWith('https://pintapues.test/#restablecer='));
    const token = f.token(); assert.ok(!JSON.stringify(known.data).includes(token));
    const stored = f.app.store.db.prepare('SELECT token_hash, expires_at FROM password_resets').get() as { token_hash: string; expires_at: number };
    assert.notEqual(stored.token_hash, token); assert.match(stored.token_hash, /^[a-f0-9]{64}$/);
    assert.ok(stored.expires_at > Date.now() && stored.expires_at <= Date.now() + 30 * 60000);
    const other = f.jar();
    const disconnected = once(socket, 'disconnect');
    assert.equal((await other.request('/api/password/reset', { token, password })).response.status, 200);
    await disconnected;
    assert.equal((await jar.request('/api/session')).data.user, null);
    assert.equal((await jar.request('/api/auth/login', { email, password: oldPassword })).response.status, 401);
    assert.equal((await jar.request('/api/auth/login', { email, password })).data.user.id, signup.data.user.id);
    assert.equal((await jar.request('/api/password/reset', { token, password })).response.status, 400);
  } finally { socket?.disconnect(); await f.app.close(); }
});

test('recuperación: origen, vencimiento, enlace anterior y consumo simultáneo', async () => {
  const f = await fixture(); const jar = f.jar(); const email = 'enlaces@example.com'; const password = 'Nueva-clave-45678';
  try {
    await jar.request('/api/auth/register', { email, password: 'Clave-anterior-123' });
    assert.equal((await jar.request('/api/password/forgot', { email }, 'https://intruso.test')).response.status, 403);
    await jar.request('/api/password/forgot', { email }); await f.app.auth.close(); const oldToken = f.token();
    f.app.store.db.prepare('UPDATE password_resets SET expires_at = ?').run(Date.now() - 1);
    assert.equal((await jar.request('/api/password/reset', { token: oldToken, password })).response.status, 400);
    await jar.request('/api/password/forgot', { email }); await f.app.auth.close(); const previous = f.token();
    await jar.request('/api/password/forgot', { email }); await f.app.auth.close(); const token = f.token();
    assert.equal((await jar.request('/api/password/reset', { token: previous, password })).response.status, 400);
    assert.equal((await jar.request('/api/password/reset', { token, password }, 'https://intruso.test')).response.status, 403);
    assert.equal((await jar.request('/api/password/reset', { token, password: 'corta' })).response.status, 400);
    const attempts = await Promise.all([jar.request('/api/password/reset', { token, password }), jar.request('/api/password/reset', { token, password: 'Otra-clave-987654' })]);
    assert.deepEqual(attempts.map(result => result.response.status).sort(), [200, 400]);
    assert.equal((f.app.store.db.prepare('SELECT COUNT(*) AS count FROM password_resets').get() as { count: number }).count, 0);
  } finally { await f.app.close(); }
});

test('recuperación: sin SMTP no promete envío; límite de solicitudes y fallo de correo sin filtrar secretos', async t => {
  const disabled = await fixture(false);
  try { assert.equal((await disabled.jar().request('/api/password/forgot', { email: 'alguien@example.com' })).response.status, 503); }
  finally { await disabled.app.close(); }
  const limited = await fixture(); const jar = limited.jar();
  try {
    for (let i = 0; i < 5; i++) assert.equal((await jar.request('/api/password/forgot', { email: `correo${i}@example.com` })).response.status, 202);
    assert.equal((await jar.request('/api/password/forgot', { email: 'otro@example.com' })).response.status, 429);
    assert.equal(limited.messages.length, 0);
  } finally { await limited.app.close(); }
  const failed = await fixture(true, true);
  const log = t.mock.method(console, 'error', () => {});
  try {
    const account = failed.jar(); await account.request('/api/auth/register', { email: 'fallo@example.com', password: 'Una-clave-123456' });
    assert.equal((await account.request('/api/password/forgot', { email: 'fallo@example.com' })).response.status, 202);
    await failed.app.auth.close();
    assert.equal((failed.app.store.db.prepare('SELECT COUNT(*) AS count FROM password_resets').get() as { count: number }).count, 0);
    assert.equal(log.mock.callCount(), 1); assert.ok(!JSON.stringify(log.mock.calls).includes('fallo@example.com'));
  } finally { await failed.app.close(); }
});
