import { test, expect } from '@playwright/test';

test('el espectador ve el primer punto y los tramos durante las pausas, antes de soltar el mouse', async ({ page, browser }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await page.getByLabel('¿Cómo te dice la tropa?').fill('Vladi');
  await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  await expect(page.getByText('Que no falte nadie, pues.')).toBeVisible();
  const code = await page.locator('.room-heading h1>span').innerText();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest = await context.newPage(); guest.on('pageerror', error => errors.push(error.message));
  try {
    await guest.goto(`/?sala=${code}`); await guest.getByLabel('¿Cómo te dice la tropa?').fill('Caserita');
    await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
    await expect(guest.getByText('Que no falte nadie, pues.')).toBeVisible();
    await page.getByRole('button', { name: '¡A pintar, pues!' }).click(); await page.locator('.word-choices button').first().click();
    const canvas = page.getByLabel('Lienzo para dibujar'); const box = (await canvas.boundingBox())!;
    const at = (x: number, y: number) => page.mouse.move(box.x + x / 960 * box.width, box.y + y / 640 * box.height);
    const pixel = (x: number) => guest.getByLabel('Dibujo de la partida').evaluate((canvas: HTMLCanvasElement, x) =>
      Array.from(canvas.getContext('2d')!.getImageData(x, 100, 1, 1).data), x);
    await at(100, 100); await page.mouse.down();
    // No pointermove or pointerup: the first dot must already be visible remotely.
    await expect.poll(() => pixel(100)).toEqual([41, 36, 56, 255]);
    await at(200, 100);
    // No further movement: the timer must flush the last short segment by itself.
    await expect.poll(() => pixel(150)).toEqual([41, 36, 56, 255]);
    await guest.getByLabel('Tu respuesta o mensaje').fill('prueba');
    await guest.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(guest.getByText('prueba', { exact: true })).toBeVisible();
    await at(300, 100); await expect.poll(() => pixel(250)).toEqual([41, 36, 56, 255]);
    await page.mouse.up();
    for (const x of [100, 150, 250]) await expect.poll(() => pixel(x)).toEqual([41, 36, 56, 255]);
    await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
    for (const x of [100, 150, 250]) await expect.poll(() => pixel(x)).toEqual([255, 255, 255, 255]);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
