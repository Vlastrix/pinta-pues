import { memo, useId, useMemo, useRef, useState } from 'react';
import { Avatar, Style } from '@dicebear/core';
import bottts from '@dicebear/styles/bottts.json' with { type: 'json' };
import { Check, Shuffle, X } from 'lucide-react';
import { DEFAULT_AVATAR } from '../shared/types';

const style = new Style(bottts);
const initialSeeds = Array.from({ length: 18 }, (_, i) => `pinta-pues-${i + 1}`);

export const AvatarImage = memo(function AvatarImage({ seed = DEFAULT_AVATAR, alt = '' }: { seed?: string; alt?: string }) {
  const src = useMemo(() => new Avatar(style, { seed, size: 96 }).toDataUri(), [seed]);
  return <img src={src} alt={alt} width={40} height={40} draggable={false} />;
});

export function AvatarPicker({ value, onChange }: { value: string; onChange: (seed: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId(); const dialogId = useId();
  const [open, setOpen] = useState(false);
  const [seeds, setSeeds] = useState(initialSeeds);
  function show() {
    // Keep the saved choice visible, including avatars from a previous shuffle.
    setSeeds(previous => previous.includes(value) ? previous : [value, ...previous.slice(0, 17)]);
    dialog.current?.showModal(); setOpen(true);
  }
  function shuffle() {
    const random = crypto.getRandomValues(new Uint32Array(17));
    setSeeds([value, ...Array.from(random, item => `pinta-${item.toString(36)}`)]);
  }
  return <>
    <button type="button" className="avatar-trigger" aria-label="Elegir avatar" title="Elegir avatar" aria-haspopup="dialog" aria-controls={dialogId} aria-expanded={open} onClick={show}>
      <AvatarImage seed={value} />
    </button>
    <dialog ref={dialog} id={dialogId} className="avatar-dialog" aria-labelledby={titleId} onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="avatar-dialog-content">
        <div className="avatar-dialog-heading"><h2 id={titleId}>Elegí tu avatar</h2><button type="button" className="icon-button" aria-label="Cerrar selector de avatar" onClick={() => dialog.current?.close()}><X size={18} /></button></div>
        <div className="avatar-options">{seeds.map((seed, i) => <button type="button" key={seed} className={`avatar-option ${seed === value ? 'selected' : ''}`} aria-label={`Avatar ${i + 1}`} aria-pressed={seed === value} onClick={() => { onChange(seed); dialog.current?.close(); }}>
          <AvatarImage seed={seed} />{seed === value && <span className="avatar-check"><Check size={10} /></span>}
        </button>)}</div>
        <button type="button" className="button secondary shuffle-avatars" onClick={shuffle}><Shuffle size={15} />Ver más avatares</button>
      </div>
    </dialog>
  </>;
}
