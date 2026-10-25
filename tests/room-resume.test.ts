import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { io, type Socket } from 'socket.io-client';
import { createApp } from '../server/app.js';
import type { RoomView } from '../shared/types.js';

async function fixture(reconnect = 2000) {
  const app = createApp(':memory:', { choice: 30000, turn: 30000, reveal: 1000, reconnect });
  app.http.listen(0, '127.0.0.1'); await once(app.http, 'listening');
  const url = `http://127.0.0.1:${(app.http.address() as { port: number }).port}`;
  const sockets: Socket[] = [], states = new Map<Socket, RoomView>();
  const tickets = new Map<Socket, { code: string; token: string }>();
  const failures = new Set<Socket>();
  const cookie = async () => (await fetch(`${url}/api/session`)).headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  async function register(identity: string) {
    const response = await fetch(`${url}/api/auth/register`, { method: 'POST', headers: { Cookie: identity, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'recarga@example.com', password: 'Clave-recarga-123' }) });
    assert.equal(response.status, 200);
    return `${identity}; ${response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')}`;
  }
  async function connect(identity: string, ticket?: { code: string; token: string }) {
    const socket = io(url, { autoConnect: false, transports: ['websocket'], forceNew: true, extraHeaders: { Cookie: identity }, auth: { roomSession: ticket } });
    sockets.push(socket); socket.on('room:state', state => states.set(socket, state));
    socket.on('room:session', value => tickets.set(socket, value)); socket.on('room:resume-failed', () => failures.add(socket));
    socket.connect(); await once(socket, 'connect'); return socket;
  }
  const emit = async (socket: Socket, event: string, data: unknown = {}) => socket.timeout(2000).emitWithAck(event, data) as Promise<{ ok: boolean; error?: string }>;
  async function wait(predicate: () => boolean) {
    const until = Date.now() + 3000;
    while (!predicate()) { if (Date.now() > until) throw Error('State timed out'); await new Promise(resolve => setTimeout(resolve, 5)); }
  }
  return { app, cookie, register, connect, emit, wait, tickets, failures, state: (socket: Socket) => states.get(socket)!, close: async () => { sockets.forEach(socket => socket.disconnect()); await app.close(); } };
}

test('recargar: transfiere anfitrión, pintor, puntos, votos y cola; credencial privada y rotada', async () => {
  const f = await fixture();
  try {
    const ownerCookie = await f.cookie(), guestCookie = await f.cookie(), otherCookie = await f.cookie();
    const host = await f.connect(ownerCookie), guest = await f.connect(guestCookie), other = await f.connect(otherCookie);
    await f.emit(host, 'room:create', { name: 'Pintor' }); const code = f.state(host).code;
    await f.emit(guest, 'room:join', { code, name: 'Adivinador' }); await f.emit(other, 'room:join', { code, name: 'Otro' });
    const hostTicket = f.tickets.get(host)!; assert.ok(hostTicket.token);
    assert.ok(!JSON.stringify(f.state(guest)).includes(hostTicket.token));
    await f.emit(host, 'game:start'); const word = f.state(host).choices![0]; await f.emit(host, 'game:choose', { word });
    await f.emit(host, 'board:action', { id: 'trazo', tool: 'brush', size: 6, color: '#292438', points: [{ x: 20, y: 20 }] });
    await f.emit(guest, 'chat:send', { text: word }); await f.emit(other, 'game:report');
    await f.wait(() => f.state(host).players.some(player => player.id === guest.id && player.guessed));
    const deadline = f.state(host).deadline, messages = f.state(host).messages.length;
    const oldHostId = host.id!, oldGuestId = guest.id!, oldOtherId = other.id!;
    // Claim while the old transport is still connected: no leave/reset race.
    const restoredHost = await f.connect(ownerCookie, hostTicket);
    await f.wait(() => Boolean(f.state(restoredHost)));
    assert.equal(f.state(restoredHost).host, restoredHost.id); assert.equal(f.state(restoredHost).drawer, restoredHost.id);
    assert.equal(f.state(restoredHost).deadline, deadline); assert.equal(f.state(restoredHost).word, word);
    assert.equal(f.state(restoredHost).actions[0].id, 'trazo'); assert.equal(f.state(restoredHost).messages.length, messages);
    assert.equal(f.state(restoredHost).players.length, 3); await f.wait(() => !host.connected);
    const rotated = f.tickets.get(restoredHost)!; assert.notEqual(rotated.token, hostTicket.token);
    const stolen = await f.connect(await f.cookie(), rotated); await f.wait(() => f.failures.has(stolen));
    const replayed = await f.connect(ownerCookie, hostTicket); await f.wait(() => f.failures.has(replayed));
    assert.equal((await f.emit(stolen, 'room:join', { code, name: 'Pintor' })).ok, false);
    guest.io.reconnection(false); guest.io.engine.close();
    await f.wait(() => f.state(restoredHost).players.some(player => player.id === oldGuestId && !player.connected));
    const restoredGuest = await f.connect(guestCookie, f.tickets.get(guest)); await f.wait(() => Boolean(f.state(restoredGuest)));
    const player = f.state(restoredGuest).players.find(player => player.id === restoredGuest.id)!;
    assert.equal(player.guessed, true); assert.equal(player.score, 60); assert.equal(f.state(restoredGuest).word, undefined);
    const restoredOther = await f.connect(otherCookie, f.tickets.get(other)); await f.wait(() => Boolean(f.state(restoredOther)));
    assert.equal(f.state(restoredOther).reported, true); assert.equal(f.state(restoredOther).reportCount, 1);
    const room = f.app.game.rooms.get(code)!;
    for (const id of [oldHostId, oldGuestId, oldOtherId]) {
      assert.equal(f.app.game.membership.has(id), false); assert.ok(!room.queue.some(entry => entry.id === id));
      assert.equal(room.turnGuessers.has(id), false); assert.equal(room.badgeStats.has(id), false);
    }
    assert.equal(room.turnGuessers.size, 2); assert.equal(room.deadline, deadline);
  } finally { await f.close(); }
});

