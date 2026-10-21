import { test, expect } from '@playwright/test';

test('coste de pintar un trazo largo con pinceles gruesos', async ({ page }) => {
  await page.goto('/');
  const timings = await page.evaluate(async () => {
    const path = '/src/DrawingScene.ts'; const { DrawingScene, RENDER_SCALE } = await import(path);
    const canvas = document.createElement('canvas'); canvas.width = 960 * RENDER_SCALE; canvas.height = 640 * RENDER_SCALE;
    document.body.append(canvas); const ctx = canvas.getContext('2d')!; ctx.scale(RENDER_SCALE, RENDER_SCALE);
    const results = [];
    for (const size of [60, 200]) {
      const scene = new DrawingScene(), actions = [], samples = [];
      const points = Array.from({ length: 2400 }, (_, i) => ({ x: 480 + Math.sin(i * .04) * 300, y: 320 + Math.sin(i * .057) * 220 }));
      for (let end = 12; end <= points.length; end += 12) {
        actions.push({ id: 'long', segment: actions.length + 1, tool: 'brush', color: '#292438', size, smooth: true, points: points.slice(Math.max(0, end - 14), end) });
        const start = performance.now(); scene.update([...actions]); scene.draw(ctx); samples.push(performance.now() - start);
      }
      // Flush the browser's deferred paint work before recording the total.
      const read = performance.now(); ctx.getImageData(0, 0, 1, 1); const flush = performance.now() - read;
      samples.sort((a, b) => a - b);
      results.push({ size, total: samples.reduce((a, b) => a + b, 0) + flush, p95: samples[Math.floor(samples.length * .95)], worst: samples.at(-1), flush });
    }
    return results;
  });
  console.log('Drawing benchmark:', JSON.stringify(timings));
  expect(timings.every(timing => Number.isFinite(timing.total))).toBe(true);
});

test('muchos movimientos y confirmaciones solo producen un repintado por fotograma', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const scenePath = '/src/DrawingScene.ts', fixturePath = '/tests/fixtures/canvas-latency.tsx';
    const { DrawingScene } = await import(scenePath);
    const original = DrawingScene.prototype.draw;
    const counter = { draws: 0 };
    DrawingScene.prototype.draw = function (...args: unknown[]) { counter.draws++; return original.apply(this, args); };
    (window as unknown as { paintCounter: typeof counter }).paintCounter = counter;
    const fixture = await import(fixturePath); fixture.mount(60);
  });
  const canvas = page.getByLabel('Lienzo para dibujar'); await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 100); await page.mouse.down();
  const result = await canvas.evaluate(async element => {
    const counter = (window as unknown as { paintCounter: { draws: number } }).paintCounter;
    const before = counter.draws, box = element.getBoundingClientRect();
    for (let frame = 0; frame < 20; frame++) {
      for (let sample = 0; sample < 40; sample++) {
        const i = frame * 40 + sample;
        element.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: box.x + 60 + i * .7, clientY: box.y + 200 + Math.sin(i * .04) * 100 }));
      }
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    return counter.draws - before;
  });
  await page.mouse.up();
  expect(result).toBeLessThanOrEqual(21);
  expect(result).toBeGreaterThan(5);
});
