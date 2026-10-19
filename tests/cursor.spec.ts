import { test, expect } from '@playwright/test';

test('lápiz del color elegido, animación compartida y coordenadas adaptadas a móvil', async ({ page, browser }) => {
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
    await page.getByRole('button', { name: '¡A pintar, pues!' }).click();
    const choice = page.locator('.word-choices button').first(); const word = (await choice.innerText()).trim(); await choice.click();
    const canvas = page.getByLabel('Lienzo para dibujar'); const box = (await canvas.boundingBox())!;
    const move = () => page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.4);
    await move();
    await expect(page.locator('.pencil-cursor-icon')).toBeVisible();
    await expect(guest.locator('.drawing-cursor')).toHaveCount(1);
    await expect(guest.locator('.drawing-cursor')).toHaveAttribute('data-color', '#292438');
    const normalized = await guest.locator('.drawing-cursor').evaluate(element => {
      const marker = element.getBoundingClientRect(); const board = element.parentElement!.getBoundingClientRect();
      return { x: (marker.left - board.left) / board.width, y: (marker.top - board.top) / board.height };
    });
    expect(normalized.x).toBeCloseTo(0.25, 2); expect(normalized.y).toBeCloseTo(0.4, 2);
    await expect(page.getByRole('button', { name: 'Deshacer', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Color #ef5350', exact: true }).click(); await move();
    for (const target of [page, guest]) await expect(target.locator('.drawing-cursor')).toHaveAttribute('data-color', '#ef5350');
    await page.mouse.down();
    for (const target of [page, guest]) {
      await expect(target.locator('.drawing-cursor')).toHaveClass(/is-drawing/);
      await expect(target.locator('.pencil-cursor-icon')).toHaveCSS('animation-name', 'pencil-scribble');
    }
    await guest.emulateMedia({ reducedMotion: 'reduce' });
    await expect(guest.locator('.pencil-cursor-icon')).toHaveCSS('animation-name', 'none');
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 8 }); await page.mouse.up();
    await expect(guest.locator('.drawing-cursor')).not.toHaveClass(/is-drawing/);
    await expect(page.getByRole('button', { name: 'Deshacer', exact: true })).toBeEnabled();
    await page.mouse.move(0, 0);
    for (const target of [page, guest]) await expect(target.locator('.drawing-cursor')).toHaveCount(0);
    await move(); await expect(guest.locator('.drawing-cursor')).toHaveCount(1);
    await guest.getByLabel('Tu respuesta o mensaje').fill(word); await guest.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(guest.locator('.word-strip strong')).toHaveText(word);
    for (const target of [page, guest]) await expect(target.locator('.drawing-cursor')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
