import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { io, type Socket } from 'socket.io-client';
import { createApp } from '../server/app.js';
import { WindowLimiter } from '../server/security.js';
import type { RoomView } from '../shared/types.js';

async function fixture(timing?: { choice: number; reveal: number; turn?: number }) {
  const app = createApp(':memory:', timing); app.http.listen(0, '127.0.0.1'); await once(app.http, 'listening');
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

test('reconexión: el puesto reservado evita duplicar cuentas y expulsar a un desconectado cancela su regreso', async () => {
  const f = await fixture();
  try {
    const jar = f.jar();
    await jar.request('/api/auth/register', { email: 'movil@example.com', password: 'Clave-movil-12345' });
    const host = await f.connect(); const guest = await f.connect(jar.header());
    await f.emit(host, 'room:create', { name: 'Anfitrión' }); const code = f.state(host).code;
    await f.emit(guest, 'room:join', { name: 'Móvil', code });
    const oldId = guest.id!;
    guest.io.reconnection(false); guest.io.engine.close();
    await f.wait(host, state => state.players.some(player => player.id === oldId && !player.connected));
    const duplicate = await f.connect(jar.header());
    assert.equal((await f.emit(duplicate, 'room:join', { name: 'Otra pestaña', code })).ok, false);
    assert.equal((await f.emit(host, 'room:moderate', { target: oldId, action: 'kick' })).ok, true);
    const reconnected = once(guest, 'connect'); guest.connect(); await reconnected;
    assert.equal(f.app.game.membership.has(guest.id!), false);
    assert.equal(f.app.io.sockets.sockets.get(guest.id!)!.rooms.has(code), false);
    assert.equal((await f.emit(guest, 'room:join', { name: 'Móvil', code })).ok, false);
  } finally { await f.close(); }
});

test('ranking HTTP: puntos reales al finalizar, identidad del servidor y sin correo público', async () => {
  const f = await fixture({ choice: 30000, turn: 30000, reveal: 10 });
  try {
    const jar = f.jar();
    const signup = await jar.request('/api/auth/register', { email: 'ranking@example.com', password: 'Mi-clave-ranking-123' });
    const registered = await f.connect(jar.header()); const guest = await f.connect();
    await f.emit(guest, 'room:create', { name: 'Invitado', userId: signup.data.user.id });
    await f.emit(registered, 'room:join', { name: 'Cuenta real', code: f.state(guest).code });
    await f.emit(guest, 'room:settings', { rounds: 1, duration: 30, categories: ['Bolivia'] });
    await f.emit(guest, 'game:start');
    await f.emit(guest, 'game:choose', { word: f.state(guest).choices![0] });
    await f.emit(registered, 'chat:send', { text: f.state(guest).word, score: 999999 });
    assert.deepEqual((await jar.request('/api/leaderboard')).data, []);
    await f.wait(registered, state => state.phase === 'choosing' && Boolean(state.choices));
    await f.emit(registered, 'game:choose', { word: f.state(registered).choices![0] });
    await f.emit(guest, 'chat:send', { text: f.state(registered).word });
    await f.wait(registered, state => state.phase === 'finished');
    const ranking = await jar.request('/api/leaderboard');
    assert.equal(ranking.response.status, 200); assert.equal(ranking.response.headers.get('cache-control'), 'no-store');
    assert.equal(ranking.data.length, 1); assert.equal(ranking.data[0].name, 'Cuenta real');
    assert.equal(ranking.data[0].points, f.state(registered).players.find(player => player.id === registered.id)!.score);
    assert.equal(ranking.data[0].games, 1); assert.equal(ranking.data[0].isYou, true);
    const publicRanking = await (await fetch(`${f.url}/api/leaderboard`)).json();
    assert.equal(publicRanking[0].isYou, false);
    assert.ok(!JSON.stringify(publicRanking).includes('ranking@example.com'));
    assert.ok(!JSON.stringify(publicRanking).includes(signup.data.user.id));
  } finally { await f.close(); }
});

test('perfil: validación, identidad autenticada, persistencia entre sesiones y ranking sin perder puntos', async () => {
  const f = await fixture();
  try {
    const jar = f.jar(); const other = f.jar();
    const signup = await jar.request('/api/auth/register', { email: 'perfil@example.com', password: 'Clave-perfil-12345' });
    const id = signup.data.user.id;
    f.app.store.saveResult('ABC123', [{ userId: id, name: 'Antes', score: 500 }]);
    assert.equal((await other.request('/api/profile', { name: 'Intruso', avatar: 'pinta-pues-1' })).response.status, 401);
    assert.equal((await jar.request('/api/profile', { name: 'Mal origen', avatar: 'pinta-pues-1' }, 'https://intruso.example')).response.status, 403);
    for (const body of [{ name: ' ', avatar: 'pinta-pues-1' }, { name: 'a'.repeat(21), avatar: 'pinta-pues-1' }, { name: 'Válido', avatar: '<script>' }]) {
      assert.equal((await jar.request('/api/profile', body)).response.status, 400);
    }
    const saved = await jar.request('/api/profile', { name: '  Vanguard  ', avatar: 'pinta-pues-5', id: 'otro', email: 'otro@example.com' });
    assert.equal(saved.response.status, 200); assert.equal(saved.data.user.name, 'Vanguard');
    assert.equal(saved.data.user.id, id); assert.equal(saved.data.user.email, 'perfil@example.com');
    assert.equal((await jar.request('/api/session')).data.user.avatar, 'pinta-pues-5');
    const login = await other.request('/api/auth/login', { email: 'perfil@example.com', password: 'Clave-perfil-12345' });
    assert.equal(login.data.user.name, 'Vanguard'); assert.equal(login.data.user.avatar, 'pinta-pues-5');
    const ranking = await jar.request('/api/leaderboard');
    assert.equal(ranking.data[0].name, 'Vanguard'); assert.equal(ranking.data[0].avatar, 'pinta-pues-5'); assert.equal(ranking.data[0].points, 500);
    f.app.store.saveResult('ABC124', [{ userId: id, name: 'Apodo de sala', avatar: 'pinta-pues-2', score: 100 }]);
    assert.equal(f.app.store.leaderboard()[0].name, 'Vanguard'); assert.equal(f.app.store.leaderboard()[0].points, 600);
  } finally { await f.close(); }
});

test('insignias: hechos reales, sin duplicados, persistentes en cuenta, ranking y al volver a la sala', async () => {
  const f = await fixture({ choice: 30000, turn: 120, reveal: 10 });
  try {
    const jar = f.jar(); const signup = await jar.request('/api/auth/register', { email: 'insignias@example.com', password: 'Clave-insignias-123' });
    const host = await f.connect(jar.header()); const guest = await f.connect();
    await f.emit(host, 'room:create', { name: 'Artista', badges: ['last-place'] }); const code = f.state(host).code;
    assert.deepEqual(f.state(host).players[0].badges, []);
    await f.emit(guest, 'room:join', { name: 'Invitado', code });
    await f.emit(host, 'room:settings', { rounds: 1, duration: 30, categories: ['Bolivia'] });
    await f.emit(host, 'game:start');
    await f.emit(host, 'game:choose', { word: f.state(host).choices![0] });
    await f.emit(host, 'board:action', { id: 'arte', tool: 'brush', color: '#7460bf', size: 6, points: [{ x: 10, y: 20 }] });
    await f.wait(guest, state => state.phase === 'choosing' && Boolean(state.choices));
    await f.emit(guest, 'game:choose', { word: f.state(guest).choices![0] });
    await f.wait(host, state => state.phase === 'finished');
    const earned = ['zero-guesses', 'silent-round', 'misunderstood'];
    assert.deepEqual((await jar.request('/api/session')).data.user.badges, earned);
    assert.deepEqual((await jar.request('/api/leaderboard')).data[0].badges, earned);
    assert.deepEqual(f.state(host).players[0].badges, earned);
    // Exercise last place in a group with a mix of correct and missed guesses.
    const third = await f.connect(); await f.emit(third, 'room:join', { name: 'Tercero', code });
    await f.emit(host, 'game:start');
    const word = f.state(host).choices![0]; await f.emit(host, 'game:choose', { word });
    await f.wait(guest, state => state.phase === 'choosing' && Boolean(state.choices));
    await f.emit(guest, 'game:choose', { word: f.state(guest).choices![0] });
    await f.emit(third, 'chat:send', { text: f.state(guest).word });
    await f.wait(third, state => state.phase === 'choosing' && Boolean(state.choices));
    await f.emit(third, 'game:choose', { word: f.state(third).choices![0] });
    await f.wait(host, state => state.phase === 'finished');
    assert.ok((await jar.request('/api/session')).data.user.badges.includes('last-place'));
    const rows = f.app.store.db.prepare('SELECT badge_id FROM user_badges WHERE user_id = ?').all(signup.data.user.id);
    assert.equal(rows.length, 4);
    await f.emit(host, 'room:leave');
    await f.emit(host, 'room:join', { name: 'Artista otra vez', code });
    assert.equal(f.state(host).players.find(player => player.id === host.id)!.badges!.length, 4);
    assert.deepEqual(f.state(host).players.find(player => player.id === guest.id)!.badges, []);
  } finally { await f.close(); }
});

test('insignias: ni lienzos vacíos ni reportes conceden arte incomprendido; partidas interrumpidas no conceden nada', async () => {
  const f = await fixture({ choice: 30000, turn: 1000, reveal: 10 });
  try {
    const jar = f.jar(); await jar.request('/api/auth/register', { email: 'reportes-insignias@example.com', password: 'Clave-insignias-123' });
    const host = await f.connect(jar.header()); const guest = await f.connect();
    await f.emit(host, 'room:create', { name: 'Pintor' }); const code = f.state(host).code;
    await f.emit(guest, 'room:join', { name: 'Amigo', code });
    await f.emit(host, 'room:settings', { rounds: 1, duration: 30, categories: ['Bolivia'] });
    await f.emit(host, 'game:start'); await f.emit(host, 'game:choose', { word: f.state(host).choices![0] });
    await f.emit(guest, 'room:leave');
    assert.deepEqual((await jar.request('/api/session')).data.user.badges, []);
    await f.emit(guest, 'room:join', { name: 'Amigo', code });
    await f.emit(host, 'game:start'); await f.emit(host, 'game:choose', { word: f.state(host).choices![0] });
    await f.emit(host, 'board:action', { id: 'reportado', tool: 'brush', color: '#7460bf', size: 6, points: [{ x: 10, y: 20 }] });
    await f.emit(guest, 'game:report');
    await f.wait(guest, state => state.phase === 'choosing' && Boolean(state.choices));
    await f.emit(guest, 'game:choose', { word: f.state(guest).choices![0] }); await f.emit(host, 'game:report');
    await f.wait(host, state => state.phase === 'finished');
    assert.deepEqual((await jar.request('/api/session')).data.user.badges, ['zero-guesses', 'silent-round']);
  } finally { await f.close(); }
});

test('insignias: entrar a mitad de una ronda no concede ronda en blanco', async () => {
  const f = await fixture({ choice: 30000, turn: 120, reveal: 10 });
  try {
    const jar = f.jar(); await jar.request('/api/auth/register', { email: 'tarde-insignias@example.com', password: 'Clave-insignias-123' });
    const host = await f.connect(); const guest = await f.connect(); const late = await f.connect(jar.header());
    await f.emit(host, 'room:create', { name: 'Anfitrión' }); const code = f.state(host).code;
    await f.emit(guest, 'room:join', { name: 'Amigo', code });
    await f.emit(host, 'room:settings', { rounds: 1, duration: 30, categories: ['Bolivia'] });
    await f.emit(host, 'game:start'); await f.emit(host, 'game:choose', { word: f.state(host).choices![0] });
    await f.emit(late, 'room:join', { name: 'Recién llegado', code });
    await f.wait(guest, state => state.phase === 'choosing' && Boolean(state.choices));
    await f.emit(guest, 'game:choose', { word: f.state(guest).choices![0] });
    await f.wait(late, state => state.phase === 'finished');
    assert.deepEqual((await jar.request('/api/session')).data.user.badges, ['zero-guesses']);
  } finally { await f.close(); }
});

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

test('reportes: solo la unanimidad termina el turno y los puntos se conservan', async () => {
  const f = await fixture({ choice: 30000, reveal: 200, turn: 30000 });
  try {
    const host = await f.connect(); const guest = await f.connect(); const third = await f.connect();
    await f.emit(host, 'room:create', { name: 'Uno' }); const code = f.state(host).code;
    await f.emit(guest, 'room:join', { name: 'Dos', code }); await f.emit(third, 'room:join', { name: 'Tres', code });
    await f.emit(host, 'game:start'); await f.emit(host, 'game:choose', { word: f.state(host).choices![0] });
    f.app.game.rooms.get(code)!.players[0].score = 300;
    const word = f.state(host).word;
    await f.emit(guest, 'game:report'); assert.equal(f.state(guest).phase, 'drawing');
    assert.equal((await f.emit(guest, 'game:report')).ok, false);
    await new Promise(resolve => setTimeout(resolve, 3050));
    await f.emit(third, 'game:report'); const state = await f.wait(third, state => state.reportCount === 2);
    assert.equal(state.players.find(player => player.id === host.id)!.score, 300);
    assert.equal(state.phase, 'reveal'); assert.equal(state.reportRequired, 2);
    assert.equal(state.word, word);
    assert.ok(state.players.filter(player => player.id !== host.id).every(player => player.score === 0));
    assert.equal((await f.emit(third, 'game:report')).ok, false);
    assert.equal((await f.emit(host, 'board:clear')).ok, false);
    assert.equal((f.app.store.db.prepare("SELECT COUNT(*) AS count FROM moderation WHERE action = 'report-unanimous'").get() as { count: number }).count, 1);
    await f.wait(guest, state => state.phase === 'choosing' && state.drawer === guest.id);
    assert.equal(f.state(guest).reportCount, 0);
    assert.equal(f.state(guest).players.find(player => player.id === host.id)!.score, 300);
  } finally { await f.close(); }
});

test('limitador: ventanas, aislamiento de claves y tamaño acotado', () => {
  const limiter = new WindowLimiter(2);
  assert.equal(limiter.allow('a', 2, 1000, 0), true); assert.equal(limiter.allow('a', 2, 1000, 1), true);
  assert.equal(limiter.allow('a', 2, 1000, 2), false); assert.equal(limiter.allow('b', 2, 1000, 3), true);
  assert.equal(limiter.allow('c', 2, 1000, 4), false); assert.equal(limiter.allow('c', 2, 1000, 1004), true);
});
