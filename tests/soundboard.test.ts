import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { io, type Socket } from 'socket.io-client';
import { createApp } from '../server/app.js';
import { SOUNDBOARD_CLIPS, type SoundboardEvent } from '../shared/soundboard.js';
import type { RoomView } from '../shared/types.js';

test('catálogo soundboard: identificadores únicos y archivos presentes', () => {
  assert.ok(SOUNDBOARD_CLIPS.length > 0);
  assert.equal(new Set(SOUNDBOARD_CLIPS.map(clip => clip.id)).size, SOUNDBOARD_CLIPS.length);
  for (const clip of SOUNDBOARD_CLIPS) assert.ok(existsSync(`public/audio/soundboard/${clip.file}`));
  for (const file of ['success.mp3', 'success-fanfare-trumpets.mp3', 'roblox-death-sound-effect.mp3', 'steve-old-hurt-sound-effect.mp3']) assert.ok(existsSync(`public/audio/game/${file}`));
});

test('soundboard: envíos seguidos sin espera, permisos, aislamiento y sin repetirse al reconectar', async () => {
  const app = createApp(':memory:'); app.http.listen(0, '127.0.0.1'); await once(app.http, 'listening');
  const url = `http://127.0.0.1:${(app.http.address() as { port: number }).port}`;
  const sockets: Socket[] = []; const states = new Map<Socket, RoomView>(); const heard = new Map<Socket, SoundboardEvent[]>();
  async function connect() {
    const socket = io(url, { transports: ['websocket'], forceNew: true }); sockets.push(socket); heard.set(socket, []);
    socket.on('room:state', state => states.set(socket, state)); socket.on('soundboard:play', event => heard.get(socket)!.push(event));
    await once(socket, 'connect'); return socket;
  }
  const emit = (socket: Socket, event: string, data: unknown = {}) => socket.timeout(2000).emitWithAck(event, data) as Promise<{ ok: boolean; error?: string }>;
  async function wait(predicate: () => boolean) {
    for (let i = 0; i < 400; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
    assert.fail('No llegó el evento esperado');
  }
  try {
    const host = await connect(); const guest = await connect(); const outsider = await connect();
    const id = SOUNDBOARD_CLIPS[0].id;
    assert.equal((await emit(host, 'soundboard:play', { id })).ok, false);
    await emit(host, 'room:create', { name: 'Host' }); const code = states.get(host)!.code;
    await emit(guest, 'room:join', { name: 'Amigo', code }); await emit(outsider, 'room:create', { name: 'Otra sala' });
    assert.equal((await emit(host, 'soundboard:play', { id: '../../archivo.mp3' })).ok, false);
    assert.equal((await emit(host, 'soundboard:play', { id, name: 'Falso' })).ok, true);
    await wait(() => heard.get(host)!.length === 1 && heard.get(guest)!.length === 1);
    assert.equal(heard.get(guest)![0].name, 'Host'); assert.equal(heard.get(guest)![0].code, code);
    assert.equal(heard.get(outsider)!.length, 0);
    assert.equal((await emit(guest, 'soundboard:play', { id })).ok, true);
    assert.equal((await emit(host, 'soundboard:play', { id })).ok, true);
    await wait(() => heard.get(host)!.length === 3 && heard.get(guest)!.length === 3);
    await emit(host, 'room:moderate', { target: guest.id, action: 'mute' });
    assert.match((await emit(guest, 'soundboard:play', { id })).error!, /silenció/);
    await emit(host, 'room:moderate', { target: guest.id, action: 'unmute' });
    const guestId = guest.id; guest.io.reconnection(false); guest.io.engine.close();
    await wait(() => states.get(host)!.players.some(player => player.id === guestId && !player.connected));
    assert.equal((await emit(host, 'soundboard:play', { id })).ok, true);
    await wait(() => heard.get(host)!.length === 4);
    const connected = once(guest, 'connect'); guest.connect(); await connected;
    assert.equal(guest.recovered, true);
    await emit(guest, 'chat:send', { text: 'De vuelta' });
    assert.equal(heard.get(guest)!.length, 3);
    assert.ok(states.get(host)!.players.every(player => player.score === 0));
  } finally { sockets.forEach(socket => socket.disconnect()); await app.close(); }
});
