import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { WIDTH, HEIGHT, DRAW_INTERVAL_MS, CURSOR_INTERVAL_MS, type DrawAction, type DrawingCursor as Cursor, type Point, type Tool } from '../shared/types';
import { DrawingScene, RENDER_SCALE } from './DrawingScene';
import { DrawingCursor } from './DrawingCursor';
import { TEXT_FONT, textLayout } from './canvasText';
import './excalifont.css';

type Props = {
  actions: DrawAction[]; enabled: boolean; tool: Tool; color: string; size: number;
  onAction: (action: DrawAction) => Promise<boolean>;
  onSizeChange: (delta: number) => void;
  remoteCursor: Cursor | null; onCursor: (cursor: Cursor | null) => void;
};
export function Canvas({ actions, enabled, tool, color, size, onAction, onSizeChange, remoteCursor, onCursor }: Props) {
  const base = useRef<HTMLCanvasElement>(null); const overlay = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<DrawAction | null>(null); const lastSent = useRef(0);
  const freshPoints = useRef(0);
  const strokeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rendered = useRef<DrawAction[]>([]);
  const confirmed = useRef(new Set<string>());
  const scene = useRef<DrawingScene | null>(null);
  const pending = useRef<{ action: DrawAction; acknowledged: boolean }[]>([]);
  const paintFrame = useRef<number | null>(null);
  const paintLatest = useRef<() => void>(() => {});
  const selectionVisible = useRef(false);
  const [confirmationVersion, setConfirmationVersion] = useState(0);
  const [fontVersion, setFontVersion] = useState(0);
  const [editor, setEditor] = useState<DrawAction | null>(null);
  const editorInput = useRef<HTMLTextAreaElement>(null);
  const editing = useRef<DrawAction | null>(null); editing.current = editor;
  const committing = useRef(false);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    let active = true;
    void document.fonts.load(`24px Excalifont`, 'Árbol ñ ¿hola?').then(() => { if (active) { rendered.current = []; setFontVersion(value => value + 1); } }).catch(() => {});
    const observer = new ResizeObserver(() => setScale((overlay.current?.getBoundingClientRect().width ?? WIDTH) / WIDTH));
    observer.observe(overlay.current!);
    return () => {
      active = false; observer.disconnect();
      if (paintFrame.current !== null) cancelAnimationFrame(paintFrame.current);
      paintFrame.current = null;
    };
  }, []);
  useLayoutEffect(() => { if (editor) editorInput.current?.focus(); }, [editor?.id]);
  async function finishText() {
    const action = editing.current;
    if (!action || committing.current || !enabled) return;
    if (!action.text?.trim()) { setEditor(null); return; }
    committing.current = true;
    try {
      if (await sender.current({ ...action, text: action.text.trim() })) setEditor(previous => previous?.id === action.id ? null : previous);
      else if (editing.current?.id === action.id) editorInput.current?.focus();
    } finally { committing.current = false; }
  }
  const actionKey = (action: DrawAction) => `${action.id}:${action.segment ?? 0}`;
  const sender = useRef(onAction); sender.current = onAction;
  const cursorSender = useRef(onCursor); cursorSender.current = onCursor;
  const [localCursor, setLocalCursor] = useState<Cursor | null>(null);
  const pendingCursor = useRef<Cursor | null>(null); const lastCursorSent = useRef(0);
  const cursorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cursorMotionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cursorFrame = useRef<number | null>(null);
  const resizeBrush = useRef(onSizeChange); resizeBrush.current = onSizeChange;
  useEffect(() => {
    const canvas = overlay.current;
    if (!enabled || !canvas) return;
    const blocked = (event: KeyboardEvent | WheelEvent) => {
      const focused = document.activeElement;
      return event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]') ||
        (focused instanceof HTMLElement && focused.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
    };
    const keydown = (event: KeyboardEvent) => {
      if (!canvas.matches(':hover') || event.isComposing || blocked(event)) return;
      const delta = ['+', '='].includes(event.key) ? 1 : event.key === '-' ? -1 : 0;
      if (delta) { event.preventDefault(); resizeBrush.current(delta); }
    };
    const wheel = (event: WheelEvent) => {
      if (!event.deltaY || blocked(event)) return;
      event.preventDefault(); resizeBrush.current(event.deltaY < 0 ? 1 : -1);
    };
    window.addEventListener('keydown', keydown);
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => { window.removeEventListener('keydown', keydown); canvas.removeEventListener('wheel', wheel); };
  }, [enabled]);
  useEffect(() => {
    if (enabled && pendingCursor.current) publishCursor({ ...pendingCursor.current, size, tool, color }, true);
  }, [enabled, size, tool, color]);
  function publishCursor(cursor: Cursor | null, immediate = false) {
    clearTimeout(cursorMotionTimer.current); cursorMotionTimer.current = undefined;
    if (cursor?.drawing) cursorMotionTimer.current = setTimeout(() => {
      const latest = pendingCursor.current;
      if (latest?.drawing) publishCursor({ ...latest, drawing: false }, true);
    }, 180);
    pendingCursor.current = cursor;
    if (!cursor || immediate) {
      if (cursorFrame.current !== null) cancelAnimationFrame(cursorFrame.current);
      cursorFrame.current = null; setLocalCursor(cursor);
    } else if (cursorFrame.current === null) cursorFrame.current = requestAnimationFrame(() => {
      cursorFrame.current = null; setLocalCursor(pendingCursor.current);
    });
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
      clearTimeout(cursorMotionTimer.current); cursorMotionTimer.current = undefined;
      clearTimeout(cursorTimer.current); cursorTimer.current = undefined; pendingCursor.current = null; setLocalCursor(null);
      if (enabled) cursorSender.current(null);
    };
    window.addEventListener('blur', hide);
    return () => {
      clearTimeout(strokeTimer.current); window.removeEventListener('blur', hide); hide();
      if (cursorFrame.current !== null) cancelAnimationFrame(cursorFrame.current);
      cursorFrame.current = null;
    };
  }, [enabled]);
  useLayoutEffect(() => {
    const previous = rendered.current;
    // App only appends immutable actions or replaces the complete authoritative snapshot.
    const append = previous.length <= actions.length && (!previous.length || previous.at(-1) === actions[previous.length - 1]);
    const additions = append ? actions.slice(previous.length) : actions;
    scene.current ??= new DrawingScene();
    scene.current.update(actions, !append || !previous.length);
    rendered.current = actions;
    if (!append) confirmed.current.clear();
    for (const action of additions) confirmed.current.add(actionKey(action));
    pending.current = pending.current.filter(item => !item.acknowledged && !confirmed.current.has(actionKey(item.action)));
    preview();
  }, [actions, confirmationVersion, fontVersion]);
  useLayoutEffect(() => {
    clearTimeout(strokeTimer.current); strokeTimer.current = undefined;
    stroke.current = null;
    setEditor(null);
    if (!enabled) pending.current = [];
    preview();
  }, [enabled, tool]);
  function position(event: Pick<PointerEvent<HTMLCanvasElement>, 'currentTarget' | 'clientX' | 'clientY'>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(WIDTH, (event.clientX - rect.left) * WIDTH / rect.width)), y: Math.max(0, Math.min(HEIGHT, (event.clientY - rect.top) * HEIGHT / rect.height)) };
  }
  function preview() {
    if (paintFrame.current !== null) return;
    paintFrame.current = requestAnimationFrame(() => { paintFrame.current = null; paintLatest.current(); });
  }
  function paint() {
    if (!base.current || !overlay.current) return;
    const extra = pending.current.map(item => item.action);
    if (stroke.current && stroke.current.tool !== 'text') extra.push(stroke.current);
    // One composition per animation frame, including speculative input. Server
    // confirmations never trigger a second full-size canvas copy underneath it.
    const baseContext = base.current.getContext('2d')!;
    baseContext.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    scene.current?.draw(baseContext, extra);
    const ctx = overlay.current.getContext('2d')!;
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    if (selectionVisible.current) ctx.clearRect(0, 0, WIDTH, HEIGHT);
    selectionVisible.current = stroke.current?.tool === 'text';
    if (stroke.current?.tool === 'text') {
      const [start, end = start] = stroke.current.points;
      ctx.save(); ctx.strokeStyle = '#7560b7'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y); ctx.restore();
    }
  }
  paintLatest.current = paint;
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
    if (!action || !['brush', 'eraser'].includes(action.tool) || !freshPoints.current) return;
    submit({ ...action, points: [...action.points] });
    action.segment = (action.segment ?? 0) + 1;
    action.points = action.points.slice(-2); freshPoints.current = 0; lastSent.current = Date.now();
    preview();
  }
  function down(event: PointerEvent<HTMLCanvasElement>) {
    if (!enabled || event.button !== 0 || stroke.current) return;
    trackCursor(event, true, true);
    const point = position(event);
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const action: DrawAction = { id, segment: 0, tool, color, size, points: [point], ...(['brush', 'eraser'].includes(tool) ? { smooth: true } : {}) };
    if (tool === 'fill') { sender.current(action); return; }
    event.currentTarget.setPointerCapture(event.pointerId);
    stroke.current = action; freshPoints.current = 0; lastSent.current = Date.now();
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
      // Browsers can combine several pen/mouse samples into one pointermove.
      const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
      for (const sample of samples) addPoint(position({ currentTarget: event.currentTarget, clientX: sample.clientX, clientY: sample.clientY }));
      addPoint(point);
      if (freshPoints.current && Date.now() - lastSent.current >= DRAW_INTERVAL_MS) flushStroke();
      else if (freshPoints.current && !strokeTimer.current) strokeTimer.current = setTimeout(flushStroke, DRAW_INTERVAL_MS - (Date.now() - lastSent.current));
    } else action.points = [action.points[0], point];
    preview();
  }
  function addPoint(point: Point) {
    const action = stroke.current;
    if (!action) return;
    const last = action.points.at(-1)!;
    if (Math.hypot(point.x - last.x, point.y - last.y) < .5) return;
    action.points.push(point); freshPoints.current++;
    if (action.points.length >= 128) flushStroke();
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
      if (action.tool === 'brush' || action.tool === 'eraser') { addPoint(point); action.finished = true; }
      else action.points = [action.points[0], point];
      if (action.tool === 'text' && event.type !== 'pointercancel') {
        const start = action.points[0];
        let left = Math.min(start.x, point.x), top = Math.min(start.y, point.y);
        const width = Math.max(36, Math.abs(point.x - start.x) < 8 ? 240 : Math.abs(point.x - start.x));
        const height = Math.max(30, Math.abs(point.y - start.y) < 8 ? 90 : Math.abs(point.y - start.y));
        left = Math.min(left, WIDTH - width); top = Math.min(top, HEIGHT - height);
        setEditor({ ...action, points: [{ x: left, y: top }, { x: left + width, y: top + height }], text: '' });
        publishCursor(null);
      } else if (action.tool !== 'text') submit({ ...action, points: [...action.points] });
    }
    stroke.current = null; preview();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return <div className={`canvas-stack ${enabled ? 'can-draw' : ''}`}>
    <canvas ref={base} width={WIDTH * RENDER_SCALE} height={HEIGHT * RENDER_SCALE} aria-label="Dibujo de la partida" />
    <canvas ref={overlay} width={WIDTH * RENDER_SCALE} height={HEIGHT * RENDER_SCALE} aria-label={enabled ? 'Lienzo para dibujar' : 'Lienzo de solo lectura'}
      onPointerEnter={event => { if (enabled) trackCursor(event, Boolean(stroke.current), true); }}
      onPointerLeave={() => { if (enabled) publishCursor(null); }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
    {editor && enabled && <textarea ref={editorInput} className="canvas-text-editor" aria-label="Texto para el lienzo" placeholder="Escribí aquí…" maxLength={50} value={editor.text} spellCheck={false}
      style={{ left: `${editor.points[0].x / WIDTH * 100}%`, top: `${editor.points[0].y / HEIGHT * 100}%`, width: `${(editor.points[1].x - editor.points[0].x) / WIDTH * 100}%`, height: `${(editor.points[1].y - editor.points[0].y) / HEIGHT * 100}%`, color: editor.color, fontFamily: TEXT_FONT, fontSize: textLayout(overlay.current!.getContext('2d')!, editor.text || 'Texto', editor.points[1].x - editor.points[0].x, editor.points[1].y - editor.points[0].y).size * scale }}
      onChange={event => setEditor(previous => previous ? { ...previous, text: event.target.value } : null)} onBlur={() => void finishText()}
      onKeyDown={event => { if (event.nativeEvent.isComposing) return; if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setEditor(null); } else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void finishText(); } }} />}
    {!editor && (enabled ? localCursor : remoteCursor) && <DrawingCursor cursor={(enabled ? localCursor : remoteCursor)!} />}
  </div>;
}
