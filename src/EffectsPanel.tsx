import { useEffect, useId, useRef, useState } from 'react';
import { Volume2, VolumeX, X } from 'lucide-react';

export function EffectsPanel({ muted, volume, busy, onToggle, onVolume }: {
  muted: boolean; volume: number; busy: boolean;
  onToggle: () => void; onVolume: (value: number) => void;
}) {
  const id = useId(); const titleId = useId();
  const trigger = useRef<HTMLButtonElement>(null); const panel = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  function place() {
    const button = trigger.current?.getBoundingClientRect(); const bounds = panel.current?.getBoundingClientRect();
    if (!button || !bounds) return;
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight;
    setPosition({
      left: Math.max(left + 8, Math.min(button.right - bounds.width, left + width - bounds.width - 8)),
      top: Math.max(top + 8, Math.min(button.bottom + 8, top + height - bounds.height - 8)),
    });
  }
  useEffect(() => {
    if (!open) return;
    place();
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place); window.visualViewport?.addEventListener('scroll', place);
    return () => {
      window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place); window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [open, muted]);
  return <>
    <button ref={trigger} className="chat-audio-button game-audio-toggle" aria-label={open ? 'Ocultar efectos' : 'Abrir efectos'} title="Efectos del juego: volumen y silencio" popoverTarget={id} aria-expanded={open} aria-controls={id}>
      {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}<span>Efectos</span>
    </button>
    <section ref={panel} id={id} popover="auto" className="effects-panel" role="region" aria-labelledby={titleId} style={position} onToggle={event => setOpen(event.newState === 'open')}>
      <div className="account-heading"><h2 id={titleId}>Efectos del juego</h2><button className="icon-button" aria-label="Cerrar efectos" popoverTarget={id} popoverTargetAction="hide"><X size={18} /></button></div>
      <p>Aciertos, reportes y final de partida.</p>
      <button className="button secondary" aria-label={muted ? 'Activar sonidos' : 'Silenciar sonidos'} aria-pressed={!muted} disabled={busy} onClick={onToggle}>
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}{muted ? 'Activar sonidos' : 'Silenciar sonidos'}
      </button>
      {!muted && <label className="effects-volume">Volumen<input aria-label="Volumen de efectos" type="range" min="0" max="100" value={Math.round(volume * 100)} onChange={event => onVolume(Number(event.target.value) / 100)} /><span>{Math.round(volume * 100)}%</span></label>}
    </section>
  </>;
}
