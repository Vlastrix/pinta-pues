import { useEffect, useRef, useState } from 'react';
import { Shield, VolumeX, Volume2, UserRoundX, X } from 'lucide-react';
import type { Player } from '../shared/types';

export function ModerationDialog({ player, onClose, onAction }: {
  player: Player | null; onClose: () => void; onAction: (target: string, action: 'kick' | 'mute' | 'unmute') => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null); const [confirmKick, setConfirmKick] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => {
    setConfirmKick(false);
    if (player) dialog.current?.showModal(); else dialog.current?.close();
  }, [player?.id]);
  async function act(action: 'kick' | 'mute' | 'unmute') {
    if (!player) return;
    setBusy(true);
    try { if (await onAction(player.id, action)) dialog.current?.close(); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="moderation-dialog" aria-labelledby="moderation-title" onClose={onClose}>
    <div className="account-heading"><h2 id="moderation-title"><Shield size={19} />{player?.name}</h2><button className="icon-button" aria-label="Cerrar moderación" onClick={() => dialog.current?.close()}><X size={18} /></button></div>
    {confirmKick ? <><p>¿Expulsar a <strong>{player?.name}</strong>? No podrá volver a esta sala con la misma cuenta o navegador.</p><div className="moderation-actions"><button className="button secondary" disabled={busy} onClick={() => setConfirmKick(false)}>Cancelar</button><button className="button danger" disabled={busy} onClick={() => void act('kick')}>Sí, expulsar</button></div></> : <div className="moderation-actions">
      <p>Silenciar el chat también bloquea sus envíos al soundboard.</p>
      <button className="button secondary" disabled={busy} onClick={() => void act(player?.muted ? 'unmute' : 'mute')}>{player?.muted ? <Volume2 size={17} /> : <VolumeX size={17} />}{player?.muted ? 'Habilitar chat' : 'Silenciar chat'}</button>
      <button className="button danger" disabled={busy} onClick={() => setConfirmKick(true)}><UserRoundX size={17} />Expulsar de la sala</button>
    </div>}
  </dialog>;
}
