import { test, expect } from '@playwright/test';

test('móvil: adivinar junto al dibujo, chat sin saltos y herramientas al cambiar de turno', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByLabel('¿Cómo te dice la tropa?').fill('Pintor');
  await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  const code = await page.locator('.room-heading h1>span').innerText();
  await expect(page.locator('.site-header')).toHaveClass(/in-room/);
  await expect(page.locator('.site-header')).toHaveCSS('height', '64px');
  const roster = page.locator('.players-panel');
  await expect(roster.locator('.room-heading h1 > span')).toHaveText(code);
  await expect(roster.getByLabel('1 de 12 jugadores')).toBeVisible();
  await expect(roster.getByRole('button', { name: 'Invitar amigos', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Invitar amigos', exact: true })).toHaveCount(1);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const invite = (await roster.getByRole('button', { name: 'Invitar amigos', exact: true }).boundingBox())!;
    const panel = (await roster.boundingBox())!;
    expect(invite.x).toBeGreaterThan(panel.x); expect(invite.x + invite.width).toBeLessThan(panel.x + panel.width);
  }
  await roster.screenshot({ path: 'test-results/room-roster-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.game-grid').screenshot({ path: 'test-results/room-roster-desktop.png' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await context.newPage();
  try {
    await phone.goto(`/?sala=${code}`);
    await phone.getByLabel('¿Cómo te dice la tropa?').fill('Celular');
    await phone.getByRole('button', { name: 'Entrar a la sala' }).click();
    await expect(phone.locator('.site-header')).toHaveClass(/in-room/);
    expect((await phone.locator('.site-header').boundingBox())!.height).toBeLessThan(75);
    await phone.locator('.site-header').screenshot({ path: 'test-results/room-header-mobile.png' });
    await expect(page.getByRole('button', { name: '¡A pintar, pues!' })).toBeEnabled();
    await page.locator('.custom-words summary').click();
    await page.getByLabel('Palabras personalizadas').fill('mochila llena de libros, computadora de escritorio, caballero de armadura brillante');
    await page.getByRole('button', { name: 'Agregar palabras', exact: true }).click();
    await expect(page.locator('.category-picker').getByRole('button', { name: 'Personalizadas (3)', exact: true })).toHaveClass(/selected/);
    for (const category of await page.locator('.category-picker button.selected').allTextContents()) {
      if (!category.startsWith('Personalizadas')) await page.locator('.category-picker').getByRole('button', { name: category, exact: true }).click();
    }
    await page.getByRole('button', { name: '¡A pintar, pues!' }).click();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 640 });
      const surface = page.locator('.board-surface');
      const bounds = (await surface.boundingBox())!;
      await expect(page.locator('.word-choices button')).toHaveCount(3);
      for (const element of await page.locator('.board-overlay > .choice-icon, .board-overlay h2, .board-overlay p, .word-choices button').all()) {
        const box = (await element.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(bounds.x); expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
        expect(box.y).toBeGreaterThanOrEqual(bounds.y); expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.locator('.board-surface').screenshot({ path: 'test-results/mobile-word-choice.png' });
    expect(await phone.locator('.board-overlay').evaluate(node => node.scrollHeight <= node.clientHeight)).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const choice = page.locator('.word-choices').getByRole('button', { name: 'caballero de armadura brillante', exact: true });
    const word = (await choice.innerText()).trim(); await choice.click();
    await expect(phone.locator('.game-grid')).toHaveClass(/is-guessing/);
    await expect(phone.locator('.toolbar')).toBeHidden();
    await phone.evaluate(() => window.scrollTo(0, 0));
    const canvas = phone.getByLabel('Dibujo de la partida');
    const input = phone.getByLabel('Tu respuesta o mensaje');
    const chat = phone.locator('.chat-panel'); const players = phone.locator('.players-panel');
    expect((await chat.locator('.messages').boundingBox())!.height).toBeGreaterThanOrEqual(230);
    expect((await chat.boundingBox())!.y).toBeLessThan((await players.boundingBox())!.y);
    expect((await input.boundingBox())!.y + (await input.boundingBox())!.height).toBeLessThanOrEqual(844);
    expect((await canvas.boundingBox())!.y).toBeGreaterThanOrEqual(0);
    await phone.setViewportSize({ width: 360, height: 640 });
    expect((await chat.locator('.messages').boundingBox())!.height).toBeGreaterThanOrEqual(180);
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
    expect((await chat.locator('.messages').boundingBox())!.height).toBeGreaterThanOrEqual(110);
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
