import { test, expect } from '@playwright/test';

test('el trazo no acumula bordes por fragmento y se dibuja con resolución doble', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/src/DrawingScene.ts', drawingPath = '/src/drawing.ts';
    const { DrawingScene, RENDER_SCALE } = await import(path); const { renderAction, blank } = await import(drawingPath);
    const create = (ratio = RENDER_SCALE) => { const c = document.createElement('canvas'); c.width = 960 * ratio; c.height = 640 * ratio; const ctx = c.getContext('2d')!; ctx.scale(ratio, ratio); blank(ctx); return { canvas: c, ctx }; };
    const points = Array.from({ length: 65 }, (_, i) => ({ x: 80.3 + Math.sin(i * .024) * 300 + i * 2, y: 40.1 + i * 7.5 }));
    const action = { id: 'thin-curve', tool: 'brush', color: '#292438', size: 5, smooth: true, finished: true, segment: 1, points };
    const scene = new DrawingScene(), output = create(), reference = create();
    const chunks = []; let offset = 0, segment = 1, maximumDifference = 0;
    while (offset < points.length - 1) {
      const chunk = points.slice(offset, offset + 5), finished = offset + 5 >= points.length;
      chunks.push({ ...action, segment: segment++, points: chunk, finished });
      scene.update([...chunks]); scene.draw(output.ctx);
      blank(reference.ctx); renderAction(reference.ctx, { ...action, points: points.slice(0, offset + chunk.length) });
      if (output.canvas.toDataURL() !== reference.canvas.toDataURL()) {
        const a = output.ctx.getImageData(0, 0, output.canvas.width, output.canvas.height).data, b = reference.ctx.getImageData(0, 0, reference.canvas.width, reference.canvas.height).data;
        for (let i = 0; i < a.length; i += 4) maximumDifference = Math.max(maximumDifference, Math.abs(a[i] - b[i]));
      }
      if (finished) break;
      offset += 3;
    }
    const low = create(1); renderAction(low.ctx, action);
    document.body.replaceChildren();
    for (const [name, canvas] of [['Resolución anterior (ampliada)', low.canvas], ['Resolución doble, un solo borde por trazo', output.canvas]] as const) {
      const title = document.createElement('h2'); title.textContent = name; canvas.style.width = '960px'; canvas.style.height = '640px'; canvas.style.display = 'block'; document.body.append(title, canvas);
    }
    return { finalMatches: output.canvas.toDataURL() === reference.canvas.toDataURL(), maximumDifference, width: output.canvas.width, height: output.canvas.height };
  });
  // Clipped incremental strokes can differ slightly in edge antialiasing from
  // a complete rasterization. Geometry must stay put, and the final must match.
  expect(result.maximumDifference).toBeLessThanOrEqual(40);
  expect(result.finalMatches).toBe(true);
  expect([result.width, result.height]).toEqual([1920, 1280]);
  await page.screenshot({ path: 'test-results/brush-resolution-comparison.png', fullPage: true });
});
