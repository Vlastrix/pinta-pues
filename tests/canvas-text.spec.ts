import { test, expect } from '@playwright/test';

test('texto en un área del lienzo: ajuste, multilínea, cancelar, confirmar y sincronizar', async ({ page, browser }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await page.getByLabel('¿Cómo te dice la tropa?').fill('Artista');
  await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  const code = await page.locator('.room-heading h1>span').innerText();
  const context = await browser.newContext(); const guest = await context.newPage();
  try {
    await guest.goto(`/?sala=${code}`); await guest.getByLabel('¿Cómo te dice la tropa?').fill('Amigo');
    await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
    await page.getByRole('button', { name: '¡A pintar, pues!' }).click(); await page.locator('.word-choices button').first().click();
    await page.getByRole('button', { name: 'Texto', exact: true }).click();
    await expect(page.getByLabel('Texto para el lienzo')).toHaveCount(0);
    const canvas = page.getByLabel('Lienzo para dibujar'); const editor = page.getByLabel('Texto para el lienzo');
    const bounds = (await canvas.boundingBox())!;
    // Drag backwards as well: the box must always have positive dimensions.
    await page.mouse.move(bounds.x + 280, bounds.y + 180); await page.mouse.down();
    await page.mouse.move(bounds.x + 50, bounds.y + 40, { steps: 5 }); await page.mouse.up();
    await expect(editor).toBeFocused();
    expect((await editor.boundingBox())!.width).toBeCloseTo(230, 0);
    await editor.fill('Ñandú');
    const initialSize = await editor.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    await editor.press('End'); await editor.press('Shift+Enter'); await editor.pressSequentially('Un texto bastante largo');
    expect(await editor.inputValue()).toContain('\n');
    expect(await editor.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeLessThan(initialSize);
    await expect(page.getByRole('button', { name: 'Deshacer', exact: true })).toBeDisabled();
    await page.screenshot({ path: 'test-results/canvas-text-editing.png' });
    await editor.press('Escape'); await expect(editor).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Deshacer', exact: true })).toBeDisabled();
    await canvas.click({ position: { x: 50, y: 40 } }); await editor.fill('   '); await editor.press('Enter');
    await expect(editor).toHaveCount(0);
    await canvas.click({ position: { x: 50, y: 40 } }); await editor.fill('Ñandú\n¿Todo bien?'); await editor.press('Enter');
    await expect(editor).toHaveCount(0);
    const picture = () => page.getByLabel('Dibujo de la partida').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await expect(page.getByRole('button', { name: 'Deshacer', exact: true })).toBeEnabled();
    await expect.poll(async () => (await picture()) === await guest.getByLabel('Dibujo de la partida').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(true);
    expect(await page.evaluate(() => document.fonts.check('24px Excalifont', 'Ñandú'))).toBe(true);
    await page.setViewportSize({ width: 360, height: 760 });
    await canvas.click({ position: { x: 15, y: 15 } }); await editor.fill('En móvil');
    await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
    expect(await editor.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    const mobileCanvas = (await canvas.boundingBox())!, mobileEditor = (await editor.boundingBox())!;
    expect(mobileEditor.x).toBeGreaterThanOrEqual(mobileCanvas.x);
    expect(mobileEditor.x + mobileEditor.width).toBeLessThanOrEqual(mobileCanvas.x + mobileCanvas.width + 1);
    await page.screenshot({ path: 'test-results/canvas-text-mobile.png' });
    await page.locator('.word-strip').click(); await expect(editor).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
