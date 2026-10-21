import { useRef, useState } from 'react';
import { X } from 'lucide-react';

const qrPath = '/images/binance-qr.png';

export function DonationButton() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'error'>('loading');

  function show() {
    setImageState('loading');
    setOpen(true);
    dialog.current?.showModal();
  }

  return <>
    <button className="donation-link" aria-haspopup="dialog" onClick={show}>Apoyar Pinta Pues</button>
    <dialog ref={dialog} className="donation-dialog" aria-labelledby="donation-title" onClose={() => setOpen(false)}>
      <div className="account-heading">
        <h2 id="donation-title">Una ayudita para la tropa</h2>
        <button className="icon-button" aria-label="Cerrar donaciones" onClick={() => dialog.current?.close()}><X size={18} /></button>
      </div>
      <p>Si te gusta Pinta Pues, puedes apoyar el proyecto con una donación voluntaria por Binance. ¡Gracias por jugar, pues!</p>
      {open && <div className="donation-qr">
        {imageState === 'loading' && <p role="status">Cargando QR…</p>}
        {imageState === 'error' ? <p role="status">El QR de donaciones todavía no está disponible. ¡Gracias por querer apoyar!</p> :
          <img src={qrPath} alt="QR de Binance para donar a Pinta Pues" hidden={imageState !== 'ready'} onLoad={() => setImageState('ready')} onError={() => setImageState('error')} />}
      </div>}
      {imageState === 'ready' && <>
        <p>Escanea el QR desde Binance o guarda la imagen para abrirla desde tu celular.</p>
        <a className="button secondary" href={qrPath} download="pinta-pues-binance-qr.png">Guardar QR</a>
      </>}
    </dialog>
  </>;
}