test('credencial de recarga: salir, expulsión y vencimiento invalidan el regreso', async () => {
  const f = await fixture(60);
  try {
    const ownerCookie = await f.cookie(), guestCookie = await f.cookie();
    const host = await f.connect(ownerCookie), guest = await f.connect(guestCookie);
    await f.emit(host, 'room:create', { name: 'Host' }); const code = f.state(host).code;
    await f.emit(guest, 'room:join', { code, name: 'Amigo' }); const exitedTicket = f.tickets.get(guest)!;
    await f.emit(guest, 'room:leave');
    const exited = await f.connect(guestCookie, exitedTicket); await f.wait(() => f.failures.has(exited));
    await f.emit(guest, 'room:join', { code, name: 'Amigo' }); const expiredTicket = f.tickets.get(guest)!;
    await f.wait(() => f.state(host).players.length === 2);
    guest.io.reconnection(false); guest.io.engine.close();
    await f.wait(() => f.state(host).players.length === 1);
    const expired = await f.connect(guestCookie, expiredTicket); await f.wait(() => f.failures.has(expired));
    await f.emit(expired, 'room:join', { code, name: 'Amigo' }); const kickedTicket = f.tickets.get(expired)!;
    await f.emit(host, 'room:moderate', { target: expired.id, action: 'kick' });
    const kicked = await f.connect(guestCookie, kickedTicket); await f.wait(() => f.failures.has(kicked));
    assert.equal((await f.emit(kicked, 'room:join', { code, name: 'Otro nombre' })).ok, false);
  } finally { await f.close(); }
});

test('recarga con cuenta: conserva identidad y rechaza el mismo navegador sin esa sesión', async () => {
  const f = await fixture();
  try {
    const browserCookie = await f.cookie(), accountCookie = await f.register(browserCookie);
    const host = await f.connect(accountCookie);
    await f.emit(host, 'room:create', { name: 'Registrado' }); const code = f.state(host).code;
    const ticket = f.tickets.get(host)!;
    const unauthenticated = await f.connect(browserCookie, ticket); await f.wait(() => f.failures.has(unauthenticated));
    const otherBrowser = `${await f.cookie()}; ${accountCookie.split('; ').find(part => part.startsWith('pp_session='))}`;
    const copied = await f.connect(otherBrowser, ticket); await f.wait(() => f.failures.has(copied));
    const restored = await f.connect(accountCookie, ticket); await f.wait(() => Boolean(f.state(restored)));
    assert.equal(f.state(restored).code, code);
    assert.equal(f.state(restored).players[0].registered, true);
    assert.equal(f.state(restored).players[0].name, 'Registrado');
  } finally { await f.close(); }
});
