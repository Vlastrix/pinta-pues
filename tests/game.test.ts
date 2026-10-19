import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as client, type Socket } from 'socket.io-client';
import { createApp } from '../server/app.js';
import { normalize, Store } from '../server/store.js';
import type { RoomView, DrawAction } from '../shared/types.js';

async function fixture(timing = { choice: 30000, reveal: 30, turn: 30000 }) {
  const app = createApp(':memory:', timing);
  app.http.listen(0, '127.0.0.1'); await once(app.http, 'listening');
  const address = app.http.address();
  assert.ok(address && typeof address !== 'string');
  const sockets: Socket[] = [];
  const states = new Map<Socket, RoomView>();
  async function connect() {
    const socket = client(`http://127.0.0.1:${(address as { port: number }).port}`, { transports: ['websocket'], forceNew: true });
    sockets.push(socket); socket.on('room:state', state => states.set(socket, state));
    socket.on('board:action', action => { const state = states.get(socket); if (state) state.actions.push(action); });
    socket.on('word:hint', hint => { const state = states.get(socket); if (state) state.hint = hint; });
    await once(socket, 'connect'); return socket;
  }
  async function emit(socket: Socket, event: string, data: unknown = {}) {
    return await socket.timeout(2000).emitWithAck(event, data) as { ok: boolean; error?: string };
  }
  async function wait(socket: Socket, predicate: (state: RoomView) => boolean) {
    const start = Date.now();
    while (Date.now() - start < 3000) {
      const state = states.get(socket); if (state && predicate(state)) return state;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error(`Timed out waiting for state; last: ${JSON.stringify(states.get(socket))}`);
  }
  return { app, connect, emit, wait, state: (socket: Socket) => states.get(socket)!, close: async () => { sockets.forEach(socket => socket.disconnect()); await app.close(); } };
}

test('sala real: privacidad de la palabra, validación, dibujo y puntos', async () => {
  const f = await fixture();
  try {
    const host = await f.connect(); const guest = await f.connect(); const third = await f.connect();
    assert.equal((await f.emit(host, 'room:create', { name: 'Vladi', avatar: 'pinta-pues-5' })).ok, true);
    const code = f.state(host).code;
    assert.equal((await f.emit(guest, 'room:join', { name: 'Pepe', avatar: 'pinta-pues-8', code: code.toLowerCase() })).ok, true);
    assert.equal((await f.emit(third, 'room:join', { name: 'Ana', code })).ok, true);
    await f.wait(third, state => state.players.length === 3);
    assert.deepEqual(f.state(third).players.map(player => player.avatar), ['pinta-pues-5', 'pinta-pues-8', 'pinta-pues-1']);
    assert.equal((await f.emit(guest, 'room:settings', { rounds: 1, duration: 30, categories: ['Bolivia'] })).ok, false);
    assert.equal((await f.emit(host, 'room:words', { words: ['salteña', 'caserita', 'llajua'] })).ok, true);
    await f.emit(host, 'room:settings', { rounds: 1, duration: 30, categories: ['Personalizadas'] });
    assert.equal((await f.emit(host, 'game:start')).ok, true);
    assert.equal(f.state(host).choices?.length, 3);
    await f.wait(guest, state => state.phase === 'choosing');
    assert.equal(f.state(guest).choices, undefined);
    assert.equal(f.state(guest).word, undefined);
    assert.equal((await f.emit(guest, 'game:choose', { word: 'salteña' })).ok, false);
    await f.emit(host, 'game:choose', { word: 'salteña' });
    await f.wait(guest, state => state.phase === 'drawing');
    assert.equal(f.state(guest).hint, '_______');
    assert.equal(JSON.stringify(f.state(guest)).includes('salteña'), false);
    const stroke: DrawAction = { id: 'stroke-one', tool: 'brush', size: 6, color: '#292438', points: [{ x: 100, y: 100 }, { x: 200, y: 200 }] };
    assert.equal((await f.emit(guest, 'board:action', stroke)).ok, false);
    assert.equal((await f.emit(host, 'board:action', { ...stroke, points: [{ x: -1, y: 100 }] })).ok, false);
    for (const text of ['', '   ', undefined]) {
      const result = await f.emit(host, 'board:action', { ...stroke, tool: 'text', text });
      assert.equal(result.ok, false);
      assert.equal(result.error, 'Escribe una pista antes de tocar el lienzo.');
    }
    assert.equal((await f.emit(host, 'board:action', { ...stroke, tool: 'text', text: 'S A L T E N A' })).ok, false);
    assert.equal((await f.emit(host, 'board:action', stroke)).ok, true);
    await f.emit(host, 'board:action', { ...stroke, points: [{ x: 200, y: 200 }, { x: 220, y: 210 }] });
    await f.wait(guest, state => state.actions.length === 2);
    assert.equal((await f.emit(guest, 'board:clear')).ok, false);
    await f.emit(host, 'board:undo');
    await f.wait(guest, state => state.actions.length === 0);
    assert.equal((await f.emit(host, 'chat:send', { text: 'salteña' })).ok, false);
    assert.equal((await f.emit(guest, 'chat:send', { text: 'S A L T E N A!!!' })).ok, true);
    await f.wait(third, state => state.players.some(player => player.name === 'Pepe' && player.guessed));
    const state = f.state(third);
    assert.equal(state.phase, 'drawing');
    assert.equal(state.word, undefined);
    assert.equal(state.messages.some(message => normalize(message.text).includes('saltena')), false);
    assert.ok(state.players.find(player => player.name === 'Pepe')!.score >= 100);
    assert.equal(state.players.find(player => player.name === 'Vladi')!.score, 100);
    assert.equal((await f.emit(third, 'chat:send', { text: 'salteña' })).ok, true);
    await f.wait(third, state => state.phase === 'reveal');
    assert.equal(f.state(third).word, 'salteña');
  } finally { await f.close(); }
});

test('partida completa: alterna dibujantes, finaliza, persiste resultados y admite revancha', async () => {
  const f = await fixture();
  try {
    const host = await f.connect(); const guest = await f.connect();
    await f.emit(host, 'room:create', { name: 'Uno' });
    await f.emit(guest, 'room:join', { name: 'Dos', code: f.state(host).code });
    await f.emit(host, 'room:settings', { rounds: 1, duration: 30, categories: ['Bolivia'] });
    await f.emit(host, 'game:start');
    await f.emit(host, 'game:choose', { word: f.state(host).choices![0] });
    await f.emit(guest, 'chat:send', { text: f.state(host).word });
    await f.wait(guest, state => state.phase === 'choosing' && state.drawer === guest.id);
    assert.equal(f.state(guest).round, 1);
    await f.emit(guest, 'game:choose', { word: f.state(guest).choices![0] });
    await f.emit(host, 'chat:send', { text: f.state(guest).word });
    await f.wait(host, state => state.phase === 'finished');
    const result = f.app.store.db.prepare('SELECT scores FROM results').get() as { scores: string };
    assert.equal(JSON.parse(result.scores).length, 2);
    assert.ok(JSON.parse(result.scores).every((player: { score: number }) => player.score >= 200));
    await f.emit(host, 'game:start');
    assert.equal(f.state(host).phase, 'choosing');
    assert.ok(f.state(host).players.every(player => player.score === 0));
  } finally { await f.close(); }
});

test('desconexiones: transfiere anfitrión, vuelve al lobby y limpia la sala vacía', async () => {
  const f = await fixture();
  try {
    const host = await f.connect(); const guest = await f.connect();
    await f.emit(host, 'room:create', { name: 'Uno' });
    const code = f.state(host).code;
    assert.equal((await f.emit(guest, 'room:join', { name: 'uno', code })).ok, false);
    await f.emit(guest, 'room:join', { name: 'Dos', code });
    await f.emit(host, 'game:start');
    const late = await f.connect();
    assert.equal((await f.emit(late, 'room:join', { name: 'Tres', code })).ok, false);
    host.disconnect();
    const state = await f.wait(guest, state => state.players.length === 1 && state.phase === 'lobby');
    assert.equal(state.host, guest.id);
    assert.equal(state.word, undefined); assert.equal(state.choices, undefined);
    await f.emit(guest, 'room:leave');
    assert.equal(f.app.game.rooms.size, 0);
    assert.equal((await f.emit(late, 'room:join', { name: 'Tres', code })).ok, false);
  } finally { await f.close(); }
});

test('reloj del servidor: elige automáticamente, revela al vencer y rechaza trazos fuera de turno', async () => {
  const f = await fixture({ choice: 40, reveal: 500, turn: 100 });
  try {
    const host = await f.connect(); const guest = await f.connect();
    await f.emit(host, 'room:create', { name: 'Uno' });
    await f.emit(guest, 'room:join', { name: 'Dos', code: f.state(host).code });
    await f.emit(host, 'game:start');
    await f.wait(host, state => state.phase === 'drawing');
    assert.ok(f.state(host).word);
    await f.wait(guest, state => state.phase === 'reveal');
    assert.ok(f.state(guest).word);
    assert.equal((await f.emit(host, 'board:clear')).ok, false);
    assert.equal(f.state(host).players[0].score, 0);
  } finally { await f.close(); }
});

test('datos inválidos no alteran salas y el servidor sigue respondiendo', async () => {
  const f = await fixture();
  try {
    const socket = await f.connect();
    for (const data of [null, {}, { name: '' }, { name: 42 }, { name: 'x'.repeat(100) }, { name: 'Avatar', avatar: 'https://example.com/image.svg' }, { name: 'Avatar', avatar: 'x'.repeat(49) }]) assert.equal((await f.emit(socket, 'room:create', data)).ok, false);
    assert.equal(f.app.game.rooms.size, 0);
    assert.equal((await f.emit(socket, 'room:create', { name: 'Jugador' })).ok, true);
    assert.equal((await f.emit(socket, 'room:create', { name: 'Otro' })).ok, false);
    assert.equal((await f.emit(socket, 'room:settings', { rounds: 999, duration: 30, categories: ['Bolivia'] })).ok, false);
    assert.equal((await f.emit(socket, 'game:start')).ok, false);
    assert.equal(f.app.game.rooms.size, 1);
  } finally { await f.close(); }
});

test('audios: Roblox solo tras denuncias unánimes, una vez por turno y en su sala', async () => {
  const f = await fixture();
  try {
    const host = await f.connect(); const guest = await f.connect(); const third = await f.connect(); const outsider = await f.connect();
    const heard = new Map<Socket, string[]>();
    for (const socket of [host, guest, third, outsider]) { heard.set(socket, []); socket.on('sound:play', effect => heard.get(socket)!.push(effect)); }
    await f.emit(host, 'room:create', { name: 'Uno' });
    await f.emit(outsider, 'room:create', { name: 'Afuera' });
    const code = f.state(host).code;
    await f.emit(guest, 'room:join', { name: 'Dos', code });
    await f.emit(third, 'room:join', { name: 'Tres', code });
    assert.equal((await f.emit(guest, 'game:report')).ok, false);
    await f.emit(host, 'game:start');
    assert.equal((await f.emit(guest, 'game:report')).ok, false);
    const word = f.state(host).choices![0];
    await f.emit(host, 'game:choose', { word });
    assert.equal((await f.emit(host, 'game:report')).ok, false);
    assert.equal((await f.emit(guest, 'game:report')).ok, true);
    await f.wait(guest, state => state.reported);
    await f.wait(third, state => state.messages.some(message => message.text === 'Dos reportó al pintor.'));
    assert.equal(f.state(host).reported, false);
    assert.equal((await f.emit(guest, 'game:report')).ok, false);
    assert.equal((await f.emit(third, 'game:report')).ok, false);
    const text = { id: 'bad-text', tool: 'text', color: '#292438', size: 6, points: [{ x: 100, y: 100 }], text: word };
    assert.equal((await f.emit(host, 'board:action', text)).ok, false);
    assert.equal((await f.emit(host, 'board:action', text)).ok, false);
    assert.deepEqual(heard.get(host), ['report']);
    assert.deepEqual(heard.get(guest), ['report']);
    assert.deepEqual(heard.get(third), ['report']);
    assert.deepEqual(heard.get(outsider), []);
    assert.equal(f.state(host).actions.length, 0);
    assert.ok(f.state(host).players.every(player => player.score === 0));
    await new Promise(resolve => setTimeout(resolve, 3050));
    assert.equal((await f.emit(third, 'game:report')).ok, true);
    await f.wait(third, state => state.reported);
    for (const socket of [host, guest, third]) {
      await f.wait(socket, state => state.messages.some(message => message.text.startsWith('Todos reportaron')));
      assert.deepEqual(heard.get(socket), ['report', 'report', 'penalty']);
    }
    assert.equal((await f.emit(third, 'game:report')).ok, false);
    assert.equal((await f.emit(guest, 'game:report')).ok, false);
    assert.deepEqual(heard.get(outsider), []);
    await f.emit(guest, 'chat:send', { text: word });
    await f.emit(third, 'chat:send', { text: word });
    await f.wait(guest, state => state.phase === 'choosing' && state.drawer === guest.id);
    assert.equal(f.state(guest).reported, false);
    await f.wait(third, state => state.phase === 'choosing');
    assert.equal(f.state(third).reported, false);
  } finally { await f.close(); }
});

test('pistas sincronizadas: tres revelaciones sin filtrar la palabra ni reiniciarse con el chat', async () => {
  const f = await fixture({ choice: 30000, reveal: 1000, turn: 1800 });
  try {
    const host = await f.connect(); const guest = await f.connect(); const third = await f.connect();
    await f.emit(host, 'room:create', { name: 'Uno' });
    const code = f.state(host).code;
    await f.emit(guest, 'room:join', { name: 'Dos', code }); await f.emit(third, 'room:join', { name: 'Tres', code });
    await f.emit(host, 'room:words', { words: ['salteña', 'marraqueta', 'toborochi'] });
    await f.emit(host, 'room:settings', { rounds: 1, duration: 30, categories: ['Personalizadas'] });
    await f.emit(host, 'game:start'); await f.emit(host, 'game:choose', { word: 'salteña' });
    await f.wait(third, state => state.phase === 'drawing');
    assert.equal(f.state(third).hint, '_______');
    for (const count of [1, 2, 3]) {
      const guestState = await f.wait(guest, state => state.hint.replace(/_/g, '').length === count);
      const otherState = await f.wait(third, state => state.hint.replace(/_/g, '').length === count);
      assert.equal(guestState.hint, otherState.hint);
      assert.equal(guestState.word, undefined); assert.equal(otherState.word, undefined);
      assert.equal(f.state(host).word, 'salteña');
      if (count === 1) {
        const hint = guestState.hint;
        await f.emit(guest, 'chat:send', { text: 'salteña' });
        await f.wait(third, state => state.players.some(player => player.name === 'Dos' && player.guessed));
        assert.equal(f.state(third).hint, hint);
      }
    }
  } finally { await f.close(); }
});

test('acertar antes de la primera pista cancela las revelaciones pendientes', async () => {
  const f = await fixture({ choice: 30000, reveal: 1000, turn: 600 });
  try {
    const host = await f.connect(); const guest = await f.connect();
    let hints = 0; guest.on('word:hint', () => hints++);
    await f.emit(host, 'room:create', { name: 'Uno' });
    await f.emit(guest, 'room:join', { name: 'Dos', code: f.state(host).code });
    await f.emit(host, 'game:start'); await f.emit(host, 'game:choose', { word: f.state(host).choices![0] });
    await f.emit(guest, 'chat:send', { text: f.state(host).word });
    await f.wait(guest, state => state.phase === 'reveal');
    await new Promise(resolve => setTimeout(resolve, 650));
    assert.equal(hints, 0);
    assert.equal(f.state(guest).phase, 'reveal');
  } finally { await f.close(); }
});

test('cursor compartido: solo el dibujante puede moverlo, en su sala y sin guardar trazos', { timeout: 5000 }, async () => {
  const f = await fixture();
  try {
    const host = await f.connect(); const guest = await f.connect(); const outsider = await f.connect();
    const outsideEvents: unknown[] = []; outsider.on('board:cursor', event => outsideEvents.push(event));
    await f.emit(host, 'room:create', { name: 'Uno' });
    await f.emit(guest, 'room:join', { name: 'Dos', code: f.state(host).code });
    await f.emit(outsider, 'room:create', { name: 'Fuera' });
    const cursor = { point: { x: 240, y: 256 }, color: '#ef5350', size: 6, tool: 'brush', drawing: false };
    assert.equal((await f.emit(host, 'board:cursor', cursor)).ok, false);
    await f.emit(host, 'game:start'); await f.emit(host, 'game:choose', { word: f.state(host).choices![0] });
    assert.equal((await f.emit(guest, 'board:cursor', cursor)).ok, false);
    assert.equal((await f.emit(host, 'board:cursor', { ...cursor, point: { x: 9999, y: 20 } })).ok, false);
    assert.equal((await f.emit(host, 'board:cursor', { ...cursor, color: 'invalid' })).ok, false);
    const received = once(guest, 'board:cursor');
    assert.equal((await f.emit(host, 'board:cursor', { ...cursor, text: 'must not be relayed' })).ok, true);
    const [event] = await received;
    assert.deepEqual(event, { drawer: host.id, cursor });
    assert.equal(f.state(host).actions.length, 0);
    const hidden = once(guest, 'board:cursor');
    await f.emit(host, 'board:cursor', null);
    assert.deepEqual((await hidden)[0], { drawer: host.id, cursor: null });
    assert.deepEqual(outsideEvents, []);
  } finally { await f.close(); }
});

test('SQLite conserva catálogo y resultados al reabrir el archivo', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pinta-pues-'));
  const path = join(directory, 'game.sqlite');
  try {
    const store = new Store(path);
    assert.ok(store.words(['Bolivia']).includes('salteña'));
    store.saveResult('ABC123', [{ name: 'Vladi', score: 500 }]); store.close();
    const reopened = new Store(path);
    try {
      const result = reopened.db.prepare('SELECT scores FROM results').get() as { scores: string };
      assert.deepEqual(JSON.parse(result.scores), [{ name: 'Vladi', score: 500 }]);
      assert.equal(reopened.words(['Bolivia']).length, new Set(reopened.words(['Bolivia'])).size);
    } finally { reopened.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
