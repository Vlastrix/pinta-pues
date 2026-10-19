import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { io, type Socket } from 'socket.io-client';
import { createApp } from '../server/app.js';
import { WindowLimiter } from '../server/security.js';
import type { RoomView } from '../shared/types.js';

async function fixture() {
  const app = createApp(':memory:'); app.http.listen(0, '127.0.0.1'); await once(app.http, 'listening');
  const url = `http://127.0.0.1:${(app.http.address() as { port: number }).port}`;
  const sockets: Socket[] = []; const states = new Map<Socket, RoomView>();
  const jar = () => {
    const values = new Map<string, string>();
    return {
      values,
      header: () => [...values].map(([key, value]) => `${key}=${value}`).join('; '),
      async request(path: string, data?: unknown, origin = url) {
        const response = await fetch(url + path, {
          method: data === undefined ? 'GET' : 'POST',
          headers: { Cookie: [...values].map(([key, value]) => `${key}=${value}`).join('; '), 'Content-Type': 'application/json', Origin: origin },
          ...(data === undefined ? {} : { body: JSON.stringify(data) }),
        });
        for (const cookie of response.headers.getSetCookie()) {
          const [pair] = cookie.split(';'); const index = pair.indexOf('=');
          values.set(pair.slice(0, index), pair.slice(index + 1));
        }
        return { response, data: await response.json() };
      },
    };
  };
  async function connect(cookie = '') {
    const socket = io(url, { transports: ['websocket'], forceNew: true, extraHeaders: { Cookie: cookie } });
    sockets.push(socket); socket.on('room:state', state => states.set(socket, state));
    await new Promise<void>((resolve, reject) => { socket.once('connect', () => resolve()); socket.once('connect_error', reject); });
    return socket;
  }
  const emit = (socket: Socket, name: string, data: unknown = {}) => socket.timeout(2000).emitWithAck(name, data) as Promise<{ ok: boolean; error?: string }>;
  async function wait(socket: Socket, predicate: (state: RoomView) => boolean) {
    const start = Date.now();
    while (Date.now() - start < 2000) {
      const state = states.get(socket); if (state && predicate(state)) return state;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw Error('Expected room state did not arrive');
  }
  return { app, url, jar, connect, emit, wait, state: (socket: Socket) => states.get(socket)!, close: async () => { sockets.forEach(socket => socket.disconnect()); await app.close(); } };
}

test('cuentas opcionales: hash, cookies privadas, sesión persistente e invalidación al salir', async () => {
  const f = await fixture();
  try {
    const jar = f.jar(); await jar.request('/api/session');
    const password = 'Una-clave-larga-123!';
    const signup = await jar.request('/api/auth/register', { email: 'Amigo@example.com', password });
    assert.equal(signup.response.status, 200); assert.equal(signup.data.user.email, 'amigo@example.com');
    const cookie = signup.response.headers.getSetCookie().find(cookie => cookie.startsWith('pp_session='))!;
    assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Strict/i);
    const user = f.app.store.db.prepare('SELECT password_hash FROM users').get() as { password_hash: string };
    assert.notEqual(user.password_hash, password); assert.match(user.password_hash, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
    const token = jar.values.get('pp_session')!;
    const saved = f.app.store.db.prepare('SELECT token_hash FROM sessions').get() as { token_hash: string };
    assert.notEqual(saved.token_hash, token);
    assert.equal((await jar.request('/api/session')).data.user.id, signup.data.user.id);
    const socket = await f.connect(jar.header()); await f.emit(socket, 'room:create', { name: 'Registrado' });
    assert.equal(f.state(socket).players[0].registered, true);
    const disconnected = once(socket, 'disconnect'); await jar.request('/api/auth/logout', {}); await disconnected;
    assert.equal((await jar.request('/api/session')).data.user, null);
    const stale = f.jar(); stale.values.set('pp_session', token);
    assert.equal((await stale.request('/api/session')).data.user, null);
    const wrong = await jar.request('/api/auth/login', { email: 'amigo@example.com', password: 'otra-clave-incorrecta' });
    assert.equal(wrong.response.status, 401);
    const unknown = await jar.request('/api/auth/login', { email: 'desconocido@example.com', password: 'otra-clave-incorrecta' });
    assert.equal(unknown.data.error, wrong.data.error);
    const login = await jar.request('/api/auth/login', { email: 'amigo@example.com', password });
    assert.equal(login.response.status, 200); assert.notEqual(jar.values.get('pp_session'), token);
  } finally { await f.close(); }
});

test('protecciones HTTP: origen ajeno, cuerpo grande y límite de intentos', async () => {
  const f = await fixture();
  try {
    const jar = f.jar();
    assert.equal((await jar.request('/api/auth/register', { email: 'test@example.com', password: 'clave-larga-123' }, 'https://evil.example')).response.status, 403);
    assert.equal((await jar.request('/api/auth/register', { oversized: 'x'.repeat(10000) })).response.status, 413);
    for (let i = 0; i < 15; i++) assert.equal((await jar.request('/api/auth/login', {})).response.status, 400);
    assert.equal((await jar.request('/api/auth/login', {})).response.status, 429);
    assert.equal((f.app.store.db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count, 0);
  } finally { await f.close(); }
});

test('moderación: solo anfitrión, borrar mensajes, silencio sin impedir aciertos y expulsión persistente al reconectar', async () => {
  const f = await fixture();
  try {
    const host = await f.connect(); const jar = f.jar(); await jar.request('/api/session');
    await jar.request('/api/auth/register', { email: 'jugador@example.com', password: 'Una-clave-larga-123!' });
    const guest = await f.connect(jar.header()); const third = await f.connect();
    await f.emit(host, 'room:create', { name: 'Anfitrión' }); const code = f.state(host).code;
    await f.emit(guest, 'room:join', { name: 'Invitado', code }); await f.emit(third, 'room:join', { name: 'Tercero', code });
    assert.equal((await f.emit(guest, 'room:moderate', { target: host.id, action: 'kick' })).ok, false);
    assert.equal((await f.emit(host, 'room:moderate', { target: host.id, action: 'kick' })).ok, false);
    await f.emit(guest, 'chat:send', { text: 'mensaje molesto' });
    const message = f.state(guest).messages.find(message => message.text === 'mensaje molesto')!;
    assert.equal((await f.emit(guest, 'chat:delete', { id: message.id })).ok, false);
    assert.equal((await f.emit(host, 'chat:delete', { id: message.id })).ok, true);
    await f.wait(guest, state => !state.messages.some(item => item.id === message.id));
    await f.emit(host, 'room:moderate', { target: guest.id, action: 'mute' });
    await f.wait(guest, state => state.players.find(player => player.id === guest.id)!.muted);
    await new Promise(resolve => setTimeout(resolve, 360));
    assert.equal((await f.emit(guest, 'chat:send', { text: 'no debe publicarse' })).ok, false);
    await f.emit(host, 'game:start'); await f.emit(host, 'game:choose', { word: f.state(host).choices![0] });
    await new Promise(resolve => setTimeout(resolve, 360));
    assert.equal((await f.emit(guest, 'chat:send', { text: f.state(host).word })).ok, true);
    await f.wait(guest, state => state.players.find(player => player.id === guest.id)!.guessed);
    const kicked = once(guest, 'room:kicked');
    await f.emit(host, 'room:moderate', { target: guest.id, action: 'kick' }); await kicked;
    assert.equal((await f.emit(guest, 'chat:send', { text: 'fuera' })).ok, false);
    guest.disconnect();
    const again = await f.connect(jar.header());
    assert.match((await f.emit(again, 'room:join', { name: 'Otro apodo', code })).error!, /expulsado/);
    await jar.request('/api/auth/logout', {});
    const asGuest = await f.connect(jar.header());
    assert.match((await f.emit(asGuest, 'room:join', { name: 'Ahora invitado', code })).error!, /expulsado/);
    assert.ok((f.app.store.db.prepare('SELECT COUNT(*) AS count FROM moderation').get() as { count: number }).count >= 3);
  } finally { await f.close(); }
});

test('reportes de broma: unanimidad no cambia puntos ni termina el turno', async () => {
  const f = await fixture();
  try {
    const host = await f.connect(); const guest = await f.connect(); const third = await f.connect();
    await f.emit(host, 'room:create', { name: 'Uno' }); const code = f.state(host).code;
    await f.emit(guest, 'room:join', { name: 'Dos', code }); await f.emit(third, 'room:join', { name: 'Tres', code });
    await f.emit(host, 'game:start'); await f.emit(host, 'game:choose', { word: f.state(host).choices![0] });
    f.app.game.rooms.get(code)!.players[0].score = 300;
    await f.emit(guest, 'game:report'); assert.equal(f.state(guest).phase, 'drawing');
    await new Promise(resolve => setTimeout(resolve, 3050));
    await f.emit(third, 'game:report'); const state = await f.wait(third, state => state.reportCount === 2);
    assert.equal(state.players.find(player => player.id === host.id)!.score, 300);
    assert.equal(state.phase, 'drawing'); assert.equal(state.reportRequired, 2);
    assert.equal((await f.emit(third, 'game:report')).ok, false);
    assert.equal((await f.emit(host, 'board:clear')).ok, true);
    assert.equal((f.app.store.db.prepare("SELECT COUNT(*) AS count FROM moderation WHERE action = 'report-unanimous'").get() as { count: number }).count, 1);
  } finally { await f.close(); }
});

test('limitador: ventanas, aislamiento de claves y tamaño acotado', () => {
  const limiter = new WindowLimiter(2);
  assert.equal(limiter.allow('a', 2, 1000, 0), true); assert.equal(limiter.allow('a', 2, 1000, 1), true);
  assert.equal(limiter.allow('a', 2, 1000, 2), false); assert.equal(limiter.allow('b', 2, 1000, 3), true);
  assert.equal(limiter.allow('c', 2, 1000, 4), false); assert.equal(limiter.allow('c', 2, 1000, 1004), true);
});
