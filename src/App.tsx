import { useEffect, useRef, useState, type FormEvent } from 'react';
import { io } from 'socket.io-client';
import { ArrowRight, Check, Circle, Copy, Crown, Eraser, Flag, Heart, LogOut, Minus, MoreHorizontal, PaintBucket, Pencil, Play, Plus, Send, Sparkles, Square, Star, Trash2, Trophy, Type, Undo2, Users, Volume2, VolumeX } from 'lucide-react';
import type { AccountUser, CursorUpdate, DrawingCursor, DrawAction, RoomView, Settings, SoundEffect, Tool } from '../shared/types';
import { AVATAR_PATTERN, DEFAULT_AVATAR } from '../shared/types';
import { Canvas } from './Canvas';
import { SoundPlayer } from './sound';
import { AvatarImage, AvatarPicker } from './AvatarPicker';
import { AccountPanel } from './AccountPanel';
import { ModerationDialog } from './ModerationDialog';

const socket = io({ autoConnect: false });
let sessionRequest: Promise<{ user: AccountUser | null }> | undefined;
function session() {
  return sessionRequest ??= fetch('/api/session', { credentials: 'same-origin' }).then(response => {
    if (!response.ok) throw new Error('No se pudo iniciar la sesión.');
    return response.json();
  });
}
const colors = ['#292438', '#ffffff', '#ef5350', '#f79839', '#f4c747', '#68b565', '#26999c', '#4a85d3', '#7460bf', '#d783b2', '#885c43', '#9c9aa7'];
const toolOptions = [
  { id: 'brush', label: 'Pincel', icon: Pencil, shortcuts: ['p', 'b', '1'] }, { id: 'eraser', label: 'Borrador', icon: Eraser, shortcuts: ['e', '2'] },
  { id: 'line', label: 'Línea', icon: Minus, shortcuts: ['l', '3'] }, { id: 'rectangle', label: 'Cuadrado', icon: Square, shortcuts: ['r', '4'] },
  { id: 'ellipse', label: 'Círculo', icon: Circle, shortcuts: ['o', '5'] }, { id: 'star', label: 'Estrella', icon: Star, shortcuts: ['s', '6'] },
  { id: 'fill', label: 'Relleno', icon: PaintBucket, shortcuts: ['f', '7'] }, { id: 'text', label: 'Texto', icon: Type, shortcuts: ['t', '8'] },
] as const;

function Doodle({ small = false }: { small?: boolean }) {
  return <svg viewBox="0 0 600 420" className={`doodle ${small ? 'small' : ''}`} aria-hidden="true">
    <g stroke="#332c43" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      <g className="sun"><path d="M405 55v-15m0 112v-15m-52-42h-15m133 0h-15m-88-37-11-11m85 85 11 11m-85-11-11 11m85-85 11-11" fill="none"/><circle cx="405" cy="95" r="34" fill="#f6c64b"/><path d="M391 98q14 18 28 0" fill="none"/><path d="M393 85v2m24-2v2"/></g>
      <path d="M95 275 243 84l108 163 55-71 119 143H65Z" fill="#afa0de"/>
      <path d="m206 132 37-48 42 64-27-13-15 11-14-21Z" fill="#fffdf8"/>
      <path d="m367 226 39-50 45 54-24-7-17 11-19-17Z" fill="#fffdf8"/>
      <path d="M72 308q155-44 254 0t204 2v28H72Z" fill="#8ab99a"/>
      <g transform="translate(172 245) rotate(-12)"><path d="M-25 52q16-81 113-29 43 31 5 49-62 28-118-20Z" fill="#efb265"/><path d="M-23 49q16-20 36-11t26 3 29 9 26 9" fill="none"/><path d="M21 20 29 27m13-7 7 11m17-3 3 10"/></g>
      <g transform="translate(354 277) rotate(16)"><rect width="30" height="112" rx="5" fill="#7562bb"/><path d="m0 0 15-33L30 0Z" fill="#f3d0a5"/><path d="m10-21 5-12 6 12" fill="#332c43"/><path d="M1 92h28"/><path d="M1 100h28" stroke="#f4c747" strokeWidth="12"/></g>
      <path d="m96 116 8 17 19 2-14 13 4 19-17-10-16 10 3-19-14-13 19-2Z" fill="#f4c747"/>
      <path d="m510 230 7 13 15 2-11 10 2 15-13-7-13 7 3-15-11-10 15-2Z" fill="#ee9d98"/>
      <path d="M58 235q-22-24-8-32t28 10m422-31q40-18 34-39-5-17-23-5 29 5 43-18" fill="none"/>
      <path d="M293 66q8-24 18-8t15-7" fill="none" stroke="#e98e8b"/>
    </g>
    <text x="72" y="385" fill="#6d6380" fontSize="19" fontFamily="cursive" transform="rotate(-5 72 385)">¿es una salteña o una montaña?</text>
  </svg>;
}

