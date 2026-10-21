import { WIDTH, HEIGHT, type DrawAction, type Point } from '../shared/types';
import { blank, renderAction } from './drawing';

export const RENDER_SCALE = 2;
const isStroke = (action: DrawAction) => action.smooth && ['brush', 'eraser'].includes(action.tool);
const sameStroke = (a: DrawAction, b: DrawAction) => a.id === b.id && a.tool === b.tool && a.color === b.color && a.size === b.size;
function join(a: DrawAction, b: DrawAction): DrawAction {
  const overlap = (b.segment ?? 0) <= 1 ? 1 : 2;
  return { ...a, points: [...a.points, ...b.points.slice(overlap)], finished: b.finished };
}

/** Cache completed marks, but redraw the current stroke as one continuous path.
 * Overpainting round caps/antialiased edges per packet makes thin lines bumpy. */
export class DrawingScene {
  private background = document.createElement('canvas');
  private context: CanvasRenderingContext2D;
  private active: DrawAction | null = null;
  private previous: DrawAction[] = [];
  private revision = 0;
  private frames = new WeakMap<CanvasRenderingContext2D, { revision: number; action: DrawAction; path: Path2D }>();
  constructor() {
    this.background.width = WIDTH * RENDER_SCALE; this.background.height = HEIGHT * RENDER_SCALE;
    this.context = this.background.getContext('2d')!;
    this.context.scale(RENDER_SCALE, RENDER_SCALE); blank(this.context);
  }
  update(actions: DrawAction[], reset = false) {
    const append = !reset && this.previous.length <= actions.length && (!this.previous.length || this.previous.at(-1) === actions[this.previous.length - 1]);
    if (!append) { blank(this.context); this.active = null; this.revision++; }
    for (const action of append ? actions.slice(this.previous.length) : actions) {
      if (isStroke(action)) {
        if (this.active && sameStroke(this.active, action)) this.active = join(this.active, action);
        else { this.flush(); this.active = { ...action, segment: (action.segment ?? 0) <= 1 ? 1 : action.segment }; }
        if (action.finished) this.flush();
      } else { this.flush(); renderAction(this.context, action); this.revision++; }
    }
    this.previous = actions;
  }
  private flush() {
    if (this.active) { renderAction(this.context, { ...this.active, finished: true }); this.revision++; }
    this.active = null;
  }
  draw(ctx: CanvasRenderingContext2D, extra: DrawAction[] = []) {
    let combined = this.active;
    let continuous = true;
    for (const action of extra) {
      if (!isStroke(action) || (combined && !sameStroke(combined, action))) { continuous = false; break; }
      combined = combined ? join(combined, action) : { ...action, segment: (action.segment ?? 0) <= 1 ? 1 : action.segment };
    }
    if (continuous && combined) { this.drawStroke(ctx, combined); return; }
    this.frames.delete(ctx);
    ctx.drawImage(this.background, 0, 0, WIDTH, HEIGHT);
    let active = this.active;
    const flush = () => { if (active) renderAction(ctx, { ...active, finished: true }); active = null; };
    for (const action of extra) {
      if (isStroke(action)) {
        if (active && sameStroke(active, action)) active = join(active, action);
        else { flush(); active = { ...action, segment: (action.segment ?? 0) <= 1 ? 1 : action.segment }; }
      } else { flush(); renderAction(ctx, action); }
    }
    flush();
  }
  private drawStroke(ctx: CanvasRenderingContext2D, action: DrawAction) {
    const points = action.points, previous = this.frames.get(ctx);
    const append = previous?.revision === this.revision && sameStroke(previous.action, action) &&
      previous.action.points.length <= points.length && previous.action.points.every((p, i) => p.x === points[i].x && p.y === points[i].y);
    const oldCount = append ? previous.action.points.length : 0;
    if (append && oldCount === points.length) return;
    const path = append ? previous.path : new Path2D();
    const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    if (points.length >= 2) {
      if (oldCount < 2) {
        const start = mid(points[0], points[1]);
        if ((action.segment ?? 0) <= 1) { path.moveTo(points[0].x, points[0].y); path.lineTo(start.x, start.y); }
        else path.moveTo(start.x, start.y);
      }
      for (let i = Math.max(1, oldCount - 1); i < points.length - 1; i++) {
        const end = mid(points[i], points[i + 1]); path.quadraticCurveTo(points[i].x, points[i].y, end.x, end.y);
      }
    }
    ctx.save();
    if (append) {
      // Restore and repaint only the changed tip. Align the clip to backing
      // pixels so the clip itself cannot accumulate antialiasing at its edges.
      const changed = points.slice(Math.max(0, oldCount - 2)), pad = action.size / 2 + 2;
      const left = Math.floor((Math.min(...changed.map(p => p.x)) - pad) * RENDER_SCALE) / RENDER_SCALE;
      const top = Math.floor((Math.min(...changed.map(p => p.y)) - pad) * RENDER_SCALE) / RENDER_SCALE;
      const right = Math.ceil((Math.max(...changed.map(p => p.x)) + pad) * RENDER_SCALE) / RENDER_SCALE;
      const bottom = Math.ceil((Math.max(...changed.map(p => p.y)) + pad) * RENDER_SCALE) / RENDER_SCALE;
      ctx.beginPath(); ctx.rect(left, top, right - left, bottom - top); ctx.clip();
    }
    ctx.drawImage(this.background, 0, 0, WIDTH, HEIGHT);
    if (points.length < 2) renderAction(ctx, action);
    else {
      const tip = new Path2D(path), end = points.at(-1)!; tip.lineTo(end.x, end.y);
      ctx.strokeStyle = action.tool === 'eraser' ? '#ffffff' : action.color;
      ctx.lineWidth = action.size; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(tip);
    }
    ctx.restore();
    this.frames.set(ctx, { revision: this.revision, action, path });
  }
}
