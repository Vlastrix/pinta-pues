import { test, expect } from '@playwright/test';
import type { DrawAction } from '../shared/types';

test('curvas suaves continuas al fragmentar y renderizado antiguo conservado', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const modulePath = '/src/drawing.ts'; const { renderAction, blank } = await import(modulePath);
    const canvas = () => { const c = document.createElement('canvas'); c.width = 960; c.height = 640; blank(c.getContext('2d')!); return c; };
    const points = Array.from({ length: 55 }, (_, i) => ({ x: 50 + i * 15, y: 200 + Math.sin(i * .35) * 115 }));
    const action = { id: 'curve', tool: 'brush', color: '#292438', size: 18, smooth: true, finished: true, segment: 1, points };
    const whole = canvas(); renderAction(whole.getContext('2d')!, action);
    const split = canvas(); let offset = 0, segment = 1;
    for (const length of [2, 8, 3, 12, 5, 20, 30]) {
      const chunk = points.slice(offset, offset + length);
      if (chunk.length < 2) break;
      const finished = offset + length >= points.length;
      renderAction(split.getContext('2d')!, { ...action, points: chunk, segment: segment++, finished });
      if (finished) break;
      offset += length - 2;
    }
    const data = whole.getContext('2d')!.getImageData(0, 0, 960, 640).data;
    const other = split.getContext('2d')!.getImageData(0, 0, 960, 640).data;
    let ink = 0, differing = 0;
    for (let i = 0; i < data.length; i += 4) { if (data[i] < 200) ink++; if (Math.abs(data[i] - other[i]) > 40) differing++; }
    const legacy = canvas(); renderAction(legacy.getContext('2d')!, { ...action, smooth: undefined });
    const reference = canvas(), ctx = reference.getContext('2d')!;
    ctx.strokeStyle = action.color; ctx.lineWidth = action.size; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); points.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke();
    document.body.replaceChildren();
    for (const [label, c] of [['Antes: segmentos rectos', legacy], ['Ahora: curvas suaves', whole], ['Curvas transmitidas por fragmentos', split]] as const) {
      const title = document.createElement('h2'); title.textContent = label; document.body.append(title, c); c.style.width = '650px'; c.style.display = 'block';
    }
    return { ratio: differing / ink, legacyUnchanged: legacy.toDataURL() === reference.toDataURL(), changed: legacy.toDataURL() !== whole.toDataURL() };
  });
  expect(result.legacyUnchanged).toBe(true); expect(result.changed).toBe(true);
  // Tiny antialiasing differences at overlapping caps are acceptable; missing
  // sections, kinked joins or geometry that changes with packet timing are not.
  expect(result.ratio).toBeLessThan(.02);
  await page.screenshot({ path: 'test-results/brush-smoothing-comparison.png', fullPage: true });
});

test('pincel suave compartido en vivo, muestras agrupadas, punto final y deshacer completo', async ({ page, browser }) => {
  const sent: DrawAction[] = [];
  page.on('websocket', socket => socket.on('framesent', frame => {
    const payload = frame.payload.toString(), start = payload.indexOf('['); if (payload.startsWith('42') && start >= 0) { const data = JSON.parse(payload.slice(start)); if (data[0] === 'board:action') sent.push(data[1]); }
  }));
  await page.goto('/'); await page.getByLabel('¿Cómo te dice la tropa?').fill('Artista'); await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  const code = await page.locator('.room-heading h1>span').innerText();
  const context = await browser.newContext(); const guest = await context.newPage();
  try {
    await guest.goto(`/?sala=${code}`); await guest.getByLabel('¿Cómo te dice la tropa?').fill('Amigo'); await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
    await page.getByRole('button', { name: '¡A pintar, pues!' }).click(); await page.locator('.word-choices button').first().click();
    const canvas = page.getByLabel('Lienzo para dibujar'), viewer = guest.getByLabel('Dibujo de la partida');
    const box = (await canvas.boundingBox())!;
    const at = (x: number, y: number) => page.mouse.move(box.x + x / 960 * box.width, box.y + y / 640 * box.height);
    await at(100, 180); await page.mouse.down();
    for (let i = 1; i <= 16; i++) await at(100 + i * 30, 180 + Math.sin(i * .5) * 100);
    await expect.poll(() => viewer.evaluate((c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data.filter((value, i) => i % 4 === 0 && value < 200).length)).toBeGreaterThan(500);
    // Supply intermediate hardware samples through a coalesced event.
    await canvas.evaluate(element => {
      const b = element.getBoundingClientRect(); const at = (x: number, y: number) => ({ clientX: b.x + x / 960 * b.width, clientY: b.y + y / 640 * b.height });
      const event = new PointerEvent('pointermove', { bubbles: true, ...at(650, 280) });
      Object.defineProperty(event, 'getCoalescedEvents', { value: () => [new PointerEvent('pointermove', at(610, 270)), new PointerEvent('pointermove', at(630, 285))] });
      element.dispatchEvent(event);
    });
    await at(680, 290); await page.mouse.up();
    await expect.poll(() => sent.at(-1)?.finished).toBe(true);
    expect(sent.every(action => action.smooth && action.points.length <= 128)).toBe(true);
    expect(sent.some(action => action.points.some(point => Math.abs(point.x - 630) < 1))).toBe(true);
    const image = () => page.getByLabel('Dibujo de la partida').evaluate((c: HTMLCanvasElement) => c.toDataURL());
    await expect.poll(async () => await image() === await viewer.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(true);
    const endpoint = await viewer.evaluate((c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(680 * c.width / 960, 290 * c.height / 640, 1, 1).data[0]); expect(endpoint).toBeLessThan(100);
    const late = await context.newPage(); await late.goto(`/?sala=${code}`); await late.getByLabel('¿Cómo te dice la tropa?').fill('Llegué tarde'); await late.getByRole('button', { name: 'Entrar a la sala' }).click();
    await expect.poll(async () => await image() === await late.getByLabel('Dibujo de la partida').evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(true);
    await page.getByRole('button', { name: 'Deshacer', exact: true }).click(); await expect(page.getByRole('button', { name: 'Deshacer', exact: true })).toBeDisabled();
    await expect.poll(() => viewer.evaluate((c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data.every(value => value === 255))).toBe(true);
  } finally { await context.close(); }
});
