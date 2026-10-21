import type { DrawAction, Point } from '../shared/types';

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Each network segment retains two context points. Midpoint tangents join
 * exactly, regardless of where the stream was split. No future samples needed. */
export function smoothStroke(ctx: CanvasRenderingContext2D, action: DrawAction) {
  const points = action.points;
  if (points.length < 2) return;
  const start = midpoint(points[0], points[1]);
  if ((action.segment ?? 0) <= 1) {
    ctx.moveTo(points[0].x, points[0].y); ctx.lineTo(start.x, start.y);
  } else ctx.moveTo(start.x, start.y);
  for (let i = 1; i < points.length - 1; i++) {
    const end = midpoint(points[i], points[i + 1]);
    ctx.quadraticCurveTo(points[i].x, points[i].y, end.x, end.y);
  }
  if (action.finished) { const end = points.at(-1)!; ctx.lineTo(end.x, end.y); }
}
