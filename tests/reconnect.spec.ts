import { test, expect } from '@playwright/test';

test('recargar la página recupera anfitrión, dibujo y aciertos sin duplicar apodos', async ({ page, browser }) => {
  await page.goto('/'); await page.getByLabel('¿Cómo te dice la tropa?').fill('Pintor');
  await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  const code = await page.locator('.room-heading h1>span').innerText();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const guest = await context.newPage(), other = await context.newPage();
  try {
    for (const [tab, name] of [[guest, 'Adivinador'], [other, 'Otro']] as const) {
      await tab.goto(`/?sala=${code}`); await tab.getByLabel('¿Cómo te dice la tropa?').fill(name); await tab.getByRole('button', { name: 'Entrar a la sala' }).click();
    }
    await page.getByRole('button', { name: '¡A pintar, pues!' }).click();
    const choice = page.locator('.word-choices button').first(), word = (await choice.innerText()).trim(); await choice.click();
    await page.getByLabel('Lienzo para dibujar').click({ position: { x: 50, y: 50 } });
    const picture = await page.getByLabel('Dibujo de la partida').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await guest.getByLabel('Tu respuesta o mensaje').fill(word); await guest.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(guest.locator('.player').filter({ hasText: 'Adivinador' }).locator('div > span')).toHaveText('60 puntos');
    await guest.reload();
    await expect(guest.locator('.room-heading h1 > span')).toHaveText(code);
    await expect(guest.locator('.player')).toHaveCount(3);
    await expect(guest.locator('.player').filter({ hasText: 'Adivinador' }).locator('div > span')).toHaveText('60 puntos');
    await expect(guest.getByLabel('Tu respuesta o mensaje')).toBeDisabled();
    await expect(guest.locator('.guess-celebration')).toHaveCount(0);
    const effectsUnlocked = guest.waitForResponse(response => response.url().endsWith('/audio/game/success-fanfare-trumpets.mp3'));
    await guest.locator('.word-strip').click();
    expect((await effectsUnlocked).ok()).toBe(true);
    await page.reload();
    await expect(page.locator('.room-heading h1 > span')).toHaveText(code);
    await expect(page.getByRole('button', { name: 'Pincel', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Moderar a Otro' })).toBeVisible();
    await expect(page.locator('.word-strip strong')).toHaveText(word);
    await expect.poll(() => page.getByLabel('Dibujo de la partida').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(picture);
    await expect(page.locator('.player')).toHaveCount(3);
    await guest.reload(); // The credential rotated during the first reload must also work.
    await expect(guest.locator('.room-heading h1 > span')).toHaveText(code);
    await expect(guest.locator('.player')).toHaveCount(3);
    await guest.getByRole('button', { name: 'Salir de la sala', exact: true }).click();
    await expect(guest.locator('.room-heading')).toHaveCount(0);
    await guest.reload();
    await expect(guest.getByRole('button', { name: '¡Armemos la sala!' })).toBeVisible();
    await expect(guest.locator('.room-heading')).toHaveCount(0);
  } finally { await context.close(); }
});

test('móvil: corte temporal conserva sala y recupera lienzo, chat y turno sin recargar', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByLabel('¿Cómo te dice la tropa?').fill('Presente');
  await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  const code = await page.locator('.room-heading h1>span').innerText();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => {
    const Original = window.WebSocket;
    window.WebSocket = class extends Original {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        (window as unknown as { gameSocket: WebSocket }).gameSocket = this;
      }
    };
  });
  const phone = await context.newPage();
  try {
    await phone.goto(`/?sala=${code}`);
    await phone.getByLabel('¿Cómo te dice la tropa?').fill('Móvil');
    await phone.getByRole('button', { name: 'Entrar a la sala' }).click();
    await page.getByRole('button', { name: '¡A pintar, pues!' }).click();
    await page.locator('.word-choices button').first().click();
    await page.getByLabel('Lienzo para dibujar').click({ position: { x: 50, y: 50 } });
    await expect.poll(() => phone.evaluate(() => (window as unknown as { gameSocket?: WebSocket }).gameSocket?.readyState)).toBe(1);
    await context.setOffline(true);
    await phone.evaluate(() => (window as unknown as { gameSocket: WebSocket }).gameSocket.close());
    await expect(phone.getByText(/Guardamos tu lugar/)).toBeVisible();
    await expect(phone.locator('.room-heading h1>span')).toHaveText(code);
    await expect(phone.getByLabel('Tu respuesta o mensaje')).toBeDisabled();
    await expect(page.getByText(/Reconectando/)).toBeVisible();
    await page.getByLabel('Lienzo para dibujar').click({ position: { x: 100, y: 100 } });
    await context.setOffline(false);
    await expect(phone.getByText(/Guardamos tu lugar/)).toHaveCount(0, { timeout: 15000 });
    await expect(phone.locator('.room-heading h1>span')).toHaveText(code);
    await expect(phone.getByLabel('Tu respuesta o mensaje')).toBeEnabled();
    await expect(phone.locator('.player')).toHaveCount(2);
    const actual = await phone.getByLabel('Dibujo de la partida').evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL());
    const expected = await page.locator('.canvas-stack canvas').first().evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL());
    expect(actual).toBe(expected);
    await phone.getByLabel('Tu respuesta o mensaje').fill('¡Volví!');
    await phone.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(page.getByText('¡Volví!', { exact: true })).toBeVisible();
  } finally { await context.close(); }
});
