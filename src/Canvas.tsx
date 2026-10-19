import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { WIDTH, HEIGHT, DRAW_INTERVAL_MS, CURSOR_INTERVAL_MS, type DrawAction, type DrawingCursor as Cursor, type Point, type Tool } from '../shared/types';
import { blank, renderAction } from './drawing';
import { DrawingCursor } from './DrawingCursor';

type Props = {
  actions: DrawAction[]; enabled: boolean; tool: Tool; color: string; size: number; text: string;
  onAction: (action: DrawAction) => Promise<boolean>;
  remoteCursor: Cursor | null; onCursor: (cursor: Cursor | null) => void;
};
export function Canvas({ actions, enabled, tool, color, size, text, onAction, remoteCursor, onCursor }: Props) {
  const base = useRef<HTMLCanvasElement>(null); const overlay = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<DrawAction | null>(null); const lastSent = useRef(0);
  const strokeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rendered = useRef<DrawAction[]>([]);
  const confirmed = useRef(new Set<string>());
  const scratch = useRef<HTMLCanvasElement | null>(null);
  const pending = useRef<{ action: DrawAction; acknowledged: boolean }[]>([]);
  const [confirmationVersion, setConfirmationVersion] = useState(0);
  const actionKey = (action: DrawAction) => `${action.id}:${action.segment ?? 0}`;
  const sender = useRef(onAction); sender.current = onAction;
  const cursorSender = useRef(onCursor); cursorSender.current = onCursor;
  const [localCursor, setLocalCursor] = useState<Cursor | null>(null);
  const pendingCursor = useRef<Cursor | null>(null); const lastCursorSent = useRef(0);
  const cursorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function publishCursor(cursor: Cursor | null, immediate = false) {
    setLocalCursor(cursor); pendingCursor.current = cursor;
    const send = () => {
      clearTimeout(cursorTimer.current); cursorTimer.current = undefined;
      lastCursorSent.current = Date.now(); cursorSender.current(pendingCursor.current);
    };
    if (!cursor || immediate || Date.now() - lastCursorSent.current >= CURSOR_INTERVAL_MS) send();
    else if (!cursorTimer.current) cursorTimer.current = setTimeout(send, CURSOR_INTERVAL_MS - (Date.now() - lastCursorSent.current));
  }
  function trackCursor(event: PointerEvent<HTMLCanvasElement>, drawing: boolean, immediate = false) {
    const rect = event.currentTarget.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    publishCursor(inside ? { point: position(event), tool, color, size, drawing } : null, immediate);
  }
  useEffect(() => {
    if (!enabled) setLocalCursor(null);
    const hide = () => {
      clearTimeout(cursorTimer.current); cursorTimer.current = undefined; pendingCursor.current = null; setLocalCursor(null);
      if (enabled) cursorSender.current(null);
    };
    window.addEventListener('blur', hide);
    return () => { clearTimeout(strokeTimer.current); window.removeEventListener('blur', hide); hide(); };
  }, [enabled]);
  useLayoutEffect(() => {
    const ctx = base.current!.getContext('2d')!;
    const previous = rendered.current;
    // App only appends immutable actions or replaces the complete authoritative snapshot.
    const append = previous.length <= actions.length && (!previous.length || previous.at(-1) === actions[previous.length - 1]);
    const additions = append ? actions.slice(previous.length) : actions;
    if (!append || !previous.length) {
      if (!scratch.current) {
        scratch.current = document.createElement('canvas');
        scratch.current.width = WIDTH; scratch.current.height = HEIGHT;
      }
      const buffer = scratch.current.getContext('2d')!;
      blank(buffer);
      for (const action of actions) renderAction(buffer, action);
      // Replace the complete board in one operation instead of showing an empty intermediate frame.
      ctx.drawImage(scratch.current, 0, 0);
    } else for (const action of additions) renderAction(ctx, action);
    rendered.current = actions;
    if (!append) confirmed.current.clear();
    for (const action of additions) confirmed.current.add(actionKey(action));
    pending.current = pending.current.filter(item => !item.acknowledged && !confirmed.current.has(actionKey(item.action)));
    preview();
  }, [actions, confirmationVersion]);
  useLayoutEffect(() => {
    clearTimeout(strokeTimer.current); strokeTimer.current = undefined;
    stroke.current = null;
    if (!enabled) pending.current = [];
    preview();
  }, [enabled, tool]);
  function position(event: PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(WIDTH, (event.clientX - rect.left) * WIDTH / rect.width)), y: Math.max(0, Math.min(HEIGHT, (event.clientY - rect.top) * HEIGHT / rect.height)) };
  }
  function preview() {
    const ctx = overlay.current!.getContext('2d')!;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    for (const item of pending.current) renderAction(ctx, item.action);
    if (stroke.current) renderAction(ctx, stroke.current);
  }
  function submit(action: DrawAction) {
    const item = { action, acknowledged: false };
    pending.current.push(item);
    void sender.current(action).then(accepted => {
      if (!base.current) return;
      if (accepted) item.acknowledged = true;
      else pending.current = pending.current.filter(entry => entry !== item);
      // Reconcile confirmations and the authoritative board together, before the next paint.
      setConfirmationVersion(version => version + 1);
    });
  }
  function flushStroke() {
    clearTimeout(strokeTimer.current); strokeTimer.current = undefined;
    const action = stroke.current;
    if (!action || !['brush', 'eraser'].includes(action.tool) || action.points.length < 2) return;
    submit({ ...action, points: [...action.points] });
    action.segment = (action.segment ?? 0) + 1;
    action.points = [action.points.at(-1)!]; lastSent.current = Date.now();
    preview();
  }
  function down(event: PointerEvent<HTMLCanvasElement>) {
    if (!enabled || event.button !== 0 || stroke.current) return;
    trackCursor(event, true, true);
    const point = position(event);
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const action: DrawAction = { id, segment: 0, tool, color, size, points: [point], ...(tool === 'text' ? { text } : {}) };
    // Keep the canvas's default pointer focus from stealing focus from the text input.
    if (tool === 'text') event.preventDefault();
    if (tool === 'fill' || tool === 'text') { sender.current(action); return; }
    event.currentTarget.setPointerCapture(event.pointerId);
    stroke.current = action; lastSent.current = Date.now();
    if (tool === 'brush' || tool === 'eraser') {
      submit({ ...action, points: [...action.points] }); action.segment = 1;
    }
    preview();
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    const action = stroke.current;
    if (!enabled) return;
    trackCursor(event, Boolean(action));
    if (!action) return;
    const point = position(event);
    if (tool === 'brush' || tool === 'eraser') {
      action.points.push(point);
      if (Date.now() - lastSent.current >= DRAW_INTERVAL_MS || action.points.length >= 128) flushStroke();
      else if (!strokeTimer.current) strokeTimer.current = setTimeout(flushStroke, DRAW_INTERVAL_MS - (Date.now() - lastSent.current));
    } else action.points = [action.points[0], point];
    preview();
  }
  function up(event: PointerEvent<HTMLCanvasElement>) {
    clearTimeout(strokeTimer.current); strokeTimer.current = undefined;
    if (enabled) {
      if (event.pointerType === 'touch' || event.type === 'pointercancel') publishCursor(null);
      else trackCursor(event, false, true);
    }
    const action = stroke.current;
    if (!action) return;
    if (enabled) {
      const point = position(event);
      if (action.tool === 'brush' || action.tool === 'eraser') action.points.push(point);
      else action.points = [action.points[0], point];
      submit({ ...action, points: [...action.points] });
    }
    stroke.current = null; preview();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return <div className={`canvas-stack ${enabled ? 'can-draw' : ''}`}>
    <canvas ref={base} width={WIDTH} height={HEIGHT} aria-label="Dibujo de la partida" />
    <canvas ref={overlay} width={WIDTH} height={HEIGHT} aria-label={enabled ? 'Lienzo para dibujar' : 'Lienzo de solo lectura'}
      onPointerEnter={event => { if (enabled) trackCursor(event, Boolean(stroke.current), true); }}
      onPointerLeave={() => { if (enabled) publishCursor(null); }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
    {(enabled ? localCursor : remoteCursor) && <DrawingCursor cursor={(enabled ? localCursor : remoteCursor)!} />}
  </div>;
}
