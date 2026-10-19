import { WIDTH, HEIGHT, type DrawAction } from '../shared/types';

export function blank(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

export function renderAction(ctx: CanvasRenderingContext2D, action: DrawAction) {
  const start = action.points[0];
  const end = action.points.at(-1)!;
  ctx.save();
  ctx.strokeStyle = action.tool === 'eraser' ? '#ffffff' : action.color;
  ctx.fillStyle = action.color; ctx.lineWidth = action.size;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (action.tool) {
    case 'brush': case 'eraser': {
      ctx.moveTo(start.x, start.y);
      for (const point of action.points.slice(1)) ctx.lineTo(point.x, point.y);
      if (action.points.length === 1 || action.points.every(p => p.x === start.x && p.y === start.y)) {
        ctx.fillStyle = ctx.strokeStyle; ctx.arc(start.x, start.y, action.size / 2, 0, Math.PI * 2); ctx.fill();
      } else ctx.stroke();
      break;
    }
    case 'line': ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke(); break;
    case 'rectangle': ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y); break;
    case 'ellipse':
      ctx.ellipse((start.x + end.x) / 2, (start.y + end.y) / 2, Math.abs(end.x - start.x) / 2, Math.abs(end.y - start.y) / 2, 0, 0, Math.PI * 2); ctx.stroke(); break;
    case 'star': {
      const cx = (start.x + end.x) / 2; const cy = (start.y + end.y) / 2;
      const rx = Math.abs(end.x - start.x) / 2; const ry = Math.abs(end.y - start.y) / 2;
      for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + i * Math.PI / 5; const radius = i % 2 ? 0.45 : 1;
        const x = cx + Math.cos(angle) * rx * radius; const y = cy + Math.sin(angle) * ry * radius;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.stroke(); break;
    }
    case 'text': ctx.font = `700 ${Math.max(18, action.size * 3)}px sans-serif`; ctx.fillText(action.text ?? '', start.x, start.y); break;
    case 'fill': floodFill(ctx, Math.min(WIDTH - 1, Math.round(start.x)), Math.min(HEIGHT - 1, Math.round(start.y)), action.color); break;
  }
  ctx.restore();
}

function floodFill(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  const image = ctx.getImageData(0, 0, WIDTH, HEIGHT); const pixels = image.data;
  const origin = (y * WIDTH + x) * 4;
  const target = [pixels[origin], pixels[origin + 1], pixels[origin + 2]];
  const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
  if (target.every((value, i) => value === rgb[i])) return;
  const visited = new Uint8Array(WIDTH * HEIGHT);
  const queue = new Uint32Array(WIDTH * HEIGHT);
  let head = 0; let tail = 1; queue[0] = y * WIDTH + x; visited[queue[0]] = 1;
  const add = (index: number) => {
    if (visited[index]) return;
    visited[index] = 1;
    const offset = index * 4;
    if (target.every((value, i) => Math.abs(pixels[offset + i] - value) <= 24)) queue[tail++] = index;
  };
  while (head < tail) {
    const index = queue[head++]; const offset = index * 4;
    pixels[offset] = rgb[0]; pixels[offset + 1] = rgb[1]; pixels[offset + 2] = rgb[2]; pixels[offset + 3] = 255;
    if (index % WIDTH > 0) add(index - 1);
    if (index % WIDTH < WIDTH - 1) add(index + 1);
    if (index >= WIDTH) add(index - WIDTH);
    if (index < WIDTH * (HEIGHT - 1)) add(index + WIDTH);
  }
  ctx.putImageData(image, 0, 0);
}
