import type { DrawAction } from '../shared/types';

export const TEXT_FONT = 'Excalifont, cursive';
export function textLayout(ctx: CanvasRenderingContext2D, text: string, width: number, height: number) {
  // Use the same wrapping and fitting for the editor preview and every spectator.
  for (let size = Math.min(120, Math.floor(height / 1.25)); size >= 4; size--) {
    ctx.font = `${size}px ${TEXT_FONT}`;
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const char of paragraph) {
        if (line && ctx.measureText(line + char).width > width) {
          const space = line.lastIndexOf(' ');
          if (space > 0) { lines.push(line.slice(0, space)); line = line.slice(space + 1); }
          else { lines.push(line); line = ''; }
        }
        line += char;
      }
      lines.push(line);
    }
    if ((lines.length * size * 1.25 <= height && lines.every(line => ctx.measureText(line).width <= width)) || size === 4) return { size, lines };
  }
  return { size: 4, lines: [''] };
}
export function drawText(ctx: CanvasRenderingContext2D, action: DrawAction) {
  const start = action.points[0], end = action.points[1];
  if (!end) { // Retain the positioning of older text actions.
    ctx.font = `700 ${Math.max(18, action.size * 3)}px sans-serif`;
    ctx.fillText(action.text ?? '', start.x, start.y); return;
  }
  const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y);
  const width = Math.max(1, Math.abs(end.x - start.x)), height = Math.max(1, Math.abs(end.y - start.y));
  const layout = textLayout(ctx, action.text ?? '', width, height);
  ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
  ctx.font = `${layout.size}px ${TEXT_FONT}`; ctx.textBaseline = 'top';
  layout.lines.forEach((line, index) => ctx.fillText(line, x, y + index * layout.size * 1.25));
}
