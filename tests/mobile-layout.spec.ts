import { test, expect } from '@playwright/test';

test('móvil: adivinar junto al dibujo, chat sin saltos y herramientas al cambiar de turno', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByLabel('¿Cómo te dice la tropa?').fill('Pintor');
  await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  const code = await page.locator('.room-heading h1>span').innerText();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await context.newPage();
  try {
    await phone.goto(`/?sala=${code}`);
    await phone.getByLabel('¿Cómo te dice la tropa?').fill('Celular');
    await phone.getByRole('button', { name: 'Entrar a la sala' }).click();
    await expect(page.getByRole('button', { name: '¡A pintar, pues!' })).toBeEnabled();
    await page.getByRole('button', { name: '¡A pintar, pues!' }).click();
    const choice = page.locator('.word-choices button').first();
    const word = (await choice.innerText()).trim(); await choice.click();
    await expect(phone.locator('.game-grid')).toHaveClass(/is-guessing/);
    await expect(phone.locator('.toolbar')).toBeHidden();
    await phone.evaluate(() => window.scrollTo(0, 0));
    const canvas = phone.getByLabel('Dibujo de la partida');
    const input = phone.getByLabel('Tu respuesta o mensaje');
    const chat = phone.locator('.chat-panel'); const players = phone.locator('.players-panel');
    expect((await chat.boundingBox())!.y).toBeLessThan((await players.boundingBox())!.y);
    expect((await input.boundingBox())!.y + (await input.boundingBox())!.height).toBeLessThanOrEqual(844);
    expect((await canvas.boundingBox())!.y).toBeGreaterThanOrEqual(0);
    await phone.setViewportSize({ width: 360, height: 640 });
    await phone.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(async () => { const box = (await input.boundingBox())!; return box.y + box.height; }).toBeLessThanOrEqual(640);
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.screenshot({ path: 'test-results/mobile-guesser.png', fullPage: true });
    const scrollBefore = await phone.evaluate(() => scrollY);
    await page.getByRole('button', { name: 'Cuadrado', exact: true }).click();
    await page.getByLabel('Lienzo para dibujar').click({ position: { x: 80, y: 80 } });
    await expect.poll(() => phone.evaluate(() => scrollY)).toBe(scrollBefore);
    // Reducir la ventana simula el espacio visible con el teclado abierto;
    // Playwright no abre el teclado virtual real de Android/iOS.
    await phone.setViewportSize({ width: 390, height: 420 });
    await input.fill('intento de prueba');
    await expect(phone.locator('.game-page')).toHaveClass(/chat-focused/);
    await phone.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(async () => { const box = (await input.boundingBox())!; return box.y + box.height; }).toBeLessThanOrEqual(420);
    const smallCanvas = (await canvas.boundingBox())!;
    const smallInput = (await input.boundingBox())!;
    expect(smallCanvas.width / smallCanvas.height).toBeCloseTo(1.5, 1);
    expect(smallCanvas.y).toBeGreaterThanOrEqual(0);
    expect(smallCanvas.y + smallCanvas.height).toBeLessThan(smallInput.y);
    expect(smallInput.y + smallInput.height).toBeLessThanOrEqual(420);
    await phone.screenshot({ path: 'test-results/mobile-typing.png', fullPage: true });
    await phone.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(page.getByText('intento de prueba', { exact: true })).toBeVisible();
    await expect(input).toBeFocused();
    const scrollAfterSend = await phone.evaluate(() => scrollY);
    await page.getByRole('button', { name: 'Moderar a Celular' }).click();
    await page.getByRole('button', { name: 'Silenciar chat', exact: true }).click();
    await expect(phone.getByText(/silenció el chat/)).toBeVisible();
    expect(await phone.evaluate(() => scrollY)).toBe(scrollAfterSend);
    await phone.waitForTimeout(400); // Respetar la pausa de chat de 350 ms del servidor.
    await input.fill(word); await input.press('Enter');
    await expect(phone.locator('.reveal-banner')).toBeVisible();
    await expect(phone.locator('.game-page')).not.toHaveClass(/chat-focused/);
    await phone.setViewportSize({ width: 390, height: 844 });
    const next = phone.locator('.word-choices button').first();
    await expect(next).toBeVisible({ timeout: 10000 }); await next.click();
    await expect(phone.locator('.toolbar')).toBeVisible();
    await expect(phone.getByRole('button', { name: 'Pincel', exact: true })).toBeEnabled();
    await expect(page.locator('.toolbar')).toBeVisible(); // Escritorio conserva la barra.
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await phone.screenshot({ path: 'test-results/mobile-painter.png', fullPage: true });
  } finally { await context.close(); }
});
