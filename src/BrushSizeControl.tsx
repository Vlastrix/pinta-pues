import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { MAX_BRUSH_SIZE } from '../shared/types';

export function BrushSizeControl({ size, disabled, onChange }: { size: number; disabled: boolean; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return <div className="brush-size"><label htmlFor="brush-size">Grosor</label><div className="brush-size-stepper" title="Sobre el lienzo: + / - o rueda del mouse">
    <button type="button" aria-label="Reducir grosor" disabled={disabled || size <= 2} onClick={() => onChange(Math.max(2, size - 1))}><Minus size={14} /></button>
    <input id="brush-size" aria-label="Grosor del pincel" type="number" inputMode="numeric" min="2" max={MAX_BRUSH_SIZE} step="1" disabled={disabled} value={draft ?? size}
      onFocus={event => setDraft(event.currentTarget.value)}
      onChange={event => { setDraft(event.currentTarget.value); const value = event.currentTarget.valueAsNumber; if (Number.isInteger(value) && value >= 2 && value <= MAX_BRUSH_SIZE) onChange(value); }}
      onBlur={event => { const value = event.currentTarget.valueAsNumber; if (Number.isFinite(value)) onChange(Math.max(2, Math.min(MAX_BRUSH_SIZE, Math.round(value)))); setDraft(null); }}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } else if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.value = String(size); event.currentTarget.blur(); } }} />
    <button type="button" aria-label="Aumentar grosor" disabled={disabled || size >= MAX_BRUSH_SIZE} onClick={() => onChange(Math.min(MAX_BRUSH_SIZE, size + 1))}><Plus size={14} /></button>
  </div></div>;
}
