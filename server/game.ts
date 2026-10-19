import { randomBytes, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { tools, WIDTH, HEIGHT, DEFAULT_AVATAR, AVATAR_PATTERN, MAX_DRAW_ACTIONS, type DrawAction, type Message, type Player, type RoomView, type Settings } from '../shared/types.js';
import { Store, normalize } from './store.js';
import { hintSteps, maskWord } from './hints.js';
import { WindowLimiter } from './security.js';

type Room = {
  code: string; host: string; players: Player[]; phase: RoomView['phase']; settings: Settings;
  round: number; drawer: string | null; deadline: number; word: string; choices: string[];
  actions: DrawAction[]; messages: Message[]; customWords: string[]; used: Set<string>;
  queue: string[]; turn: number; timer?: ReturnType<typeof setTimeout>; pointCount: number;
  reporters: Set<string>; lastReportAt: number; penaltyPlayed: boolean;
  hint: string; hintTimer?: ReturnType<typeof setTimeout>;
  banned: Set<string>;
};
const nameSchema = z.string().trim().min(2, 'Tu apodo necesita al menos 2 letras.').max(20);
const avatarSchema = z.string().regex(AVATAR_PATTERN, 'Elige un avatar válido.').default(DEFAULT_AVATAR);
const pointSchema = z.object({ x: z.number().min(0).max(WIDTH), y: z.number().min(0).max(HEIGHT) });
const cursorSchema = z.object({
  point: pointSchema, color: z.string().regex(/^#[0-9a-f]{6}$/i),
  size: z.number().min(1).max(48), tool: z.enum(tools), drawing: z.boolean(),
}).nullable();
const actionSchema = z.object({
  id: z.string().min(1).max(64), tool: z.enum(tools), color: z.string().regex(/^#[0-9a-f]{6}$/i),
  segment: z.number().int().min(0).max(MAX_DRAW_ACTIONS).optional(),
  size: z.number().min(1).max(48), points: z.array(pointSchema).min(1).max(256),
  text: z.string().trim().max(50).optional(),
});
const settingsSchema = z.object({
  rounds: z.number().int().min(1).max(5), duration: z.number().int().min(30).max(180),
  categories: z.array(z.string().max(30)).min(1).max(5),
});

export class Game {
  rooms = new Map<string, Room>();
  membership = new Map<string, string>();
  private activity = new WindowLimiter();
  constructor(private io: Server, private store: Store, private timing: { choice: number; reveal: number; turn?: number } = { choice: 15000, reveal: 5000 }) {
    io.on('connection', socket => this.connect(socket));
  }
  private system(room: Room, text: string, kind: Message['kind'] = 'system') {
    room.messages.push({ id: randomUUID(), name: 'Pinta Pues', text, kind });
    room.messages = room.messages.slice(-80);
  }
  private view(room: Room, id: string): RoomView {
    const secret = room.phase === 'reveal' || room.phase === 'finished' || room.drawer === id;
    return {
      code: room.code, you: id, host: room.host, players: room.players, phase: room.phase,
      settings: room.settings, round: room.round, drawer: room.drawer, deadline: room.deadline,
      serverTime: Date.now(), hint: room.hint,
      ...(secret && room.word ? { word: room.word } : {}),
      ...(room.drawer === id && room.phase === 'choosing' ? { choices: room.choices } : {}),
      actions: room.actions, messages: room.messages, availableCategories: [...this.store.categories(), 'Personalizadas'],
      customWordCount: room.customWords.length,
      reported: room.reporters.has(id),
      reportCount: room.reporters.size, reportRequired: room.players.filter(player => player.id !== room.drawer).length,
    };
  }
  private broadcast(room: Room) {
    for (const player of room.players) this.io.to(player.id).emit('room:state', this.view(room, player.id));
  }
  private schedule(room: Room, delay: number, callback: () => void) {
    this.clearTimers(room);
    room.deadline = Date.now() + delay;
    room.timer = setTimeout(callback, delay);
  }
  private clearTimers(room: Room) {
    clearTimeout(room.timer); clearTimeout(room.hintTimer);
  }
  private scheduleHints(room: Room, duration: number) {
    const steps = hintSteps(room.word);
    const startedAt = room.deadline - duration;
    const nextHint = (index: number) => {
      const step = steps[index];
      if (!step) return;
      room.hintTimer = setTimeout(() => {
        if (room.phase !== 'drawing' || Date.now() >= room.deadline) return;
        room.hint = step.hint;
        this.io.to(room.code).emit('word:hint', room.hint);
        nextHint(index + 1);
      }, Math.max(0, startedAt + duration * step.progress - Date.now()));
    };
    nextHint(0);
  }
  private next(room: Room) {
    this.clearTimers(room);
    if (room.players.length < 2) { this.reset(room); return; }
    let next: string | undefined;
    while (room.turn < room.queue.length) {
      next = room.queue[room.turn++];
      if (room.players.some(player => player.id === next)) break;
      next = undefined;
    }
    if (!next) {
      room.phase = 'finished'; room.deadline = 0; room.drawer = null;
      this.store.saveResult(room.code, room.players.map(({ name, score }) => ({ name, score })));
      this.system(room, '¡Se acabó, pues! ¿Sale la revancha?');
      this.broadcast(room); return;
    }
    room.round = Math.floor((room.turn - 1) / (room.queue.length / room.settings.rounds)) + 1;
    room.drawer = next; room.phase = 'choosing'; room.word = ''; room.actions = []; room.pointCount = 0;
    room.hint = '';
    room.reporters.clear(); room.lastReportAt = 0; room.penaltyPlayed = false;
    room.players.forEach(player => { player.guessed = false; });
    const allWords = [...this.store.words(room.settings.categories), ...(room.settings.categories.includes('Personalizadas') ? room.customWords : [])];
    let pool = [...new Set(allWords)].filter(word => !room.used.has(normalize(word)));
    if (pool.length < 3) { room.used.clear(); pool = [...new Set(allWords)]; }
    // Fisher–Yates rather than a biased random sort.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    room.choices = pool.slice(0, 3);
    this.schedule(room, this.timing.choice, () => this.choose(room, room.choices[0]));
    this.broadcast(room);
  }
  private choose(room: Room, word: string) {
    room.word = word; room.used.add(normalize(word)); room.choices = []; room.phase = 'drawing';
    room.hint = maskWord(word);
    const duration = this.timing.turn ?? room.settings.duration * 1000;
    this.schedule(room, duration, () => this.reveal(room));
    this.scheduleHints(room, duration);
    this.system(room, `Le toca dibujar a ${room.players.find(player => player.id === room.drawer)?.name}.`);
    this.broadcast(room);
  }
  private reveal(room: Room) {
    if (room.phase !== 'drawing') return;
    room.phase = 'reveal';
    this.system(room, `La palabra era «${room.word}».`);
    this.schedule(room, this.timing.reveal, () => this.next(room));
    this.broadcast(room);
  }
  private reset(room: Room) {
    this.clearTimers(room); room.phase = 'lobby'; room.drawer = null; room.deadline = 0;
    room.word = ''; room.choices = []; room.actions = []; room.pointCount = 0; room.round = 0;
    room.hint = '';
    room.players.forEach(player => { player.guessed = false; });
    this.system(room, 'Esperando al menos dos jugadores para empezar.'); this.broadcast(room);
  }
  private leave(socket: Socket) {
    const room = this.rooms.get(this.membership.get(socket.id) ?? '');
    if (!room) return;
    this.membership.delete(socket.id); socket.leave(room.code);
    const player = room.players.find(player => player.id === socket.id)!;
    room.players = room.players.filter(player => player.id !== socket.id);
    room.reporters.delete(socket.id);
    if (!room.players.length) { this.clearTimers(room); this.rooms.delete(room.code); return; }
    if (room.host === socket.id) room.host = room.players[0].id;
    this.system(room, `${player.name} salió de la sala.`);
    if (room.players.length < 2 && !['lobby', 'finished'].includes(room.phase)) this.reset(room);
    else if (room.drawer === socket.id && ['drawing', 'choosing'].includes(room.phase)) {
      this.system(room, 'El dibujante salió. Pasamos al siguiente turno.'); this.next(room);
    } else if (room.phase === 'drawing' && room.players.filter(p => p.id !== room.drawer).every(p => p.guessed)) this.reveal(room);
    else this.broadcast(room);
  }
  private connect(socket: Socket) {
    let windowStart = Date.now(); let events = 0; let lastChat = 0;
    const handle = <T>(event: string, schema: z.ZodType<T>, callback: (data: T, room?: Room) => void, needsRoom = true) => {
      socket.on(event, (raw: unknown, ack: unknown) => {
        try {
          const now = Date.now();
          if (now - windowStart > 1000) { windowStart = now; events = 0; }
          if (++events > 100) {
            if (events > 200) socket.disconnect(true);
            throw new Error('Un poquito más despacio, pues.');
          }
          const parsed = schema.safeParse(raw);
          if (!parsed.success) throw new Error(parsed.error.issues[0].message);
          const room = this.rooms.get(this.membership.get(socket.id) ?? '');
          if (needsRoom && !room) throw new Error('Primero entra a una sala.');
          callback(parsed.data, room);
          if (typeof ack === 'function') ack({ ok: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'No se pudo completar la acción.';
          if (typeof ack === 'function') ack({ ok: false, error: message });
        }
      });
    };
    handle('room:create', z.object({ name: nameSchema, avatar: avatarSchema }), ({ name, avatar }) => {
      if (this.membership.has(socket.id)) throw new Error('Ya estás en una sala.');
      if (this.rooms.size >= 200) throw new Error('El servidor está lleno. Prueba en un rato.');
      if (!this.activity.allow(`create:${socket.data.ip}`, 10, 60000)) throw new Error('Demasiadas salas creadas. Espera un minuto.');
      let code: string;
      do { code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase(); } while (this.rooms.has(code));
      const room: Room = {
        code, host: socket.id, players: [{ id: socket.id, name, avatar, score: 0, guessed: false, muted: false, registered: Boolean(socket.data.userId) }],
        phase: 'lobby', settings: { rounds: 3, duration: 100, categories: ['Bolivia', 'Cotidianas'] },
        round: 0, drawer: null, deadline: 0, word: '', choices: [], actions: [], messages: [],
        customWords: [], used: new Set(), queue: [], turn: 0, pointCount: 0,
        reporters: new Set(), lastReportAt: 0, penaltyPlayed: false,
        hint: '',
        banned: new Set(),
      };
      this.rooms.set(code, room); this.membership.set(socket.id, code); socket.join(code);
      this.system(room, `${name} creó la sala. ¡Que entre la tropa!`); this.broadcast(room);
    }, false);
    handle('room:join', z.object({ name: nameSchema, avatar: avatarSchema, code: z.string().trim().toUpperCase().regex(/^[A-F0-9]{6}$/) }), ({ name, avatar, code }) => {
      if (this.membership.has(socket.id)) throw new Error('Ya estás en una sala.');
      if (!this.activity.allow(`join:${socket.data.ip}`, 30, 60000)) throw new Error('Demasiados intentos de entrar. Espera un minuto.');
      const room = this.rooms.get(code);
      if (!room) throw new Error('Esa sala no existe o ya se cerró.');
      if ((socket.data.identities as string[]).some(id => room.banned.has(id))) throw new Error('Fuiste expulsado de esta sala.');
      if (socket.data.userId && room.players.some(player => this.io.sockets.sockets.get(player.id)?.data.userId === socket.data.userId)) throw new Error('Tu cuenta ya está en esta sala.');
      if (room.players.length >= 12) throw new Error('La sala está llena (12 jugadores).');
      if (!['lobby', 'finished'].includes(room.phase)) throw new Error('La partida ya empezó. Entra cuando termine.');
      if (room.players.some(player => normalize(player.name) === normalize(name))) throw new Error('Ese apodo ya está en la sala.');
      room.players.push({ id: socket.id, name, avatar, score: 0, guessed: false, muted: false, registered: Boolean(socket.data.userId) });
      this.membership.set(socket.id, code); socket.join(code);
      this.system(room, `${name} llegó. ¡Ahora sí!`); this.broadcast(room);
    }, false);
    handle('room:leave', z.object({}), () => { this.leave(socket); socket.emit('room:left'); });
    handle('room:moderate', z.object({ target: z.string().min(1).max(100), action: z.enum(['kick', 'mute', 'unmute']) }), ({ target, action }, room) => {
      this.requireHost(socket, room!);
      if (target === socket.id) throw new Error('No puedes moderarte a vos mismo.');
      const player = room!.players.find(player => player.id === target);
      if (!player) throw new Error('Ese jugador ya no está en la sala.');
      const targetSocket = this.io.sockets.sockets.get(target);
      if (!targetSocket) throw new Error('Ese jugador ya no está conectado.');
      this.store.logModeration(room!.code, socket.data.identities[0], targetSocket.data.identities[0], action);
      if (action === 'kick') {
        for (const id of targetSocket.data.identities as string[]) room!.banned.add(id);
        // Remove public messages by this name before the remaining members receive a new snapshot.
        room!.messages = room!.messages.filter(message => message.kind !== 'chat' || message.name !== player.name);
        this.system(room!, `${player.name} fue expulsado por el anfitrión.`);
        this.leave(targetSocket);
        targetSocket.emit('room:kicked', { reason: 'El anfitrión te expulsó de la sala.' });
      } else {
        player.muted = action === 'mute';
        this.system(room!, player.muted ? `El anfitrión silenció el chat de ${player.name}.` : `${player.name} puede volver a chatear.`);
        this.broadcast(room!);
      }
    });
    handle('chat:delete', z.object({ id: z.string().max(100) }), ({ id }, room) => {
      this.requireHost(socket, room!);
      const message = room!.messages.find(message => message.id === id && message.kind === 'chat');
      if (!message) throw new Error('Ese mensaje ya no está disponible.');
      room!.messages = room!.messages.filter(message => message.id !== id);
      this.store.logModeration(room!.code, socket.data.identities[0], message.name, 'delete-message');
      this.broadcast(room!);
    });
    handle('room:settings', settingsSchema, (settings, room) => {
      this.requireHost(socket, room!);
      if (!['lobby', 'finished'].includes(room!.phase)) throw new Error('Cambia las reglas entre partidas.');
      if (settings.categories.some(category => ![...this.store.categories(), 'Personalizadas'].includes(category))) throw new Error('Categoría desconocida.');
      room!.settings = settings; this.broadcast(room!);
    });
    handle('room:words', z.object({ words: z.array(z.string().trim().min(2).max(40)).min(1).max(100) }), ({ words }, room) => {
      this.requireHost(socket, room!);
      if (!['lobby', 'finished'].includes(room!.phase)) throw new Error('Agrega palabras entre partidas.');
      if (words.some(word => !normalize(word))) throw new Error('Las palabras necesitan letras o números.');
      const unique = new Map([...room!.customWords, ...words].map(word => [normalize(word), word]));
      if (unique.size > 200) throw new Error('Máximo 200 palabras personalizadas por sala.');
      room!.customWords = [...unique.values()];
      room!.settings.categories = [...new Set([...room!.settings.categories, 'Personalizadas'])];
      this.system(room!, 'Se actualizaron las palabras de la tropa.'); this.broadcast(room!);
    });
    handle('game:start', z.object({}), (_, room) => {
      this.requireHost(socket, room!);
      if (!['lobby', 'finished'].includes(room!.phase)) throw new Error('La partida ya está en curso.');
      if (room!.players.length < 2) throw new Error('Necesitamos al menos dos jugadores.');
      const words = [...this.store.words(room!.settings.categories), ...(room!.settings.categories.includes('Personalizadas') ? room!.customWords : [])];
      if (new Set(words.map(normalize)).size < 3) throw new Error('Elige categorías con al menos tres palabras.');
      room!.players.forEach(player => { player.score = 0; player.guessed = false; });
      room!.queue = Array.from({ length: room!.settings.rounds }, () => room!.players.map(player => player.id)).flat();
      room!.turn = 0; room!.used.clear(); this.next(room!);
    });
    handle('game:choose', z.object({ word: z.string().max(40) }), ({ word }, room) => {
      if (room!.drawer !== socket.id || room!.phase !== 'choosing' || !room!.choices.includes(word)) throw new Error('No puedes elegir esa palabra.');
      this.choose(room!, word);
    });
    handle('chat:send', z.object({ text: z.string().trim().min(1).max(200) }), ({ text }, room) => {
      if (Date.now() - lastChat < 350) throw new Error('Dale un respiro al chat.');
      lastChat = Date.now();
      const player = room!.players.find(player => player.id === socket.id)!;
      if (player.muted && !(room!.phase === 'drawing' && socket.id !== room!.drawer && !player.guessed && normalize(text) === normalize(room!.word))) throw new Error('Tu chat está silenciado. Solo puedes enviar la respuesta correcta.');
      if (room!.phase === 'drawing') {
        if (Date.now() >= room!.deadline) throw new Error('El tiempo para adivinar terminó.');
        if (room!.drawer === socket.id || player.guessed) throw new Error('Espera al siguiente turno para chatear.');
        if (normalize(text) === normalize(room!.word)) {
          player.guessed = true;
          const remaining = Math.max(0, room!.deadline - Date.now()) / (room!.settings.duration * 1000);
          player.score += 100 + Math.round(remaining * 400);
          const drawer = room!.players.find(p => p.id === room!.drawer);
          if (drawer) drawer.score += 100;
          this.system(room!, `¡${player.name} adivinó!`, 'correct');
          if (room!.players.filter(p => p.id !== room!.drawer).every(p => p.guessed)) { this.reveal(room!); return; }
        } else {
          if (normalize(text).includes(normalize(room!.word))) throw new Error('Escribe solamente la respuesta.');
          room!.messages.push({ id: randomUUID(), name: player.name, text, kind: 'chat' });
        }
      } else room!.messages.push({ id: randomUUID(), name: player.name, text, kind: 'chat' });
      room!.messages = room!.messages.slice(-80); this.broadcast(room!);
    });
    handle('game:report', z.object({}), (_, room) => {
      if (room!.phase !== 'drawing' || Date.now() >= room!.deadline) throw new Error('Solo puedes reportar al pintor durante el dibujo.');
      if (room!.drawer === socket.id) throw new Error('No puedes reportarte a vos mismo.');
      if (room!.reporters.has(socket.id)) throw new Error('Ya reportaste al pintor en este turno.');
      if (Date.now() - room!.lastReportAt < 3000) throw new Error('Espera un ratito antes de otro reporte.');
      room!.reporters.add(socket.id); room!.lastReportAt = Date.now();
      const player = room!.players.find(player => player.id === socket.id)!;
      this.system(room!, `${player.name} reportó al pintor.`);
      this.io.to(room!.code).emit('sound:play', 'report');
      if (!room!.penaltyPlayed && room!.players.filter(player => player.id !== room!.drawer).every(player => room!.reporters.has(player.id))) {
        room!.penaltyPlayed = true;
        const drawer = room!.players.find(player => player.id === room!.drawer)!;
        this.store.logModeration(room!.code, 'unanimous-vote', this.io.sockets.sockets.get(drawer.id)?.data.identities[0] ?? drawer.id, 'report-unanimous');
        this.system(room!, 'Todos reportaron al pintor. ¡Oof!');
        this.io.to(room!.code).emit('sound:play', 'penalty');
      }
      this.broadcast(room!);
    });
    handle('board:cursor', cursorSchema, (cursor, room) => {
      this.requireDrawer(socket, room!);
      const target = socket.to(room!.code);
      const update = { drawer: socket.id, cursor };
      // Position is disposable; hiding the cursor must arrive even on a busy connection.
      if (cursor) target.volatile.emit('board:cursor', update);
      else target.emit('board:cursor', update);
    });
    handle('board:action', actionSchema, (action, room) => {
      this.requireDrawer(socket, room!);
      if (action.tool === 'text' && !action.text) throw new Error('Escribe una pista antes de tocar el lienzo.');
      if (action.tool === 'text' && normalize(action.text!).includes(normalize(room!.word))) {
        throw new Error('¡No escribas la respuesta en el dibujo, pues!');
      }
      if (room!.actions.length >= MAX_DRAW_ACTIONS || room!.pointCount + action.points.length > 60000) throw new Error('Lienzo lleno. Deshaz o limpia para seguir.');
      room!.actions.push(action); room!.pointCount += action.points.length;
      this.io.to(room!.code).emit('board:action', action);
    });
    handle('board:undo', z.object({}), (_, room) => {
      this.requireDrawer(socket, room!);
      const last = room!.actions.at(-1)?.id;
      room!.actions = room!.actions.filter(action => action.id !== last);
      room!.pointCount = room!.actions.reduce((count, action) => count + action.points.length, 0);
      this.broadcast(room!);
    });
    handle('board:clear', z.object({}), (_, room) => {
      this.requireDrawer(socket, room!); room!.actions = []; room!.pointCount = 0; this.broadcast(room!);
    });
    socket.on('disconnect', () => this.leave(socket));
  }
  private requireHost(socket: Socket, room: Room) {
    if (room.host !== socket.id) throw new Error('Solo el anfitrión puede hacer eso.');
  }
  private requireDrawer(socket: Socket, room: Room) {
    if (room.drawer !== socket.id || room.phase !== 'drawing' || Date.now() >= room.deadline) throw new Error('Todavía no es tu turno para dibujar.');
  }
  close() { for (const room of this.rooms.values()) this.clearTimers(room); }
}