export default function App() {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [moderatingId, setModeratingId] = useState<string | null>(null);
  const [remoteCursor, setRemoteCursor] = useState<CursorUpdate | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [name, setName] = useState(() => localStorage.getItem('pinta-name') ?? '');
  const [avatar, setAvatar] = useState(() => {
    const saved = localStorage.getItem('pinta-avatar');
    return saved && AVATAR_PATTERN.test(saved) ? saved : DEFAULT_AVATAR;
  });
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('sala')?.slice(0, 6).toUpperCase() ?? '');
  const [joining, setJoining] = useState(Boolean(code)); const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState(''); const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [tool, setTool] = useState<Tool>('brush'); const [color, setColor] = useState(colors[0]); const [size, setSize] = useState(6); const [text, setText] = useState('');
  const textInput = useRef<HTMLInputElement>(null);
  const [chat, setChat] = useState(''); const [words, setWords] = useState(''); const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.35); const [loadingAudio, setLoadingAudio] = useState(false);
  const [now, setNow] = useState(Date.now()); const offset = useRef(0); const bottom = useRef<HTMLDivElement>(null);
  const sounds = useRef<SoundPlayer | null>(null); const previousCorrect = useRef<string | undefined>(undefined);
  async function enableSounds() {
    setLoadingAudio(true);
    try { sounds.current ??= new SoundPlayer(volume); await sounds.current.enable(); setMuted(false); }
    catch { setMuted(true); toast('No se pudieron activar los sonidos. Intenta otra vez.'); }
    finally { setLoadingAudio(false); }
  }
  async function toggleSounds() {
    if (!muted) { sounds.current?.mute(); setMuted(true); return; }
    await enableSounds();
  }
  function toast(message: string) { setNotice(message); clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setNotice(''), 5000); }
  function emit(event: string, payload: unknown, done?: () => void): Promise<boolean> {
    if (!socket.connected) { toast('No hay conexión con el servidor.'); return Promise.resolve(false); }
    return new Promise(resolve => {
      socket.timeout(5000).emit(event, payload, (error: Error | null, result: { ok: boolean; error?: string }) => {
        setPending(false);
        if (error) { toast('El servidor tardó demasiado. Revisa tu conexión.'); resolve(false); }
        else if (!result.ok) { toast(result.error ?? 'No se pudo completar la acción.'); resolve(false); }
        else { done?.(); resolve(true); }
      });
    });
  }
  useEffect(() => {
    let active = true;
    let roomOnWire: RoomView | null = null;
    let bufferedActions: DrawAction[] = [];
    let bufferedCursor: CursorUpdate | null = null;
    let frame: number | undefined;
    const clearBufferedUpdates = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined; bufferedActions = []; bufferedCursor = null;
    };
    const scheduleFrame = () => {
      if (frame !== undefined) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        const additions = bufferedActions; const cursor = bufferedCursor;
        bufferedActions = []; bufferedCursor = null;
        if (additions.length) setRoom(previous => previous?.phase === 'drawing' ? { ...previous, actions: [...previous.actions, ...additions] } : previous);
        if (cursor) setRemoteCursor(cursor);
      });
    };
    const onConnect = () => setConnected(true);
    const onDisconnect = () => { const wasPlaying = Boolean(roomOnWire); clearBufferedUpdates(); roomOnWire = null; setRemoteCursor(null); setConnected(false); setRoom(null); setPending(false); if (wasPlaying) toast('Se cortó la conexión. Vuelve a entrar a la sala cuando se reconecte.'); };
    const onState = (next: RoomView) => { clearBufferedUpdates(); roomOnWire = next; if (next.phase !== 'drawing') setRemoteCursor(null); offset.current = next.serverTime - Date.now(); setRoom(next); setCode(next.code); history.replaceState({}, '', `?sala=${next.code}`); };
    const onCursor = (update: CursorUpdate) => { bufferedCursor = update; scheduleFrame(); };
    socket.on('board:cursor', onCursor);
    const onAction = (action: DrawAction) => {
      // Owner echoes reconcile the immediate local preview before the acknowledgement.
      if (roomOnWire?.drawer === socket.id) setRoom(previous => previous ? { ...previous, actions: [...previous.actions, action] } : previous);
      else { bufferedActions.push(action); scheduleFrame(); }
    };
    const onHint = (hint: string) => setRoom(previous => previous?.phase === 'drawing' ? { ...previous, hint } : previous);
    socket.on('word:hint', onHint);
    const onLeft = () => { clearBufferedUpdates(); roomOnWire = null; setRemoteCursor(null); setRoom(null); history.replaceState({}, '', location.pathname); };
    const onKicked = ({ reason }: { reason: string }) => { onLeft(); setModeratingId(null); toast(reason); };
    socket.on('room:kicked', onKicked);
    const onSound = (effect: SoundEffect) => { if (effect === 'report' || effect === 'penalty') void sounds.current?.play(effect).catch(() => toast('No se pudo reproducir el audio.')); };
    socket.on('sound:play', onSound);
    socket.on('connect', onConnect); socket.on('disconnect', onDisconnect); socket.on('room:state', onState); socket.on('board:action', onAction); socket.on('room:left', onLeft);
    socket.on('connect_error', error => { setConnected(false); toast(error.message); });
    void session().then(data => { if (active) { setAccount(data.user); socket.connect(); } }).catch(() => { if (active) { toast('No se pudo preparar la sesión. Recarga para intentar otra vez.'); } });
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => { active = false; clearBufferedUpdates(); socket.off('room:kicked', onKicked); socket.off('board:cursor', onCursor); socket.off('word:hint', onHint); socket.off('sound:play', onSound); sounds.current?.mute(); socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); socket.off('room:state', onState); socket.off('board:action', onAction); socket.off('room:left', onLeft); socket.off('connect_error'); socket.disconnect(); clearInterval(timer); clearTimeout(noticeTimer.current); };
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [room?.messages.length, room?.messages.at(-1)?.id]);
  useEffect(() => {
    const message = room?.messages.filter(message => message.kind === 'correct').at(-1);
    if (message && previousCorrect.current && previousCorrect.current !== message.id && !muted) sounds.current?.correct();
    previousCorrect.current = message?.id ?? 'none';
  }, [room?.messages, muted]);
  const isHost = room?.host === room?.you;
  const isDrawer = Boolean(room && room.drawer === room.you);
  const drawing = Boolean(isDrawer && room?.phase === 'drawing');
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (!drawing || event.defaultPrevented || event.isComposing || event.repeat || document.querySelector('dialog[open]')) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && key === 'z') {
        event.preventDefault();
        if (room?.actions.length) void emit('board:undo', {});
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const option = toolOptions.find(option => option.shortcuts.some(shortcut => shortcut === key));
      if (option) { event.preventDefault(); setTool(option.id); }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [drawing, room?.actions.length]);
  const player = room?.players.find(player => player.id === room.you);
  const chatDisabled = Boolean(room && ((room.phase === 'drawing' && (isDrawer || player?.guessed)) || (player?.muted && room.phase !== 'drawing')));
  const editable = Boolean(room && ['lobby', 'finished'].includes(room.phase));
  const seconds = room?.deadline ? Math.max(0, Math.ceil((room.deadline - now - offset.current) / 1000)) : 0;
  function enter(event: FormEvent) {
    event.preventDefault(); setPending(true); localStorage.setItem('pinta-name', name.trim());
    if (!muted) void enableSounds();
    emit(joining ? 'room:join' : 'room:create', { name, avatar, ...(joining ? { code } : {}) });
  }
  async function invite() {
    const url = `${location.origin}${location.pathname}?sala=${room!.code}`;
    try { await navigator.clipboard.writeText(url); toast('¡Enlace copiado! Pásalo al grupo.'); }
    catch { toast(`Código de sala: ${room!.code}`); }
  }
  function settings(patch: Partial<Settings>) { if (room) emit('room:settings', { ...room.settings, ...patch }); }
  function sendCursor(cursor: DrawingCursor | null) {
    if (!socket.connected) return;
    if (cursor) socket.volatile.emit('board:cursor', cursor);
    else socket.emit('board:cursor', null);
  }
  function sendAction(action: DrawAction) {
    if (action.tool === 'text' && !action.text?.trim()) {
      toast('Primero escribí una pista en el campo de texto; después tocá el lienzo para colocarla.');
      textInput.current?.focus();
      return Promise.resolve(false);
    }
    return emit('board:action', action);
  }
  return <div className="app-shell">
    <header className="site-header">
      <a className="brand" href="/" onClick={event => { if (room) event.preventDefault(); }} aria-label="Pinta Pues inicio"><span className="brand-icon"><Pencil size={24} /></span><span>Pinta<span className="brand-purple">Pues</span><span className="brand-dot">.</span></span></a>
      <div className="header-right">{!connected && <span className="connection"><i />Conectando…</span>}<span className="made-in">Hecho en Bolivia <span className="flag">▰</span></span>
        {!room && <AccountPanel user={account} disabled={!connected} onChanged={user => { setAccount(user); socket.disconnect(); socket.connect(); }} />}
        {room && <button className="icon-button" title="Salir de la sala" aria-label="Salir de la sala" onClick={() => emit('room:leave', {})}><LogOut size={19} /></button>}
      </div>
    </header>
    {!room ? <main className="landing">
      <section className="hero-copy">
        <h1>Vos dibujá.<br />La tropa <span>adivina.<svg viewBox="0 0 300 16"><path d="M3 10Q100 0 295 9M22 15q141-7 245-1" /></svg></span></h1>
        <p>Juntá a tus amigos, soltá el artista que llevás dentro y preparate para dibujos que no entiende ni su autor.</p>
        <Doodle />
      </section>
      <section className="entry-wrap"><span className="sticker">¡Ya pues, entrá! <Sparkles size={18} /></span><div className="entry-card">
        <h2>Se arma la partidovich<span>✳</span></h2><p>La salteña puede esperar. Tu sala, no.</p>
        <form onSubmit={enter}><label htmlFor="nickname">¿Cómo te dice la tropa?</label><div className="input-with-icon"><AvatarPicker value={avatar} onChange={seed => { setAvatar(seed); localStorage.setItem('pinta-avatar', seed); }} /><input id="nickname" autoComplete="nickname" placeholder="Tu apodo legendario" value={name} minLength={2} maxLength={20} required onChange={event => setName(event.target.value)} /></div>
          <div className="entry-tabs"><button type="button" className={!joining ? 'selected' : ''} onClick={() => setJoining(false)}><Plus size={17} /> Crear sala</button><button type="button" className={joining ? 'selected' : ''} onClick={() => setJoining(true)}><Users size={17} /> Unirme</button></div>
          {joining && <div className="code-field"><label htmlFor="code">Código de la sala</label><input id="code" value={code} placeholder="Ej. A1B2C3" maxLength={6} minLength={6} required onChange={event => setCode(event.target.value.toUpperCase())} /></div>}
          <button className="button primary entry-submit" disabled={!connected || pending}>{pending ? 'Un ratito…' : joining ? 'Entrar a la sala' : '¡Armemos la sala!'}<ArrowRight size={19} /></button>
        </form><div className="entry-note"><Users size={16} /> De 2 a 12 amigos · Gratis · Sin registro</div>
      </div></section>
      <section className="how-it-works"><div><span>01</span><p><strong>Juntá a la tropa</strong>Creá una sala y pasá el enlace.</p></div><div><span>02</span><p><strong>Dibujá lo que te toque</strong>¿Algo filosófico? ¿Goku? Vos podés.</p></div><div><span>03</span><p><strong>Adiviná antes que todos</strong>Más rápido, más puntos. Así de fácil.</p></div></section>
    </main> : <main className="game-page">
      <div className={`room-heading ${!editable ? 'active-game-heading' : ''}`}><div><span className="eyebrow">LA TROPA ESTÁ REUNIDA</span><h1>Sala <span>{room.code}</span></h1></div>
        {!editable && <div className="turn-header">
          <div className="board-top"><div><span className="status-dot" /><strong>{room.phase === 'choosing' ? isDrawer ? 'Elegí tu palabra' : 'El dibujante está eligiendo' : room.phase === 'reveal' ? '¡Así era, pues!' : isDrawer ? 'Te toca dibujar' : `${room.players.find(p => p.id === room.drawer)?.name} está dibujando`}</strong></div><span className={`timer ${seconds <= 10 ? 'urgent' : ''}`}>{seconds}s</span></div>
          <div className="word-strip"><span>{room.word ? room.phase === 'reveal' ? 'LA PALABRA ERA' : 'TU PALABRA' : 'ADIVINÁ LA PALABRA'}</span><strong className={!room.word ? 'hint' : ''}>{room.word ?? (room.phase === 'choosing' ? '• • •' : room.hint)}</strong></div>
        </div>}
        <div className="room-meta"><span><Users size={17} />{room.players.length}/12</span><button className="button secondary" onClick={invite}>Invitar amigos <Plus size={17} /></button></div>
      </div>
      <div className="game-grid">
        <aside className="players-panel panel"><div className="panel-heading"><Trophy size={17} /><h2>La tropa</h2><span>{room.players.length}</span></div>
          <div className="player-list">{[...room.players].sort((a, b) => b.score - a.score).map((item, index) => <div className={`player ${item.id === room.drawer ? 'active' : ''} ${item.guessed ? 'guessed' : ''}`} key={item.id}>
            <span className="player-rank">{index + 1}</span><span className="avatar player-avatar"><AvatarImage seed={item.avatar} alt={`Avatar de ${item.name}`} /></span><div><strong>{item.name}{item.id === room.you && <small> (vos)</small>}</strong><span>{item.score} puntos{item.muted && ' · Chat silenciado'}</span></div><span className="player-indicator">{item.guessed ? <Check size={16} /> : item.id === room.drawer ? <Pencil size={16} /> : item.id === room.host ? <Crown size={16} /> : null}</span>
            {isHost && item.id !== room.you && <button className="player-menu" aria-label={`Moderar a ${item.name}`} title={`Moderar a ${item.name}`} onClick={() => setModeratingId(item.id)}><MoreHorizontal size={16} /></button>}
          </div>)}</div><div className="players-note">{editable ? 'Pasá el enlace al grupo. Las risas se multiplican.' : `Ronda ${room.round} de ${room.settings.rounds}`}<span>✳</span></div>
        </aside>
        <section className="board-column">
          {editable && <div className="board-top"><div><span className="status-dot" /><strong>{room.phase === 'finished' ? '¡Tenemos ganador!' : 'Calentando los pinceles'}</strong></div></div>}
          <div className="board-surface">
            {editable ? <div className="lobby">
              {room.phase === 'finished' ? <div className="winner"><Trophy size={42} /><h2>¡{[...room.players].sort((a, b) => b.score - a.score)[0].name} se la lleva!</h2><p>Los puntos están a la izquierda. Las excusas van al chat.</p></div> : <><div className="lobby-doodle"><Doodle small /></div><h2>Que no falte nadie, pues.</h2><p>Comparte este enlace <button className="inline-code" onClick={invite}>{room.code} <Copy size={13} /></button> y prepará tu mejor peor dibujo.</p></>}
              <div className="settings-grid"><label>Rondas<select aria-label="Rondas" disabled={!isHost} value={room.settings.rounds} onChange={e => settings({ rounds: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value} {value === 1 ? 'ronda' : 'rondas'}</option>)}</select></label><label>Tiempo por turno<select aria-label="Tiempo por turno" disabled={!isHost} value={room.settings.duration} onChange={e => settings({ duration: Number(e.target.value) })}>{[30, 60, 80, 100, 120, 180].map(value => <option key={value} value={value}>{value} segundos</option>)}</select></label></div>
              <div className="category-picker"><span>Categorías de la partida</span><div>{room.availableCategories.map(category => <button key={category} className={room.settings.categories.includes(category) ? 'selected' : ''} disabled={!isHost} onClick={() => { const categories = room.settings.categories.includes(category) ? room.settings.categories.filter(value => value !== category) : [...room.settings.categories, category]; if (categories.length) settings({ categories }); }} >{room.settings.categories.includes(category) && <Check size={13} />}{category}{category === 'Personalizadas' ? ` (${room.customWordCount})` : ''}</button>)}</div></div>
              {isHost && <details className="custom-words"><summary>+ Agregar las palabras de tu grupo</summary><form onSubmit={event => { event.preventDefault(); const list = words.split(/[,\n]/).map(word => word.trim()).filter(Boolean); emit('room:words', { words: list }, () => { setWords(''); toast('Palabras agregadas a esta sala.'); }); }}><textarea aria-label="Palabras personalizadas" placeholder="Una por línea o separadas por comas. Sí, las jergas también valen." value={words} maxLength={4000} onChange={e => setWords(e.target.value)} required /><button className="button secondary" type="submit">Agregar palabras</button></form><small>Privadas para esta sala; se borran cuando la sala se cierra.</small></details>}
              {isHost ? <button className="button primary start-button" disabled={room.players.length < 2} onClick={() => emit('game:start', {})}><Play size={17} fill="currentColor" />{room.phase === 'finished' ? '¡Sale la revancha!' : '¡A pintar, pues!'}</button> : <div className="waiting-host">El anfitrión decide cuándo arrancamos.</div>}
              {isHost && room.players.length < 2 && <small className="minimum-note">Falta al menos un amigo para empezar.</small>}
            </div> : <><Canvas actions={room.actions} enabled={drawing} tool={tool} color={color} size={size} text={text} onAction={sendAction}
              remoteCursor={room.phase === 'drawing' && remoteCursor?.drawer === room.drawer ? remoteCursor.cursor : null} onCursor={sendCursor} />
              {room.phase === 'choosing' && <div className="board-overlay"><span className="choice-icon"><Pencil size={32} /></span><h2>{isDrawer ? '¿Qué vas a dibujar?' : 'Se está cocinando el dibujo…'}</h2><p>{isDrawer ? 'Elegí una. La tropa confía en tu talento.' : 'En un ratito empieza el turno.'}</p>{room.choices && <div className="word-choices">{room.choices.map(word => <button className="button secondary" key={word} onClick={() => emit('game:choose', { word })}>{word}</button>)}</div>}</div>}
              {room.phase === 'reveal' && <div className="reveal-banner">
                <span className="reveal-icon"><Sparkles size={30} /></span>
                <div className="reveal-copy"><span>La palabra era</span><strong role="status">{room.word}</strong><p>¡Siguiente turno en <b>{seconds}s</b>!</p></div>
              </div>}
            </>}
          </div>
          {room.phase === 'drawing' && !isDrawer && <div className="report-row"><button className="report-button" aria-label={room.reported ? 'Pintor reportado' : 'Reportar al pintor'} disabled={room.reported} title="Es una broma: activa avisos y sonidos, sin cambiar puntos ni terminar el turno" onClick={() => emit('game:report', {})}><Flag size={14} />{room.reported ? 'Pintor reportado' : 'Reportar al pintor'}<span>{room.reportCount}/{room.reportRequired}</span></button></div>}
          <div className={`toolbar panel ${!drawing ? 'disabled-tools' : ''}`}><div className="tools">{toolOptions.map(({ id, label, icon: Icon, shortcuts }) => <button className={`tool-button ${tool === id ? 'selected' : ''}`} title={`${label} (${shortcuts.join(' / ').toUpperCase()})`} aria-label={label} aria-keyshortcuts={shortcuts.join(' ').toUpperCase()} aria-pressed={tool === id} key={id} disabled={!drawing} onClick={() => setTool(id)}><Icon size={19} /></button>)}<span className="tool-divider" /><button className="tool-button" title="Deshacer (Ctrl+Z / ⌘Z)" aria-label="Deshacer" aria-keyshortcuts="Control+Z Meta+Z" disabled={!drawing || !room.actions.length} onClick={() => emit('board:undo', {})}><Undo2 size={18} /></button><button className="tool-button" title="Limpiar lienzo" aria-label="Limpiar lienzo" disabled={!drawing || !room.actions.length} onClick={() => emit('board:clear', {})}><Trash2 size={17} /></button></div>
            <div className="color-row"><div className="palette">{colors.map(value => <button key={value} aria-label={`Color ${value}`} title={value} disabled={!drawing} className={`swatch ${color === value ? 'selected' : ''}`} style={{ background: value }} onClick={() => setColor(value)} />)}<label className="custom-color" title="Otro color"><Plus size={15} /><input type="color" aria-label="Color personalizado" disabled={!drawing} value={color} onChange={e => setColor(e.target.value)} /></label></div><label className="brush-size">Grosor<input aria-label="Grosor del pincel" type="range" min="2" max="40" disabled={!drawing} value={size} onChange={e => setSize(Number(e.target.value))} /><span>{size}</span></label></div>
            {tool === 'text' && <input ref={textInput} className="canvas-text" aria-label="Texto para el lienzo" placeholder="Primero escribí acá; después tocá el lienzo para colocarlo." value={text} maxLength={50} disabled={!drawing} onChange={e => setText(e.target.value)} />}
          </div>
          <p className="board-caption">{drawing ? tool === 'text' ? 'Escribí el texto arriba y tocá el lienzo para colocarlo.' : 'Tu obra maestra empieza con un trazo.' : 'No hace falta dibujar bien para pasarla bien.'}<Heart size={13} /></p>
        </section>
        <aside className="chat-panel panel"><div className="panel-heading"><span className="chat-bubble">···</span><h2>El chisme</h2><button className="icon-button" aria-label={muted ? 'Activar sonidos' : 'Silenciar sonidos'} title={muted ? 'Activar sonidos' : 'Silenciar sonidos'} disabled={loadingAudio} onClick={() => void toggleSounds()}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button></div>
          {!muted && <label className="sound-volume">Volumen<input aria-label="Volumen de efectos" type="range" min="0" max="100" value={Math.round(volume * 100)} onChange={event => { const value = Number(event.target.value) / 100; setVolume(value); sounds.current?.setVolume(value); }} /></label>}
          <div className="messages" aria-live="polite" aria-label="Chat de la sala">{room.messages.map(message => <div className={`message ${message.kind}`} key={message.id}>{message.kind === 'chat' ? <><strong>{message.name}</strong><span>{message.text}</span>{isHost && <button className="delete-message" aria-label={`Borrar mensaje de ${message.name}`} title="Borrar mensaje" onClick={() => emit('chat:delete', { id: message.id })}><Trash2 size={12} /></button>}</> : <span>{message.kind === 'correct' ? '✦ ' : ''}{message.text}</span>}</div>)}<div ref={bottom} /></div>
          <form className="chat-form" onSubmit={event => { event.preventDefault(); if (chat.trim()) emit('chat:send', { text: chat }, () => setChat('')); }}><label className="sr-only" htmlFor="guess">Tu respuesta o mensaje</label><input id="guess" autoComplete="off" placeholder={room.phase === 'drawing' ? isDrawer || player?.guessed ? '¡Shhh! Guardá el secreto.' : '¿Qué será, pues?' : 'Decí algo a la tropa…'} maxLength={200} value={chat} disabled={chatDisabled} onChange={e => setChat(e.target.value)} /><button aria-label="Enviar mensaje" disabled={!chat.trim() || chatDisabled}><Send size={18} /></button></form><p className="chat-tip">{room.phase === 'drawing' ? 'Escribí la palabra aquí para adivinar.' : 'Se permiten chistes malos. Dibujos también.'}</p>
        </aside>
      </div>
    </main>}
    <ModerationDialog player={isHost ? room?.players.find(player => player.id === moderatingId) ?? null : null} onClose={() => setModeratingId(null)} onAction={(target, action) => emit('room:moderate', { target, action })} />
    <footer className="site-footer"><span>Pinta Pues <span className="footer-spark">✳</span> Con cariño, desde Bolivia.</span></footer>
    {notice && <div className="toast" role="status">{notice}<button aria-label="Cerrar aviso" onClick={() => setNotice('')}>×</button></div>}
  </div>;
}
