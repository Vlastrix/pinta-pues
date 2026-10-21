import { test, expect } from '@playwright/test';

test('el trazo permanece visible en cada frame con 220 ms de latencia y al resincronizar', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    // Vite serves this test-only harness; it is not included in the production build.
    const path = '/tests/fixtures/canvas-latency.tsx';
    const fixture = await import(/* @vite-ignore */ path); fixture.mount();
  });
  const canvas = page.getByLabel('Lienzo para dibujar'); await expect(canvas).toBeVisible();
  const rect = (await canvas.boundingBox())!;
  await page.mouse.move(rect.x + 50, rect.y + 100); await page.mouse.down();
  await page.mouse.move(rect.x + 100, rect.y + 100);
  await page.evaluate(() => {
    const observation = { whiteFrames: 0, frames: 0, stopped: false };
    (window as unknown as { drawingObservation: typeof observation }).drawingObservation = observation;
    function sample() {
      const canvases = document.querySelectorAll<HTMLCanvasElement>('.canvas-stack canvas');
      const x = 75 * canvases[0].width / 960, y = 100 * canvases[0].height / 640;
      const base = canvases[0].getContext('2d')!.getImageData(x, y, 1, 1).data;
      const preview = canvases[1].getContext('2d')!.getImageData(x, y, 1, 1).data;
      const pixel = preview[3] ? preview : base;
      observation.frames++;
      if (pixel[0] > 200 && pixel[1] > 200 && pixel[2] > 200) observation.whiteFrames++;
      if (!observation.stopped) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  // Continue drawing across several network chunks while their confirmations are delayed.
  for (let x = 125; x <= 400; x += 25) {
    await page.waitForTimeout(60); await page.mouse.move(rect.x + x, rect.y + 100);
  }
  await page.mouse.up(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Resincronizar' }).click();
  await page.waitForTimeout(100);
  const observed = await page.evaluate(() => {
    const state = (window as unknown as { drawingObservation: { whiteFrames: number; frames: number; stopped: boolean } }).drawingObservation;
    state.stopped = true; return state;
  });
  expect(observed.frames).toBeGreaterThan(15);
  expect(observed.whiteFrames).toBe(0);
  await page.getByRole('button', { name: 'Limpiar prueba' }).click();
  await expect.poll(() => page.getByLabel('Dibujo de la partida').evaluate((canvas: HTMLCanvasElement) =>
    Array.from(canvas.getContext('2d')!.getImageData(75 * canvas.width / 960, 100 * canvas.height / 640, 1, 1).data)
  )).toEqual([255, 255, 255, 255]);
  await page.getByRole('button', { name: 'Rechazar trazos' }).click();
  await page.mouse.move(rect.x + 50, rect.y + 100); await page.mouse.down();
  await page.mouse.move(rect.x + 100, rect.y + 100); await page.mouse.up();
  // A rejected speculative stroke must disappear instead of becoming a permanent ghost.
  await page.waitForTimeout(300);
  expect(await page.getByLabel('Lienzo para dibujar').evaluate((canvas: HTMLCanvasElement) =>
    canvas.getContext('2d')!.getImageData(75 * canvas.width / 960, 100 * canvas.height / 640, 1, 1).data[3]
  )).toBe(0);
});
