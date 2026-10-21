import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '../../src/Canvas';
import type { DrawAction } from '../../shared/types';

function DelayedCanvas({ size }: { size: number }) {
  const [actions, setActions] = useState<DrawAction[]>([]);
  const reject = useRef(false);
  return <>
    <Canvas actions={actions} enabled tool="brush" color="#292438" size={size} remoteCursor={null} onCursor={() => {}} onSizeChange={() => {}}
      onAction={action => {
        const rejected = reject.current;
        return new Promise<boolean>(resolve => setTimeout(() => {
          if (!rejected) setActions(previous => [...previous, structuredClone(action)]);
          resolve(!rejected);
        }, 220));
      }} />
    <button onClick={() => setActions(previous => structuredClone(previous))}>Resincronizar</button>
    <button onClick={() => setActions([])}>Limpiar prueba</button>
    <button onClick={() => { reject.current = true; }}>Rechazar trazos</button>
  </>;
}

export function mount(size = 8) {
  document.querySelector<HTMLElement>('.app-shell')!.style.display = 'none';
  const container = document.createElement('div');
  container.style.width = '960px'; document.body.append(container);
  createRoot(container).render(<DelayedCanvas size={size} />);
}
