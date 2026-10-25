import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ImagePlus, Move, Pencil, Trash2 } from 'lucide-react';
import { WIDTH, HEIGHT } from '../shared/types';

type Reference = { url: string; width: number; height: number };

// This image never enters the drawing canvas, actions, sockets or storage.
export function useTracingImage(turn: string | null, enabled: boolean) {
  const [image, setImage] = useState<Reference | null>(null);
  const [opacity, setOpacity] = useState(35);
  const [size, setSize] = useState(100);
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const url = useRef<string | null>(null);
  const request = useRef(0);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const [scope, setScope] = useState(turn);

  function clear() {
    request.current++;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    drag.current = null;
    setImage(null); setMoving(false); setError('');
  }
  useEffect(() => {
    clear(); setScope(turn);
    return () => { request.current++; if (url.current) URL.revokeObjectURL(url.current); url.current = null; };
  }, [turn]);

  async function load(file: File) {
    const version = ++request.current;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(file.type)) {
      setError('Usá una imagen PNG, JPG, WebP, GIF o AVIF.'); return;
    }
    if (file.size > 12 * 1024 * 1024) { setError('La imagen debe pesar como máximo 12 MB.'); return; }
    const next = URL.createObjectURL(file);
    try {
      const decoded = new Image(); decoded.src = next;
      await decoded.decode();
      if (version !== request.current) { URL.revokeObjectURL(next); return; }
      if (decoded.naturalWidth * decoded.naturalHeight > 24_000_000) throw new Error('large');
      const fit = Math.min(80 / decoded.naturalWidth, 80 * HEIGHT / WIDTH / decoded.naturalHeight);
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = next;
      setImage({ url: next, width: decoded.naturalWidth * fit, height: decoded.naturalHeight * fit * WIDTH / HEIGHT });
      setPosition({ x: 50, y: 50 }); setSize(100); setOpacity(35); setMoving(false); setError('');
    } catch {
      URL.revokeObjectURL(next);
      if (version === request.current) setError('No se pudo abrir la imagen. Probá otra de hasta 24 megapíxeles.');
    }
  }
  function place(x: number, y: number) {
    setPosition({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
    place(start.left + (event.clientX - start.x) / bounds.width * 100, start.top + (event.clientY - start.y) / bounds.height * 100);
  }
  const visible = Boolean(turn && scope === turn && enabled && image);
  return {
    moving: visible && moving,
    controls: enabled && turn && <div className="tracing-controls">
      <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif,image/avif" aria-label="Imagen para calcar" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void load(file); }} />
      <button type="button" className="button secondary" onClick={() => input.current?.click()}><ImagePlus size={17} />{visible ? 'Cambiar referencia' : 'Imagen para calcar'}</button>
      {visible && <>
        <button type="button" className="button secondary" aria-pressed={moving} onClick={() => { drag.current = null; setMoving(value => !value); }}>{moving ? <Pencil size={17} /> : <Move size={17} />}{moving ? 'Volver a dibujar' : 'Mover imagen'}</button>
        <label>Opacidad <output>{opacity}%</output><input type="range" aria-label="Opacidad de la referencia" min="0" max="100" value={opacity} onChange={event => setOpacity(Number(event.target.value))} /></label>
        <label>Tamaño <output>{size}%</output><input type="range" aria-label="Tamaño de la referencia" min="20" max="200" value={size} onChange={event => setSize(Number(event.target.value))} /></label>
        <button type="button" className="tool-button" aria-label="Quitar referencia" title="Quitar referencia" onClick={clear}><Trash2 size={18} /></button>
      </>}
      <small>{moving && visible ? 'Arrastrá la imagen o movela con las flechas. Después volvé a dibujar.' : 'Referencia privada: solo vos la ves.'}</small>
      {error && <small role="alert">{error}</small>}
    </div>,
    overlay: visible && image && <div className={`tracing-layer${moving ? ' is-moving' : ''}`}>
      <button type="button" className="tracing-image" aria-label="Mover imagen de referencia" disabled={!moving} tabIndex={moving ? 0 : -1}
        style={{ left: `${position.x}%`, top: `${position.y}%`, width: `${image.width * size / 100}%`, height: `${image.height * size / 100}%` }}
        onPointerDown={event => { if (!moving) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: position.x, top: position.y }; }}
        onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={event => { const delta = event.shiftKey ? 5 : 1; if (event.key.startsWith('Arrow')) { event.preventDefault(); event.stopPropagation(); place(position.x + (event.key === 'ArrowRight' ? delta : event.key === 'ArrowLeft' ? -delta : 0), position.y + (event.key === 'ArrowDown' ? delta : event.key === 'ArrowUp' ? -delta : 0)); } }}>
        <img src={image.url} alt="Referencia privada para calcar" draggable={false} style={{ opacity: opacity / 100 }} />
      </button>
    </div>,
  };
}
