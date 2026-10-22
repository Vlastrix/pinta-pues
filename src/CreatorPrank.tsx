import { useEffect, useId, useRef, useState } from 'react';
import { Crown } from 'lucide-react';

export function CreatorPrank({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId();
  const [attempts, setAttempts] = useState(0);
  const [position, setPosition] = useState({ x: .5, y: .5 });
  useEffect(() => {
    const element = dialog.current!; element.showModal();
    return () => element.close();
  }, []);
  function dismiss() {
    if (attempts >= 2) { dialog.current?.close(); onClose(); }
    else {
      setAttempts(value => value + 1);
      setPosition(previous => {
        for (let attempt = 0; attempt < 8; attempt++) {
          const next = { x: Math.random(), y: Math.random() };
          if (Math.hypot(next.x - previous.x, next.y - previous.y) >= .5) return next;
        }
        return { x: previous.x < .5 ? 1 : 0, y: previous.y < .5 ? 1 : 0 };
      });
    }
  }
  return <dialog ref={dialog} className="creator-prank" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); dismiss(); }}>
    <Crown size={36} aria-hidden="true" />
    <h2 id={titleId}>¡Al creador se lo respeta, pues!</h2>
    <p>No se puede insultar al creador… por lo menos no sin pasar por este trámite. 😌</p>
    <p className="creator-prank-reminder" aria-live="polite">{['Te toca cerrar esto tres veces. Por fresco.', '¿Ya reflexionaste? Todavía faltan dos.', 'Bueno, última firma y quedamos en paz.'][attempts]}</p>
    <div className="creator-prank-playground">
      <button className="button primary" style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%`, transform: `translate(-${position.x * 100}%, -${position.y * 100}%)` }} onClick={dismiss}>Cerrar ({attempts + 1}/3)</button>
    </div>
  </dialog>;
}
