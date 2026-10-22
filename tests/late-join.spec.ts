import { test, expect } from '@playwright/test';

test('ingreso desde móvil durante el dibujo: recibe trazos y puede adivinar con cero puntos', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByLabel('¿Cómo te dice la tropa?').fill('Pintor');
  await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  const code = await page.locator('.room-heading h1>span').innerText();
  const context = await browser.newContext(); const guest = await context.newPage();
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await phoneContext.newPage();
  try {
    await guest.goto(`/?sala=${code}`);
    await guest.getByLabel('¿Cómo te dice la tropa?').fill('Primero');
    await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
    await page.getByRole('button', { name: '¡A pintar, pues!' }).click();
    const choice = page.locator('.word-choices button').first(); const word = (await choice.innerText()).trim(); await choice.click();
    await page.getByLabel('Lienzo para dibujar').click({ position: { x: 90, y: 90 } });
    await expect(page.getByRole('button', { name: 'Deshacer', exact: true })).toBeEnabled();
    await phone.goto(`/?sala=${code}`);
    await phone.getByLabel('¿Cómo te dice la tropa?').fill('Recién llegado');
    await phone.getByRole('button', { name: 'Entrar a la sala' }).click();
    await expect(phone.getByLabel('Tu respuesta o mensaje')).toBeEnabled();
    await expect(phone.locator('.player').filter({ hasText: 'Recién llegado' })).toContainText('0 puntos');
    await expect(phone.locator('.word-strip strong')).toHaveClass('hint');
    expect(await phone.locator('.word-strip strong').innerText()).not.toBe(word);
    await expect(phone.locator('.word-choices')).toHaveCount(0);
    await expect(phone.locator('.toolbar')).toBeHidden();
    await expect(phone.locator('.messages')).toContainText('dibujará desde la ronda 2');
    await expect.poll(() => phone.getByLabel('Dibujo de la partida').evaluate((canvas: HTMLCanvasElement) => {
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      return data.some((value, i) => i % 4 !== 3 && value < 200);
    })).toBe(true);
    await phone.getByLabel('Tu respuesta o mensaje').fill(word);
    await phone.getByRole('button', { name: 'Enviar mensaje' }).tap();
    await expect(phone.locator('.player').filter({ hasText: 'Recién llegado' })).toHaveClass(/guessed/);
    await expect(phone.locator('.player').filter({ hasText: 'Recién llegado' }).locator('div > span')).toHaveText('60 puntos');
    await expect(page.getByRole('button', { name: 'Pincel', exact: true })).toBeEnabled();
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await phoneContext.close(); await context.close(); }
});
