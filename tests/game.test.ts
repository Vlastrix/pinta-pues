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

async function fixture(timing: { choice: number; reveal: number; turn?: number; reconnect?: number } = { choice: 30000, reveal: 30, turn: 30000 }) {
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

test('easter eggs: protocolo respeta silencio y frecuencia; tercera revancha cuenta partidas terminadas', async () => {
  const f = await fixture({ choice: 100, turn: 20, reveal: 5 });
  try {
    const host = await f.connect(); const guest = await f.connect();
    await f.emit(host, 'room:create', { name: 'Vanguard' });
    await f.emit(guest, 'room:join', { code: f.state(host).code, name: 'Piloto' });
    assert.equal((await f.emit(host, 'chat:send', { text: '/protocolo3' })).ok, true);
    await f.wait(guest, state => state.messages.some(message => message.text === 'BT-7274 · Protocolo 3: proteger a la tropa.'));
    assert.equal((await f.emit(host, 'chat:send', { text: '/protocolo3' })).ok, false);
    await f.emit(host, 'room:moderate', { target: guest.id, action: 'mute' });
    assert.equal((await f.emit(guest, 'chat:send', { text: '/protocolo3' })).ok, false);
    assert.ok(f.state(host).players.every(player => player.score === 0));
    await f.emit(host, 'room:settings', { rounds: 1, duration: 30, categories: ['Bolivia'] });
    for (let game = 0; game < 3; game++) {
      assert.equal((await f.emit(host, 'game:start')).ok, true);
      assert.ok(!f.state(host).messages.some(message => message.text.includes('¿No que era la última')));
      await f.wait(host, state => state.phase === 'finished');
    }
    assert.equal((await f.emit(host, 'game:start')).ok, true);
    await f.wait(guest, state => state.messages.some(message => message.text.includes('¿No que era la última')));
    assert.equal(f.state(host).messages.filter(message => message.text.includes('¿No que era la última')).length, 1);
  } finally { await f.close(); }
});

test('nuevos easter eggs: sincronizados, aislados, limitados y sin impedir aciertos', async t => {
  const f = await fixture();
  try {
    const host = await f.connect(); const guest = await f.connect(); const outsider = await f.connect();
    await f.emit(host, 'room:create', { name: 'Host' }); const code = f.state(host).code;
    await f.emit(guest, 'room:join', { name: 'Amigo', code });
    await f.emit(outsider, 'room:create', { name: 'Otra sala' });
    await f.emit(guest, 'chat:send', { text: 'Error de capa 8' });
    await f.wait(host, state => state.messages.some(message => message.text === 'Se detectó un problema entre la silla y la pantalla'));
    assert.ok(!f.state(outsider).messages.some(message => message.text.includes('Se detectó')));
    assert.equal((await f.emit(guest, 'chat:send', { text: '/momazos' })).ok, false);
    await f.emit(host, 'chat:send', { text: '/momazos' });
    await f.wait(guest, state => state.messages.some(message => message.text.startsWith('Momazos Diego · ')));
    assert.ok(!f.state(outsider).messages.some(message => message.text.startsWith('Momazos Diego')));
    await f.emit(host, 'room:moderate', { target: guest.id, action: 'mute' });
    await new Promise(resolve => setTimeout(resolve, 360));
    assert.equal((await f.emit(guest, 'chat:send', { text: '/momazos' })).ok, false);
    await f.emit(host, 'room:words', { words: ['error de capa 8', 'salteña', 'árbol'] });
    await f.emit(host, 'room:settings', { rounds: 1, duration: 100, categories: ['Personalizadas'] });
    t.mock.method(Math, 'random', () => 0);
    const flavor = once(guest, 'game:flavor');
    await f.emit(host, 'game:start');
    assert.equal((await flavor)[0], 'Compilando talento… no se encontraron dependencias');
    assert.equal(f.state(host).phase, 'choosing');
    await f.emit(host, 'game:choose', { word: 'error de capa 8' });
    await new Promise(resolve => setTimeout(resolve, 360));
    assert.equal((await f.emit(guest, 'chat:send', { text: 'error de capa 8' })).ok, true);
    assert.equal(f.state(guest).phase, 'reveal');
    assert.ok(f.state(guest).players.find(player => player.id === guest.id)!.score > 0);
  } finally { await f.close(); }
});

test('salas públicas: acceso automático, privacidad, permisos y partida en curso', async () => {
  const f = await fixture();
  try {
    const privateHost = await f.connect(); const host = await f.connect(); const guest = await f.connect(); const late = await f.connect();
    await f.emit(privateHost, 'room:create', { name: 'Privado' });
    const privateCode = f.state(privateHost).code;
    assert.equal(f.state(privateHost).visibility, 'private');
    assert.equal((await f.emit(host, 'room:quick-join', { name: 'Público' })).ok, true);
    const code = f.state(host).code;
    assert.notEqual(code, privateCode); assert.equal(f.state(host).visibility, 'public');
    await f.emit(guest, 'room:quick-join', { name: 'Invitado' });
    assert.equal(f.state(guest).code, code);
    assert.equal((await f.emit(guest, 'room:visibility', { visibility: 'private' })).ok, false);
    assert.equal((await f.emit(host, 'room:visibility', { visibility: 'secret' })).ok, false);
    await f.emit(host, 'game:start');
    await f.emit(host, 'game:choose', { word: f.state(host).choices![0] });
    const deadline = f.state(host).deadline;
    await f.emit(late, 'room:quick-join', { name: 'Recién llegado' });
    assert.equal(f.state(late).code, code); assert.equal(f.state(late).phase, 'drawing');
    assert.equal(f.state(late).word, undefined); assert.equal(f.state(late).choices, undefined);
    assert.equal(f.state(late).deadline, deadline); assert.equal(f.state(late).players.at(-1)!.score, 0);
    await f.emit(host, 'room:visibility', { visibility: 'private' });
    await f.wait(guest, state => state.visibility === 'private');
    assert.equal(f.state(guest).players.length, 3);
    const newcomer = await f.connect(); await f.emit(newcomer, 'room:quick-join', { name: 'Otro' });
    assert.notEqual(f.state(newcomer).code, code); assert.notEqual(f.state(newcomer).code, privateCode);
    await f.emit(newcomer, 'room:leave');
    await f.emit(newcomer, 'room:join', { name: 'Con enlace', code: privateCode });
    assert.equal(f.state(newcomer).code, privateCode);
  } finally { await f.close(); }
});

test('acceso público: omite apodos repetidos, expulsiones y salas llenas', async () => {
  const f = await fixture();
  try {
    const host = await f.connect(); await f.emit(host, 'room:quick-join', { name: 'Artista' });
    const code = f.state(host).code;
    const duplicate = await f.connect(); await f.emit(duplicate, 'room:quick-join', { name: 'Artista' });
    assert.notEqual(f.state(duplicate).code, code);
    await f.emit(duplicate, 'room:leave');
    const kicked = await f.connect(); await f.emit(kicked, 'room:quick-join', { name: 'Expulsado' });
    await f.emit(host, 'room:moderate', { target: kicked.id, action: 'kick' });
    await f.emit(kicked, 'room:quick-join', { name: 'Expulsado' });
    assert.notEqual(f.state(kicked).code, code);
    await f.emit(kicked, 'room:leave');
    for (let i = 0; i < 11; i++) {
      const guest = await f.connect(); await f.emit(guest, 'room:quick-join', { name: `Jugador${i}` });
      assert.equal(f.state(guest).code, code);
    }
    const overflow = await f.connect(); await f.emit(overflow, 'room:quick-join', { name: 'Sin cupo' });
    assert.notEqual(f.state(overflow).code, code);
    assert.equal(f.state(host).players.length, 12);
  } finally { await f.close(); }
});

test('red temporal: recupera anfitrión, puntos, turno, palabra y lienzo con el mismo reloj', async () => {
  const f = await fixture({ choice: 30000, reveal: 30, turn: 30000, reconnect: 2000 });
  try {
    const host = await f.connect(); const guest = await f.connect(); const third = await f.connect();
    await f.emit(host, 'room:create', { name: 'Pintor móvil' });
    const code = f.state(host).code;
    await f.emit(guest, 'room:join', { code, name: 'Adivinador móvil' });
    await f.emit(third, 'room:join', { code, name: 'Otro' });
    await f.emit(host, 'game:start');
    const word = f.state(host).choices![0]; await f.emit(host, 'game:choose', { word });
    await f.emit(host, 'board:action', { id: 'antes-de-suspender', tool: 'brush', color: '#7460bf', size: 6, points: [{ x: 20, y: 30 }] });
    await f.emit(guest, 'chat:send', { text: word });
    const score = f.state(guest).players.find(player => player.id === guest.id)!.score;
    const deadline = f.state(host).deadline;
    const hostId = host.id;
    host.io.reconnection(false); host.io.engine.close();
    await f.wait(third, state => state.players.some(player => player.id === hostId && player.connected === false));
    assert.equal(f.state(third).host, hostId); assert.equal(f.state(third).phase, 'drawing');
    const reconnected = once(host, 'connect'); host.connect(); await reconnected;
    assert.equal(host.recovered, true); assert.equal(host.id, hostId);
    await f.wait(host, state => state.players.some(player => player.id === hostId && player.connected));
    assert.equal(f.state(host).word, word); assert.equal(f.state(host).drawer, hostId);
    assert.equal(f.state(host).deadline, deadline); assert.equal(f.state(host).actions[0].id, 'antes-de-suspender');
    const guestId = guest.id;
    guest.io.reconnection(false); guest.io.engine.close();
    await f.wait(third, state => state.players.some(player => player.id === guestId && !player.connected));
    const guestBack = once(guest, 'connect'); guest.connect(); await guestBack;
    assert.equal(guest.recovered, true);
    await f.wait(guest, state => state.players.some(player => player.id === guestId && player.connected));
    assert.equal(f.state(guest).word, undefined);
    assert.equal(f.state(guest).players.find(player => player.id === guestId)!.score, score);
    assert.equal(f.state(guest).players.find(player => player.id === guestId)!.guessed, true);
    assert.equal(f.state(host).players.find(player => player.id === hostId)!.score, 100);
  } finally { await f.close(); }
});

test('reconexión vencida: libera el puesto y transfiere anfitrión; volver empieza con cero', async () => {
  const f = await fixture({ choice: 30000, reveal: 30, turn: 30000, reconnect: 60 });
  try {
    const host = await f.connect(); const guest = await f.connect();
    await f.emit(host, 'room:create', { name: 'Móvil' }); const code = f.state(host).code;
    await f.emit(guest, 'room:join', { code, name: 'Presente' });
    const oldId = host.id;
    host.io.reconnection(false); host.io.engine.close();
    await f.wait(guest, state => state.players.length === 1);
    assert.equal(f.state(guest).host, guest.id);
    assert.equal(f.app.game.membership.has(oldId!), false);
    const reconnected = once(host, 'connect'); host.connect(); await reconnected;
    assert.equal(host.recovered, false); assert.notEqual(host.id, oldId);
    await f.emit(host, 'room:join', { code, name: 'Móvil' });
    assert.equal(f.state(host).players.find(player => player.id === host.id)!.score, 0);
  } finally { await f.close(); }
});

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
    const stroke: DrawAction = { id: 'stroke-one', tool: 'brush', size: 200, color: '#292438', smooth: true, finished: true, points: [{ x: 100, y: 100 }, { x: 200, y: 200 }] };
    assert.equal((await f.emit(guest, 'board:action', stroke)).ok, false);
    assert.equal((await f.emit(host, 'board:action', { ...stroke, points: [{ x: -1, y: 100 }] })).ok, false);
    assert.equal((await f.emit(host, 'board:action', { ...stroke, size: 201 })).ok, false);
    for (const text of ['', '   ', undefined]) {
      const result = await f.emit(host, 'board:action', { ...stroke, tool: 'text', text });
      assert.equal(result.ok, false);
      assert.equal(result.error, 'Escribe una pista antes de tocar el lienzo.');
    }
    assert.equal((await f.emit(host, 'board:action', { ...stroke, tool: 'text', text: 'S A L T E N A' })).ok, false);
    assert.equal((await f.emit(host, 'board:action', stroke)).ok, true);
    await f.emit(host, 'board:action', { ...stroke, points: [{ x: 200, y: 200 }, { x: 220, y: 210 }] });
    await f.wait(guest, state => state.actions.length === 2);
    assert.equal(f.state(guest).actions[0].smooth, true);
    assert.equal(f.state(guest).actions[0].finished, true);
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

test('ingresos en curso: elección, dibujo y revelación sin filtrar respuestas ni alterar las rondas', async () => {
  const f = await fixture({ choice: 30000, reveal: 150, turn: 250 });
  try {
    const host = await f.connect(); const guest = await f.connect();
    const choosingJoin = await f.connect(); const drawingJoin = await f.connect(); const revealJoin = await f.connect();
    await f.emit(host, 'room:create', { name: 'Uno' }); const code = f.state(host).code;
    await f.emit(guest, 'room:join', { name: 'Dos', code });
    await f.emit(host, 'room:settings', { rounds: 2, duration: 30, categories: ['Bolivia'] });
    await f.emit(host, 'game:start');
    const choiceDeadline = f.state(host).deadline;
    assert.equal((await f.emit(choosingJoin, 'room:join', { name: 'Tres', code })).ok, true);
    assert.equal(f.state(choosingJoin).choices, undefined);
    assert.equal(f.state(choosingJoin).word, undefined);
    assert.equal(f.state(choosingJoin).deadline, choiceDeadline);
    const word = f.state(host).choices![0];
    await f.emit(host, 'game:choose', { word });
    const action = { id: 'before-join', tool: 'rectangle', color: '#292438', size: 6, points: [{ x: 20, y: 20 }, { x: 80, y: 80 }] };
    await f.emit(host, 'board:action', action);
    const deadline = f.state(host).deadline;
    assert.equal((await f.emit(drawingJoin, 'room:join', { name: 'Cuatro', code })).ok, true);
    const state = f.state(drawingJoin);
    assert.equal(state.drawer, host.id); assert.equal(state.round, 1); assert.equal(state.deadline, deadline);
    assert.equal(state.word, undefined); assert.equal(state.choices, undefined);
    assert.equal(state.hint, f.state(guest).hint);
    assert.deepEqual(state.actions, [action]);
    assert.equal(state.players.find(player => player.id === drawingJoin.id)!.score, 0);
    assert.equal(state.reportRequired, 3);
    assert.equal((await f.emit(drawingJoin, 'board:clear')).ok, false);
    assert.equal((await f.emit(drawingJoin, 'chat:send', { text: word })).ok, true);
    assert.ok(f.state(drawingJoin).players.find(player => player.id === drawingJoin.id)!.score > 0);
    await f.wait(host, state => state.phase === 'reveal');
    assert.equal((await f.emit(revealJoin, 'room:join', { name: 'Cinco', code })).ok, true);
    assert.equal(f.state(revealJoin).word, word);
    assert.equal(f.state(revealJoin).players.find(player => player.id === revealJoin.id)!.score, 0);
    const turns = [[guest, 1], [host, 2], [guest, 2], [choosingJoin, 2], [drawingJoin, 2], [revealJoin, 2]] as const;
    for (const [drawer, round] of turns) {
      const next = await f.wait(drawer, state => state.phase === 'choosing' && state.drawer === drawer.id);
      assert.equal(next.round, round);
      assert.equal(f.state(drawer === host ? guest : host).choices, undefined);
      assert.equal((await f.emit(drawer, 'game:choose', { word: next.choices![0] })).ok, true);
    }
    await f.wait(host, state => state.phase === 'finished');
    assert.equal(f.state(host).round, 2);
  } finally { await f.close(); }
});

test('ingreso en última ronda: adivina sin turno extra y dibuja en la revancha', async () => {
  const f = await fixture({ choice: 30000, reveal: 80, turn: 150 });
  try {
    const host = await f.connect(); const guest = await f.connect(); const late = await f.connect();
    await f.emit(host, 'room:create', { name: 'Uno' }); const code = f.state(host).code;
    await f.emit(guest, 'room:join', { name: 'Dos', code });
    await f.emit(host, 'room:settings', { rounds: 1, duration: 30, categories: ['Bolivia'] });
    await f.emit(host, 'game:start');
    await f.emit(late, 'room:join', { name: 'Tres', code });
    assert.ok(f.state(late).messages.some(message => message.text.includes('Podrá dibujar en la revancha')));
    for (const drawer of [host, guest]) {
      const state = await f.wait(drawer, state => state.phase === 'choosing' && state.drawer === drawer.id);
      await f.emit(drawer, 'game:choose', { word: state.choices![0] });
    }
    await f.wait(late, state => state.phase === 'finished');
    assert.equal(f.state(late).players.find(player => player.id === late.id)!.score, 0);
    await f.emit(host, 'game:start');
    for (const drawer of [host, guest, late]) {
      const state = await f.wait(drawer, state => state.phase === 'choosing' && state.drawer === drawer.id);
      assert.equal(state.round, 1);
      await f.emit(drawer, 'game:choose', { word: state.choices![0] });
    }
    await f.wait(host, state => state.phase === 'finished');
  } finally { await f.close(); }
});

test('palabras de sesión: revanchas, últimas opciones, variantes y reciclaje por categoría', async () => {
  const f = await fixture({ choice: 30000, reveal: 30, turn: 30 });
  try {
    const insert = f.app.store.db.prepare('INSERT INTO words(category, text) VALUES (?, ?)');
    for (const word of ['árbol', 'ARBOL', 'nube', 'gato', 'casa', 'sol']) insert.run('Sesión A', word);
    for (const word of ['luna', 'lago', 'flor']) insert.run('Sesión B', word);
    const host = await f.connect(); const guest = await f.connect();
    await f.emit(host, 'room:create', { name: 'Uno' });
    await f.emit(guest, 'room:join', { name: 'Dos', code: f.state(host).code });
    async function match(category: string, inspect: (choices: string[]) => void) {
      assert.equal((await f.emit(host, 'room:settings', { rounds: 1, duration: 30, categories: [category] })).ok, true);
      assert.equal((await f.emit(host, 'game:start')).ok, true);
      for (const drawer of [host, guest]) {
        const state = await f.wait(drawer, state => state.phase === 'choosing' && state.drawer === drawer.id);
        const choices = state.choices!;
        assert.equal(new Set(choices.map(normalize)).size, choices.length);
        inspect(choices);
        assert.equal((await f.emit(drawer, 'game:choose', { word: choices[0] })).ok, true);
      }
      await f.wait(host, state => state.phase === 'finished');
    }
    const seen = new Set<string>(); let turn = 0; let lastA = '';
    for (let game = 0; game < 3; game++) await match('Sesión A', choices => {
      if (turn < 5) {
        assert.equal(choices.length, Math.min(3, 5 - turn));
        assert.ok(choices.every(word => !seen.has(normalize(word))));
      } else {
        assert.equal(choices.length, 3);
        assert.ok(choices.every(word => normalize(word) !== lastA));
      }
      lastA = normalize(choices[0]); seen.add(lastA); turn++;
    });
    assert.equal(seen.size, 5);
    const seenB = new Set<string>(); let turnB = 0;
    for (let game = 0; game < 2; game++) await match('Sesión B', choices => {
      if (turnB < 3) {
        assert.equal(choices.length, 3 - turnB);
        assert.ok(choices.every(word => !seenB.has(normalize(word))));
      }
      seenB.add(normalize(choices[0])); turnB++;
    });
    await f.emit(host, 'room:settings', { rounds: 1, duration: 30, categories: ['Sesión A'] });
    await f.emit(host, 'game:start');
    assert.ok(f.state(host).choices!.every(word => normalize(word) !== lastA), 'Reciclar B conserva el historial de A.');
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
    assert.equal((await f.emit(late, 'room:join', { name: 'Tres', code })).ok, true);
    await f.emit(late, 'room:leave');
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
  const f = await fixture({ choice: 30000, reveal: 200, turn: 30000 });
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
    await f.wait(guest, state => state.phase === 'choosing' && state.drawer === guest.id);
    assert.equal(f.state(guest).reported, false);
    await f.wait(third, state => state.phase === 'choosing');
    assert.equal(f.state(third).reported, false);
  } finally { await f.close(); }
});

test('reportes: recalcula unanimidad al salir alguien y descarta los votos de quienes salen', async () => {
  for (const leavesReporter of [false, true]) {
    const f = await fixture({ choice: 30000, reveal: 200, turn: 30000 });
    try {
      const host = await f.connect(); const guest = await f.connect(); const third = await f.connect();
      await f.emit(host, 'room:create', { name: 'Uno' });
      const code = f.state(host).code;
      await f.emit(guest, 'room:join', { name: 'Dos', code });
      await f.emit(third, 'room:join', { name: 'Tres', code });
      await f.emit(host, 'game:start');
      await f.emit(host, 'game:choose', { word: f.state(host).choices![0] });
      await f.emit(guest, 'game:report');
      await f.emit(leavesReporter ? guest : third, 'room:leave');
      const state = await f.wait(host, state => state.players.length === 2);
      assert.equal(state.phase, leavesReporter ? 'drawing' : 'reveal');
      assert.equal(state.reportCount, leavesReporter ? 0 : 1);
      assert.ok(state.players.every(player => player.score === 0));
    } finally { await f.close(); }
  }
});

test('dos jugadores: un reporte pasa el turno y reportar el último termina la partida sin quitar puntos', async () => {
  const f = await fixture({ choice: 30000, reveal: 100, turn: 30000 });
  try {
    const host = await f.connect(); const guest = await f.connect();
    await f.emit(host, 'room:create', { name: 'Uno' });
    await f.emit(guest, 'room:join', { name: 'Dos', code: f.state(host).code });
    await f.emit(host, 'room:settings', { rounds: 1, duration: 30, categories: ['Bolivia'] });
    await f.emit(host, 'game:start');
    await f.emit(host, 'game:choose', { word: f.state(host).choices![0] });
    assert.equal((await f.emit(guest, 'game:report')).ok, true);
    assert.equal(f.state(guest).phase, 'reveal');
    await f.wait(guest, state => state.phase === 'choosing' && state.drawer === guest.id);
    await f.emit(guest, 'game:choose', { word: f.state(guest).choices![0] });
    assert.equal((await f.emit(host, 'game:report')).ok, true);
    assert.equal(f.state(host).phase, 'reveal');
    await f.wait(host, state => state.phase === 'finished');
    assert.ok(f.state(host).players.every(player => player.score === 0));
    const result = f.app.store.db.prepare('SELECT scores FROM results').get() as { scores: string };
    assert.ok(JSON.parse(result.scores).every((player: { score: number }) => player.score === 0));
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
    store.db.prepare('INSERT INTO users(id, email, password_hash) VALUES (?, ?, ?)').run('cuenta', 'vladi@example.com', 'hash');
    store.saveResult('ABC123', [{ name: 'Vladi', score: 500, userId: 'cuenta', badges: ['misunderstood'] }]); store.close();
    const reopened = new Store(path);
    try {
      const result = reopened.db.prepare('SELECT scores FROM results').get() as { scores: string };
      assert.deepEqual(JSON.parse(result.scores), [{ name: 'Vladi', score: 500 }]);
      assert.equal(reopened.leaderboard()[0].points, 500);
      assert.deepEqual(reopened.badges('cuenta'), ['misunderstood']);
      assert.equal(reopened.words(['Bolivia']).length, new Set(reopened.words(['Bolivia'])).size);
    } finally { reopened.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
