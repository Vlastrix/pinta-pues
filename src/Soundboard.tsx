import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { AudioLines, Grip, Search, Volume2, VolumeX, X } from 'lucide-react';
import { SOUNDBOARD_CLIPS, type SoundboardId } from '../shared/soundboard';

export function Soundboard({ muted, volume, busy, canSend, onToggle, onVolume, onSend }: {
  muted: boolean; volume: number; busy: boolean; canSend: boolean;
  onToggle: () => void; onVolume: (value: number) => void; onSend: (id: SoundboardId) => Promise<boolean>;
}) {
  const panel = useRef<HTMLElement>(null); const trigger = useRef<HTMLButtonElement>(null);
  const id = useId(); const titleId = useId();
  const [open, setOpen] = useState(false); const [query, setQuery] = useState('');
  const [position, setPosition] = useState({ left: 12, top: 80 });
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  function clamp(left: number, top: number) {
    const viewport = window.visualViewport;
    const x = viewport?.offsetLeft ?? 0; const y = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? innerWidth; const height = viewport?.height ?? innerHeight;
    const bounds = panel.current?.getBoundingClientRect();
    return { left: Math.max(x + 8, Math.min(left, x + width - (bounds?.width ?? 380) - 8)), top: Math.max(y + 8, Math.min(top, y + height - (bounds?.height ?? 300) - 8)) };
  }
  useLayoutEffect(() => {
    if (!open) return;
    const resize = () => setPosition(previous => clamp(previous.left, previous.top));
    resize(); window.addEventListener('resize', resize); window.visualViewport?.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('scroll', resize);
    return () => { window.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('scroll', resize); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
        if (panel.current?.contains(document.activeElement)) trigger.current?.focus();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, [open]);
  function move(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    setPosition(clamp(drag.current.left + event.clientX - drag.current.x, drag.current.top + event.clientY - drag.current.y));
  }
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const clips = SOUNDBOARD_CLIPS.filter(clip => normalize(clip.name).includes(normalize(query)));
  return <>
    <button ref={trigger} className="chat-audio-button soundboard-trigger" aria-label={open ? 'Ocultar soundboard' : 'Abrir soundboard'} title="Soundboard: compartir audios con la sala" aria-expanded={open} aria-controls={id} onClick={() => {
      if (!open) setPosition({ left: Math.max(8, (window.visualViewport?.width ?? innerWidth) - 400), top: 80 });
      setOpen(previous => !previous);
    }}><AudioLines size={17} /><span>Soundboard</span></button>
    {open && createPortal(<section ref={panel} id={id} className="soundboard-panel" aria-labelledby={titleId} style={position}>
      <div className="account-heading"><button className="soundboard-drag" aria-label="Mover soundboard" title="Arrastra para mover" onPointerDown={event => {
        if (event.button !== 0) return;
        drag.current = { x: event.clientX, y: event.clientY, ...position }; event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}><Grip size={18} /></button><h2 id={titleId}><AudioLines size={21} />Soundboard</h2><button className="icon-button" aria-label="Cerrar soundboard" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={18} /></button></div>
      <p>Estos audios suenan para toda la sala. Al silenciar el soundboard no escuchas ni puedes enviar audios. El volumen solo cambia lo que vos escuchas.</p>
      <div className="soundboard-controls"><button className="button secondary" disabled={busy} aria-label={muted ? 'Activar soundboard' : 'Silenciar soundboard'} onClick={onToggle}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}{muted ? 'Soundboard silenciado' : 'Sonido activado'}</button><label>Volumen del soundboard<input aria-label="Volumen del soundboard" type="range" min="0" max="100" value={Math.round(volume * 100)} onChange={event => onVolume(Number(event.target.value) / 100)} /><span>{Math.round(volume * 100)}%</span></label></div>
      <label className="soundboard-search"><Search size={16} /><span className="sr-only">Buscar audio</span><input aria-label="Buscar audio" type="search" placeholder="Buscar audio…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="soundboard-clips">{clips.map(clip => <button className="button secondary" key={clip.id} disabled={!canSend || muted} onClick={() => void onSend(clip.id)}>{clip.name}</button>)}{!clips.length && <p>No encontramos ese audio.</p>}</div>
      <p className="soundboard-status">{muted ? 'Activa el soundboard para escuchar y enviar audios.' : !canSend ? 'No puedes enviar audios mientras estás desconectado o silenciado por el anfitrión.' : 'Puedes seguir usando el chat y el dibujo. Arrastra el agarre para mover este panel.'}</p>
    </section>, document.body)}
  </>;
}
