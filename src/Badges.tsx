import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { BADGES, type BadgeId } from '../shared/badges';

export function Badges({ ids = [] }: { ids?: readonly BadgeId[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<typeof BADGES[number] | null>(null);
  const earned = BADGES.filter(badge => ids.includes(badge.id));
  if (!earned.length) return null;
  return <>
    <span className="badge-list" aria-label="Insignias">{earned.map(badge => <button type="button" className="badge-icon" key={badge.id} title={badge.name} aria-label={`Insignia: ${badge.name}`} aria-haspopup="dialog" onClick={() => { setSelected(badge); dialog.current?.showModal(); }}><span aria-hidden="true">{badge.icon}</span></button>)}</span>
    <dialog ref={dialog} className="badge-dialog" aria-label="Detalle de insignia" onClose={() => setSelected(null)}>
      <div className="account-heading"><h2>{selected?.icon} {selected?.name}</h2><button type="button" className="icon-button" aria-label="Cerrar insignia" onClick={() => dialog.current?.close()}><X size={18} /></button></div>
      <p>{selected?.description}</p>
    </dialog>
  </>;
}

export function BadgeCollection({ ids = [] }: { ids?: readonly BadgeId[] }) {
  return <section className="badge-collection" aria-label="Mis insignias"><h3>Mis insignias · {ids.length}/{BADGES.length}</h3>
    <p>Se desbloquean al terminar partidas con tu cuenta. Son de broma y no cambian tus puntos.</p>
    <div>{BADGES.map(badge => <article key={badge.id} className={ids.includes(badge.id) ? 'badge-earned' : 'badge-locked'}>
      <span aria-hidden="true">{badge.icon}</span><div><strong>{badge.name}</strong><small>{ids.includes(badge.id) ? 'Conseguida' : 'Por conseguir'}</small><p>{badge.description}</p></div>
    </article>)}</div>
  </section>;
}
