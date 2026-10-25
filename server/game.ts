import { randomBytes, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { tools, WIDTH, HEIGHT, DEFAULT_AVATAR, AVATAR_PATTERN, MAX_DRAW_ACTIONS, MAX_BRUSH_SIZE, RECONNECT_GRACE_MS, type DrawAction, type Message, type Player, type RoomView, type Settings } from '../shared/types.js';
import { Store, normalize } from './store.js';
import { hintSteps, maskWord } from './hints.js';
import { WindowLimiter } from './security.js';
import type { BadgeId } from '../shared/badges.js';
import { chatEasterEgg, creatorPrank, startEasterEgg } from './easterEggs.js';
import { SOUNDBOARD_CLIPS, type SoundboardEvent } from '../shared/soundboard.js';
import { finalGuessWindow, firstGuessPoints, followingGuessPoints, painterPoints } from './scoring.js';

type BadgeStats = { guesses: number; opportunities: number; roundGuesses: number; roundOpportunities: number; fullRound: boolean; silentRound: boolean; misunderstood: boolean };

type Room = {
  code: string; host: string; players: Player[]; phase: RoomView['phase']; settings: Settings;
  round: number; drawer: string | null; deadline: number; word: string; choices: string[];
  actions: DrawAction[]; messages: Message[]; customWords: string[]; used: Set<string>;
  queue: { id: string; round: number }[]; turn: number; timer?: ReturnType<typeof setTimeout>; pointCount: number;
  reporters: Set<string>; lastReportAt: number; penaltyPlayed: boolean;
  hint: string; hintTimer?: ReturnType<typeof setTimeout>;
  banned: Set<string>; completedGames: number; visibility: RoomView['visibility'];
  badgeStats: Map<string, BadgeStats>; turnGuesses: number;
  turnDuration: number; finalWindow: number; turnGuessers: Set<string>; duel: boolean;
  hintPlan: ReturnType<typeof hintSteps>; hintIndex: number;
};
const nameSchema = z.string().trim().min(2, 'Tu apodo necesita al menos 2 letras.').max(20);
const avatarSchema = z.string().regex(AVATAR_PATTERN, 'Elige un avatar válido.').default(DEFAULT_AVATAR);
const pointSchema = z.object({ x: z.number().min(0).max(WIDTH), y: z.number().min(0).max(HEIGHT) });
const cursorSchema = z.object({
  point: pointSchema, color: z.string().regex(/^#[0-9a-f]{6}$/i),
  size: z.number().min(1).max(MAX_BRUSH_SIZE), tool: z.enum(tools), drawing: z.boolean(),
}).nullable();
const actionSchema = z.object({
  id: z.string().min(1).max(64), tool: z.enum(tools), color: z.string().regex(/^#[0-9a-f]{6}$/i),
  segment: z.number().int().min(0).max(MAX_DRAW_ACTIONS).optional(),
  smooth: z.boolean().optional(), finished: z.boolean().optional(),
  size: z.number().min(1).max(MAX_BRUSH_SIZE), points: z.array(pointSchema).min(1).max(256),
  text: z.string().trim().max(50).optional(),
});
const settingsSchema = z.object({
  rounds: z.number().int().min(1).max(5), duration: z.number().int().min(30).max(180),
  categories: z.array(z.string().max(30)).min(1).max(30),
});

export class Game {
  rooms = new Map<string, Room>();
  membership = new Map<string, string>();
  private activity = new WindowLimiter();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private disconnectedSockets = new Map<string, Socket>();
  private resumeTokens = new Map<string, string>();
  private closing = false;
  constructor(private io: Server, private store: Store, private timing: { choice: number; reveal: number; turn?: number; reconnect?: number } = { choice: 15000, reveal: 5000 }) {
    io.on('connection', socket => this.connect(socket));
  }
  private system(room: Room, text: string, kind: Message['kind'] = 'system') {
    room.messages.push({ id: randomUUID(), name: 'Pinta Pues', text, kind });
    room.messages = room.messages.slice(-80);
  }
  private view(room: Room, id: string): RoomView {
    const secret = room.phase === 'reveal' || room.phase === 'finished' || room.drawer === id;
    return {
      code: room.code, you: id, host: room.host, players: room.players.map(player => ({ ...player, connected: this.io.sockets.sockets.has(player.id) })), phase: room.phase, visibility: room.visibility,
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
    const steps = room.hintPlan;
    const previousProgress = room.hintIndex ? steps[room.hintIndex - 1].progress : 0;
    const startedAt = room.deadline - duration;
    const nextHint = (index: number) => {
      const step = steps[index];
      if (!step) return;
      room.hintTimer = setTimeout(() => {
        if (room.phase !== 'drawing' || Date.now() >= room.deadline) return;
        room.hint = step.hint;
        room.hintIndex = index + 1;
        this.io.to(room.code).emit('word:hint', room.hint);
        nextHint(index + 1);
      }, Math.max(0, startedAt + duration * (step.progress - previousProgress) / (1 - previousProgress) - Date.now()));
    };
    nextHint(room.hintIndex);
  }
  private next(room: Room) {
    this.clearTimers(room);
    const previousWord = normalize(room.word);
    if (room.players.length < 2) { this.reset(room); return; }
    let next: Room['queue'][number] | undefined;
    while (room.turn < room.queue.length) {
      const candidate = room.queue[room.turn++];
      if (room.players.some(player => player.id === candidate.id)) { next = candidate; break; }
    }
    if (!next) {
      this.finishBadgeRound(room);
      room.phase = 'finished'; room.deadline = 0; room.drawer = null;
      room.completedGames++;
      this.store.saveResult(room.code, room.players.map(player => ({ name: player.name, score: player.score, avatar: player.avatar,
        userId: this.playerSocket(player.id)?.data.userId, badges: this.earnedBadges(room, player) })));
      for (const player of room.players) player.badges = this.store.badges(this.playerSocket(player.id)?.data.userId);
      this.system(room, '¡Se acabó, pues! ¿Sale la revancha?');
      this.broadcast(room); return;
    }
    if (room.round > 0 && room.round !== next.round) this.finishBadgeRound(room);
    room.round = next.round;
    room.drawer = next.id; room.phase = 'choosing'; room.word = ''; room.actions = []; room.pointCount = 0;
    room.hint = '';
    room.reporters.clear(); room.lastReportAt = 0; room.penaltyPlayed = false;
    room.players.forEach(player => { player.guessed = false; });
    const allWords = [...this.store.words(room.settings.categories), ...(room.settings.categories.includes('Personalizadas') ? room.customWords : [])];
    const uniqueWords = new Map(allWords.map(word => [normalize(word), word]));
    let pool = [...uniqueWords.values()].filter(word => !room.used.has(normalize(word)));
    if (!pool.length) {
      // Recycle only the exhausted selection, keeping other categories' history.
      for (const word of uniqueWords.keys()) room.used.delete(word);
      pool = [...uniqueWords.values()].filter(word => normalize(word) !== previousWord);
      if (!pool.length) pool = [...uniqueWords.values()];
    }
    // Fisher–Yates rather than a biased random sort.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    room.choices = pool.slice(0, 3);
    this.schedule(room, this.timing.choice, () => this.choose(room, room.choices[0]));
    this.broadcast(room);
  }
  private choose(room: Room, word: string) {
    room.turnGuesses = 0;
    room.finalWindow = 0;
    room.turnGuessers = new Set(room.players.filter(player => player.id !== room.drawer).map(player => player.id));
    room.duel = room.turnGuessers.size === 1;
    for (const player of room.players) if (player.id !== room.drawer) {
      const stats = this.badgeStats(room, player.id); stats.opportunities++; stats.roundOpportunities++;
    }
    room.word = word; room.used.add(normalize(word)); room.choices = []; room.phase = 'drawing';
    room.hint = maskWord(word);
    room.hintPlan = hintSteps(word); room.hintIndex = 0;
    const duration = this.timing.turn ?? room.settings.duration * 1000;
    room.turnDuration = duration;
    this.schedule(room, duration, () => this.reveal(room));
    this.scheduleHints(room, duration);
    this.system(room, `Le toca dibujar a ${room.players.find(player => player.id === room.drawer)?.name}.`);
    this.broadcast(room);
  }
  private reveal(room: Room) {
    if (room.phase !== 'drawing') return;
    const drawer = room.players.find(player => player.id === room.drawer);
    if (drawer) drawer.score += painterPoints(room.turnGuesses, room.turnGuessers.size, room.duel);
    if (!room.penaltyPlayed && Date.now() >= room.deadline && room.turnGuesses === 0 && room.actions.length > 0
      && room.players.some(player => player.id !== room.drawer && this.playerSocket(player.id)?.connected)) {
      this.badgeStats(room, room.drawer!).misunderstood = true;
    }
    room.phase = 'reveal';
    this.system(room, `La palabra era «${room.word}».`);
    this.schedule(room, this.timing.reveal, () => this.next(room));
    this.broadcast(room);
  }
  private finishReportedTurn(room: Room) {
    if (room.phase !== 'drawing' || room.penaltyPlayed || Date.now() >= room.deadline) return false;
    const voters = room.players.filter(player => player.id !== room.drawer);
    if (!voters.length || !voters.every(player => room.reporters.has(player.id))) return false;
    room.penaltyPlayed = true;
    const drawer = room.players.find(player => player.id === room.drawer)!;
    this.store.logModeration(room.code, 'unanimous-vote', this.io.sockets.sockets.get(drawer.id)?.data.identities[0] ?? drawer.id, 'report-unanimous');
    this.system(room, 'Todos reportaron al pintor. ¡Oof! Pasamos al siguiente turno.');
    this.io.to(room.code).emit('sound:play', 'penalty');
    this.reveal(room);
    return true;
  }
  private reset(room: Room) {
    this.clearTimers(room); room.phase = 'lobby'; room.drawer = null; room.deadline = 0;
    room.word = ''; room.choices = []; room.actions = []; room.pointCount = 0; room.round = 0;
    room.hint = '';
    room.players.forEach(player => { player.guessed = false; });
    this.system(room, 'Esperando al menos dos jugadores para empezar.'); this.broadcast(room);
  }
  private badgeStats(room: Room, id: string): BadgeStats {
    let stats = room.badgeStats.get(id);
    if (!stats) {
      stats = { guesses: 0, opportunities: 0, roundGuesses: 0, roundOpportunities: 0, fullRound: false, silentRound: false, misunderstood: false };
      room.badgeStats.set(id, stats);
    }
    return stats;
  }
  private finishBadgeRound(room: Room) {
    for (const player of room.players) {
      const stats = this.badgeStats(room, player.id);
      if (stats.fullRound && stats.roundOpportunities > 0 && stats.roundGuesses === 0) stats.silentRound = true;
      stats.roundGuesses = 0; stats.roundOpportunities = 0; stats.fullRound = true;
    }
  }
  private earnedBadges(room: Room, player: Player): BadgeId[] {
    const stats = this.badgeStats(room, player.id); const badges: BadgeId[] = [];
    if (stats.opportunities > 0 && stats.guesses === 0) badges.push('zero-guesses');
    if (stats.silentRound) badges.push('silent-round');
    if (stats.misunderstood) badges.push('misunderstood');
    const scores = room.players.map(other => other.score);
    if (stats.opportunities > 0 && player.score === Math.min(...scores) && player.score < Math.max(...scores)) badges.push('last-place');
    return badges;
  }
  private leave(socket: Socket) {
    if (socket.data.roomToken) this.resumeTokens.delete(socket.data.roomToken);
    clearTimeout(this.reconnectTimers.get(socket.id)); this.reconnectTimers.delete(socket.id);
    this.disconnectedSockets.delete(socket.id);
    const room = this.rooms.get(this.membership.get(socket.id) ?? '');
    if (!room) return;
    this.membership.delete(socket.id); socket.leave(room.code);
    const player = room.players.find(player => player.id === socket.id)!;
    room.players = room.players.filter(player => player.id !== socket.id);
    room.badgeStats.delete(socket.id);
    room.reporters.delete(socket.id);
    if (!room.players.length) { this.clearTimers(room); this.rooms.delete(room.code); return; }
    if (room.host === socket.id) room.host = room.players[0].id;
    this.system(room, `${player.name} salió de la sala.`);
    if (room.players.length < 2 && !['lobby', 'finished'].includes(room.phase)) this.reset(room);
    else if (room.drawer === socket.id && ['drawing', 'choosing'].includes(room.phase)) {
      this.system(room, 'El dibujante salió. Pasamos al siguiente turno.'); this.next(room);
    } else if (this.finishReportedTurn(room)) return;
    else if (room.phase === 'drawing' && room.players.filter(p => p.id !== room.drawer).every(p => p.guessed)) this.reveal(room);
    else this.broadcast(room);
  }
  private connect(socket: Socket) {
    clearTimeout(this.reconnectTimers.get(socket.id)); this.reconnectTimers.delete(socket.id);
    this.disconnectedSockets.delete(socket.id);
    if (socket.recovered) {
      const room = this.rooms.get(this.membership.get(socket.id) ?? '');
      if (room) this.broadcast(room);
      else {
        for (const name of socket.rooms) if (name !== socket.id) socket.leave(name);
        socket.emit('room:left');
      }
    } else if (socket.handshake.auth.roomSession) {
      if (!this.resumeRoom(socket)) socket.emit('room:resume-failed');
    }
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
    const createRoom = ({ name, avatar, visibility }: { name: string; avatar: string; visibility: RoomView['visibility'] }) => {
      if (this.membership.has(socket.id)) throw new Error('Ya estás en una sala.');
      if (this.rooms.size >= 200) throw new Error('El servidor está lleno. Prueba en un rato.');
      if (!this.activity.allow(`create:${socket.data.ip}`, 10, 60000)) throw new Error('Demasiadas salas creadas. Espera un minuto.');
      let code: string;
      do { code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase(); } while (this.rooms.has(code));
      const room: Room = {
        code, host: socket.id, players: [{ id: socket.id, name, avatar, score: 0, guessed: false, muted: false, registered: Boolean(socket.data.userId), badges: this.store.badges(socket.data.userId) }],
        phase: 'lobby', settings: { rounds: 3, duration: 100, categories: ['Bolivia', 'Cotidianas'] },
        round: 0, drawer: null, deadline: 0, word: '', choices: [], actions: [], messages: [],
        customWords: [], used: new Set(), queue: [], turn: 0, pointCount: 0,
        reporters: new Set(), lastReportAt: 0, penaltyPlayed: false,
        hint: '',
        banned: new Set(), completedGames: 0, visibility, badgeStats: new Map(), turnGuesses: 0,
        turnDuration: 0, finalWindow: 0, turnGuessers: new Set(), duel: false, hintPlan: [], hintIndex: 0,
      };
      this.rooms.set(code, room); this.membership.set(socket.id, code); socket.join(code);
      this.issueRoomSession(socket, code);
      this.system(room, `${name} creó la sala. ¡Que entre la tropa!`); this.broadcast(room);
    };
    const joinRoom = ({ name, avatar, code }: { name: string; avatar: string; code: string }) => {
      if (this.membership.has(socket.id)) throw new Error('Ya estás en una sala.');
      if (!this.activity.allow(`join:${socket.data.ip}`, 30, 60000)) throw new Error('Demasiados intentos de entrar. Espera un minuto.');
      const room = this.rooms.get(code);
      if (!room) throw new Error('Esa sala no existe o ya se cerró.');
      if ((socket.data.identities as string[]).some(id => room.banned.has(id))) throw new Error('Fuiste expulsado de esta sala.');
      if (socket.data.userId && room.players.some(player => this.playerSocket(player.id)?.data.userId === socket.data.userId)) throw new Error('Tu cuenta ya está en esta sala.');
      if (room.players.length >= 12) throw new Error('La sala está llena (12 jugadores).');
      if (room.players.some(player => normalize(player.name) === normalize(name))) throw new Error('Ese apodo ya está en la sala.');
      room.players.push({ id: socket.id, name, avatar, score: 0, guessed: false, muted: false, registered: Boolean(socket.data.userId), badges: this.store.badges(socket.data.userId) });
      if (room.phase === 'drawing') room.turnGuessers.add(socket.id);
      this.membership.set(socket.id, code); socket.join(code);
      this.issueRoomSession(socket, code);
      this.system(room, `${name} llegó. ¡Ahora sí!`);
      if (!['lobby', 'finished'].includes(room.phase)) {
        for (let round = room.round + 1; round <= room.settings.rounds; round++) room.queue.push({ id: socket.id, round });
        // New entries belong only to future rounds; the consumed prefix stays unchanged.
        room.queue.sort((a, b) => a.round - b.round);
        this.system(room, room.round < room.settings.rounds
          ? `${name} entra a adivinar y dibujará desde la ronda ${room.round + 1}.`
          : `${name} entra a adivinar. ¡Podrá dibujar en la revancha!`);
      }
      this.broadcast(room);
    };
    handle('room:create', z.object({ name: nameSchema, avatar: avatarSchema, visibility: z.enum(['private', 'public']).default('private') }), createRoom, false);
    handle('room:join', z.object({ name: nameSchema, avatar: avatarSchema, code: z.string().trim().toUpperCase().regex(/^[A-F0-9]{6}$/) }), joinRoom, false);
    handle('room:quick-join', z.object({ name: nameSchema, avatar: avatarSchema }), ({ name, avatar }) => {
      if (this.membership.has(socket.id)) throw new Error('Ya estás en una sala.');
      const available = [...this.rooms.values()].filter(room => room.visibility === 'public' && room.players.length < 12
        && !(socket.data.identities as string[]).some(id => room.banned.has(id))
        && !room.players.some(player => normalize(player.name) === normalize(name))
        && !(socket.data.userId && room.players.some(player => this.playerSocket(player.id)?.data.userId === socket.data.userId)));
      const waiting = available.filter(room => room.phase === 'lobby' || room.phase === 'finished');
      const pool = waiting.length ? waiting : available;
      const room = pool[Math.floor(Math.random() * pool.length)];
      if (room) joinRoom({ name, avatar, code: room.code });
      else createRoom({ name, avatar, visibility: 'public' });
    }, false);
    handle('room:visibility', z.object({ visibility: z.enum(['private', 'public']) }), ({ visibility }, room) => {
      this.requireHost(socket, room!);
      if (room!.visibility === visibility) return;
      if (!this.activity.allow(`visibility:${socket.id}`, 10, 60000)) throw new Error('Espera un minuto antes de cambiar la visibilidad otra vez.');
      room!.visibility = visibility;
      this.system(room!, visibility === 'public' ? 'La sala ahora es pública. ¡Que se sume la tropa!' : 'La sala ahora es privada. Se entra por código o enlace.');
      this.broadcast(room!);
    });
    handle('room:leave', z.object({}), () => { this.leave(socket); socket.emit('room:left'); });
    handle('room:moderate', z.object({ target: z.string().min(1).max(100), action: z.enum(['kick', 'mute', 'unmute']) }), ({ target, action }, room) => {
      this.requireHost(socket, room!);
      if (target === socket.id) throw new Error('No puedes moderarte a vos mismo.');
      const player = room!.players.find(player => player.id === target);
      if (!player) throw new Error('Ese jugador ya no está en la sala.');
      const targetSocket = this.playerSocket(target);
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
      room!.badgeStats.clear();
      for (const player of room!.players) this.badgeStats(room!, player.id).fullRound = true;
      if (room!.completedGames === 3) this.system(room!, '¿No que era la última, pues? —La tropa, tres revanchas después.', 'prank');
      const flavor = startEasterEgg();
      if (flavor) {
        this.system(room!, flavor, 'prank');
        this.io.to(room!.code).emit('game:flavor', flavor);
      }
      room!.queue = Array.from({ length: room!.settings.rounds }, (_, index) => room!.players.map(player => ({ id: player.id, round: index + 1 }))).flat();
      room!.turn = 0; this.next(room!);
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
      const postMessage = () => {
        const response = chatEasterEgg(text, room!.phase === 'drawing' ? room!.word : undefined, Math.random, player.name);
        if (response) {
          if (/\berror\s+de\s+capa\s*8\b|\bvladi\s+god\b/i.test(text)) room!.messages.push({ id: randomUUID(), name: player.name, senderId: socket.id, text, kind: 'chat' });
          this.system(room!, response, 'prank');
        } else room!.messages.push({ id: randomUUID(), name: player.name, senderId: socket.id, text, kind: 'chat' });
        if (creatorPrank(text)) {
          socket.volatile.emit('game:creator-prank', { code: room!.code });
          this.system(room!, `¡${player.name} es un traidor! Al creador se lo respeta, pues. 👑`, 'prank');
        }
      };
      if (room!.phase === 'drawing') {
        if (Date.now() >= room!.deadline) throw new Error('El tiempo para adivinar terminó.');
        if (room!.drawer === socket.id || player.guessed) throw new Error('Espera al siguiente turno para chatear.');
        if (normalize(text) === normalize(room!.word)) {
          const now = Date.now(), remaining = Math.max(0, room!.deadline - now);
          const first = room!.turnGuesses === 0;
          if (first) {
            room!.finalWindow = finalGuessWindow(room!.turnDuration, remaining);
            if (room!.finalWindow < remaining) {
              this.schedule(room!, room!.finalWindow, () => this.reveal(room!));
              this.scheduleHints(room!, room!.finalWindow);
            }
          }
          player.guessed = true;
          room!.turnGuesses++;
          const stats = this.badgeStats(room!, player.id); stats.guesses++; stats.roundGuesses++;
          const points = first ? firstGuessPoints(remaining, room!.turnDuration, room!.duel) : followingGuessPoints(remaining, room!.finalWindow);
          player.score += points;
          // Personal, ephemeral feedback: don't broadcast or replay it on recovery.
          socket.volatile.emit('game:guessed', { id: randomUUID(), code: room!.code, points });
          this.system(room!, `¡${player.name} adivinó!`, 'correct');
          if (room!.players.filter(p => p.id !== room!.drawer).every(p => p.guessed)) { this.reveal(room!); return; }
        } else {
          if (normalize(text).includes(normalize(room!.word))) throw new Error('Escribe solamente la respuesta.');
          postMessage();
        }
      } else postMessage();
      room!.messages = room!.messages.slice(-80); this.broadcast(room!);
    });
    handle('soundboard:play', z.object({ id: z.enum(SOUNDBOARD_CLIPS.map(clip => clip.id)) }), ({ id }, room) => {
      const player = room!.players.find(player => player.id === socket.id)!;
      if (player.muted) throw new Error('El anfitrión silenció tu chat y soundboard.');
      const event: SoundboardEvent = { code: room!.code, id, senderId: socket.id, name: player.name };
      // Ephemeral audio must not be replayed when a player reconnects.
      this.io.to(room!.code).volatile.emit('soundboard:play', event);
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
      if (this.finishReportedTurn(room!)) return;
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
        const player = room!.players.find(player => player.id === socket.id)!;
        this.system(room!, `¡${player.name} intentó agarrar un camino fácil escribiendo la respuesta! Acá se dibuja, pues. 👀`, 'prank');
        this.broadcast(room!);
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
    socket.on('disconnect', reason => {
      if (this.closing) return;
      const room = this.rooms.get(this.membership.get(socket.id) ?? '');
      if (room && ['transport close', 'transport error', 'ping timeout'].includes(reason)) {
        this.disconnectedSockets.set(socket.id, socket);
        this.io.to(room.code).emit('board:cursor', { drawer: socket.id, cursor: null });
        this.reconnectTimers.set(socket.id, setTimeout(() => this.leave(socket), this.timing.reconnect ?? RECONNECT_GRACE_MS));
        this.broadcast(room);
      } else this.leave(socket);
    });
  }
  private requireHost(socket: Socket, room: Room) {
    if (room.host !== socket.id) throw new Error('Solo el anfitrión puede hacer eso.');
  }
  private issueRoomSession(socket: Socket, code: string) {
    if (socket.data.roomToken) this.resumeTokens.delete(socket.data.roomToken);
    const token = randomBytes(32).toString('hex');
    socket.data.roomToken = token; this.resumeTokens.set(token, socket.id);
    // Never include this credential in the public room snapshot.
    socket.emit('room:session', { code, token });
  }
  private resumeRoom(socket: Socket) {
    const parsed = z.object({ code: z.string().regex(/^[A-F0-9]{6}$/), token: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(socket.handshake.auth.roomSession);
    if (!parsed.success) return false;
    const { code, token } = parsed.data;
    const oldId = this.resumeTokens.get(token);
    const room = this.rooms.get(code);
    const oldSocket = oldId ? this.playerSocket(oldId) : undefined;
    const player = room?.players.find(player => player.id === oldId);
    if (!oldId || !oldSocket || !player || this.membership.get(oldId) !== code) return false;
    if (oldSocket.data.userId !== socket.data.userId
      || !(oldSocket.data.identities as string[]).some(id => id.startsWith('guest:') && (socket.data.identities as string[]).includes(id))
      || (socket.data.identities as string[]).some(id => room!.banned.has(id))) return false;
    clearTimeout(this.reconnectTimers.get(oldId)); this.reconnectTimers.delete(oldId);
    this.disconnectedSockets.delete(oldId); this.membership.delete(oldId);
    this.membership.set(socket.id, code); socket.join(code);
    player.id = socket.id;
    if (room!.host === oldId) room!.host = socket.id;
    if (room!.drawer === oldId) room!.drawer = socket.id;
    for (const entry of room!.queue) if (entry.id === oldId) entry.id = socket.id;
    const stats = room!.badgeStats.get(oldId);
    if (stats) { room!.badgeStats.delete(oldId); room!.badgeStats.set(socket.id, stats); }
    for (const ids of [room!.reporters, room!.turnGuessers]) if (ids.delete(oldId)) ids.add(socket.id);
    for (const message of room!.messages) if (message.senderId === oldId) message.senderId = socket.id;
    this.resumeTokens.delete(token); delete oldSocket.data.roomToken;
    // Cover reloads whose new connection arrives before the old transport closes.
    oldSocket.leave(code); oldSocket.emit('room:left'); oldSocket.disconnect(true);
    this.issueRoomSession(socket, code);
    this.io.to(code).emit('board:cursor', { drawer: socket.id, cursor: null });
    this.broadcast(room!);
    return true;
  }
  private playerSocket(id: string) { return this.io.sockets.sockets.get(id) ?? this.disconnectedSockets.get(id); }
  private requireDrawer(socket: Socket, room: Room) {
    if (room.drawer !== socket.id || room.phase !== 'drawing' || Date.now() >= room.deadline) throw new Error('Todavía no es tu turno para dibujar.');
  }
  close() {
    this.closing = true;
    this.resumeTokens.clear();
    for (const timer of this.reconnectTimers.values()) clearTimeout(timer);
    this.reconnectTimers.clear();
    this.disconnectedSockets.clear();
    for (const room of this.rooms.values()) this.clearTimers(room);
  }
}
