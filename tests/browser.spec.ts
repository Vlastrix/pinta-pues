import { test, expect, type Page } from '@playwright/test';

async function createRoom(page: Page) {
  await page.goto('/');
  await page.getByLabel('¿Cómo te dice la tropa?').fill('Vladi');
  await expect(page.getByRole('button', { name: '¡Armemos la sala!' })).toBeEnabled();
  await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  await expect(page.getByText('Que no falte nadie, pues.')).toBeVisible();
  return await page.locator('.room-heading h1>span').innerText();
}

test('atajos: herramientas, deshacer sincronizado y escritura sin interferencias', async ({ page, browser }) => {
  const code = await createRoom(page);
  const tool = (name: string) => page.getByRole('button', { name, exact: true });
  await page.locator('body').click({ position: { x: 0, y: 0 } });
  await page.keyboard.press('r');
  await expect(tool('Pincel')).toHaveAttribute('aria-pressed', 'true');
  const context = await browser.newContext(); const guest = await context.newPage();
  try {
    await guest.goto(`/?sala=${code}`);
    await guest.getByLabel('¿Cómo te dice la tropa?').fill('Caserita');
    await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
    await expect(page.getByRole('button', { name: '¡A pintar, pues!' })).toBeEnabled();
    await page.getByRole('button', { name: '¡A pintar, pues!' }).click();
    await page.locator('.word-choices button').first().click();
    const options = [
      ['p', 'Pincel'], ['e', 'Borrador'], ['l', 'Línea'], ['r', 'Cuadrado'],
      ['o', 'Círculo'], ['s', 'Estrella'], ['f', 'Relleno'], ['t', 'Texto'],
    ];
    for (const [index, [key, label]] of options.entries()) {
      await page.keyboard.press(key);
      await expect(tool(label)).toHaveAttribute('aria-pressed', 'true');
      await expect(tool(label)).toHaveAttribute('title', new RegExp(key.toUpperCase()));
      await page.keyboard.press('b');
      await expect(tool('Pincel')).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press(String(index + 1));
      await expect(tool(label)).toHaveAttribute('aria-pressed', 'true');
    }
    await page.keyboard.press('b');
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, cancelable: true })));
    await expect(tool('Pincel')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Meta+z'); // Empty board: no server error or action.
    await expect(tool('Deshacer')).toBeDisabled();
    const canvas = page.getByLabel('Lienzo para dibujar');
    await canvas.click({ position: { x: 90, y: 90 } });
    await expect(tool('Deshacer')).toBeEnabled();
    const viewer = guest.getByLabel('Dibujo de la partida');
    const ink = () => viewer.evaluate((canvas: HTMLCanvasElement) => {
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      return data.some((value, i) => i % 4 !== 3 && value < 200);
    });
    await expect.poll(ink).toBe(true);
    await page.keyboard.press('Control+z');
    await expect(tool('Deshacer')).toBeDisabled();
    await expect.poll(ink).toBe(false);
    await canvas.click({ position: { x: 90, y: 90 } });
    await expect(tool('Deshacer')).toBeEnabled();
    await page.keyboard.press('Meta+z');
    await expect(tool('Deshacer')).toBeDisabled();
    await page.keyboard.press('t');
    await canvas.click({ position: { x: 120, y: 120 } });
    const input = page.getByLabel('Texto para el lienzo');
    await input.fill(''); await input.pressSequentially('pelforst12345678');
    await expect(input).toHaveValue('pelforst12345678');
    await expect(tool('Texto')).toHaveAttribute('aria-pressed', 'true');
    await input.press('Enter');
    await expect(tool('Deshacer')).toBeEnabled();
    await canvas.click({ position: { x: 120, y: 180 } });
    await input.fill('borrador'); await input.press('Control+z');
    await expect(tool('Deshacer')).toBeEnabled();
    await input.press('Escape');
    await guest.getByLabel('Tu respuesta o mensaje').fill('');
    await guest.getByLabel('Tu respuesta o mensaje').pressSequentially('pelforst12345678');
    await expect(guest.getByLabel('Tu respuesta o mensaje')).toHaveValue('pelforst12345678');
    await guest.locator('body').click({ position: { x: 0, y: 0 } });
    await guest.keyboard.press('r'); await guest.keyboard.press('Control+z');
    await expect(guest.getByRole('button', { name: 'Pincel', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(tool('Deshacer')).toBeEnabled();
    await page.getByRole('button', { name: 'Moderar a Caserita' }).click();
    await page.keyboard.press('b'); await page.keyboard.press('Control+z');
    await expect(tool('Texto')).toHaveAttribute('aria-pressed', 'true');
    await expect(tool('Deshacer')).toBeEnabled();
  } finally { await context.close(); }
});

test('partida entre dos navegadores: sala, figuras, texto protegido, relleno y acierto', async ({ page, browser }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const code = await createRoom(page);
  await page.getByLabel('Rondas', { exact: true }).selectOption('1');
  const other = await browser.newContext(); const guest = await other.newPage();
  try {
    guest.on('pageerror', error => errors.push(error.message));
    await guest.goto(`/?sala=${code}`); await guest.getByLabel('¿Cómo te dice la tropa?').fill('Caserita');
    await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
    await expect(guest.getByText('Que no falte nadie, pues.')).toBeVisible();
    await expect(page.getByRole('button', { name: '¡A pintar, pues!' })).toBeEnabled();
    await page.getByRole('button', { name: '¡A pintar, pues!' }).click();
    const choice = page.locator('.word-choices button').first(); await expect(choice).toBeVisible();
    const word = (await choice.innerText()).trim(); await choice.click();
    await expect(page.getByLabel('Lienzo para dibujar')).toBeVisible();
    await expect(guest.getByRole('button', { name: 'Pincel', exact: true })).toBeDisabled();
    const canvas = page.getByLabel('Lienzo para dibujar'); const box = (await canvas.boundingBox())!;
    await page.getByRole('button', { name: 'Cuadrado', exact: true }).click();
    await page.mouse.move(box.x + 50, box.y + 50); await page.mouse.down();
    await page.mouse.move(box.x + 140, box.y + 140, { steps: 8 }); await page.mouse.up();
    await expect(page.getByRole('button', { name: 'Deshacer', exact: true })).toBeEnabled();
    const viewer = guest.getByLabel('Dibujo de la partida');
    await expect.poll(() => viewer.evaluate((canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext('2d')!; return Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data).filter((value, i) => i % 4 !== 3 && value < 200).length;
    })).toBeGreaterThan(100);
    await page.getByRole('button', { name: 'Texto', exact: true }).click();
    await canvas.click({ position: { x: 180, y: 70 } });
    await expect(page.getByLabel('Texto para el lienzo')).toBeFocused();
    await page.getByLabel('Texto para el lienzo').fill('   ');
    await page.getByLabel('Texto para el lienzo').press('Enter');
    await expect(page.getByLabel('Texto para el lienzo')).toHaveCount(0);
    await canvas.click({ position: { x: 180, y: 70 } });
    await page.getByLabel('Texto para el lienzo').fill('PRUEBA');
    await page.getByLabel('Texto para el lienzo').press('Enter');
    // A valid text must reach the other player, and undo must remove it again.
    const textRegion = () => viewer.evaluate((canvas: HTMLCanvasElement) => {
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor(180 * canvas.width / rect.width); const y = Math.floor(70 * canvas.height / rect.height);
      return Array.from(canvas.getContext('2d')!.getImageData(x, y, 120, 100).data).filter((value, i) => i % 4 !== 3 && value < 200).length;
    });
    await expect.poll(textRegion).toBeGreaterThan(20);
    await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
    await expect.poll(textRegion).toBe(0);
    await canvas.click({ position: { x: 180, y: 70 } });
    await page.getByLabel('Texto para el lienzo').fill(word.toUpperCase().split('').join(' '));
    await page.getByLabel('Texto para el lienzo').press('Enter');
    await expect(page.getByRole('status')).toContainText('No escribas la respuesta');
    await page.getByLabel('Texto para el lienzo').press('Escape');
    await page.getByRole('button', { name: 'Color #ef5350', exact: true }).click();
    await page.getByRole('button', { name: 'Relleno', exact: true }).click();
    await canvas.click({ position: { x: 90, y: 90 } });
    await expect.poll(() => viewer.evaluate((canvas: HTMLCanvasElement) => {
      const rect = canvas.getBoundingClientRect(); const x = Math.round(90 * canvas.width / rect.width); const y = Math.round(90 * canvas.height / rect.height);
      return Array.from(canvas.getContext('2d')!.getImageData(x, y, 1, 1).data);
    })).toEqual([239, 83, 80, 255]);
    await guest.getByLabel('Tu respuesta o mensaje').fill(word);
    await guest.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(guest.locator('.word-strip strong')).toHaveText(word);
    await expect(guest.getByText('¡Caserita adivinó!', { exact: false })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await other.close(); }
});

test('las pistas aparecen solas para quien adivina y el dibujante conserva la palabra', async ({ page, browser }) => {
  const code = await createRoom(page);
  await page.getByLabel('Tiempo por turno', { exact: true }).selectOption('30');
  const context = await browser.newContext(); const guest = await context.newPage();
  try {
    await guest.goto(`/?sala=${code}`); await guest.getByLabel('¿Cómo te dice la tropa?').fill('Caserita');
    await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
    await expect(guest.getByText('Que no falte nadie, pues.')).toBeVisible();
    await page.getByRole('button', { name: '¡A pintar, pues!' }).click();
    const choice = page.locator('.word-choices button').first();
    const word = (await choice.innerText()).trim(); await choice.click();
    const hint = guest.locator('.word-strip strong');
    await expect(hint).toHaveClass('hint');
    const initial = await hint.innerText();
    expect(initial).not.toMatch(/[\p{L}\p{N}]/u);
    await expect(hint).toHaveText(/[\p{L}\p{N}]/u, { timeout: 14000 });
    expect(await hint.innerText()).not.toBe(word);
    await expect(page.locator('.word-strip strong')).toHaveText(word);
  } finally { await context.close(); }
});

test('móvil: portada y sala caben en la pantalla, palabras propias y salida', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.hero-copy h1')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await createRoom(page);
  await page.getByText('+ Agregar las palabras de tu grupo').click();
  await page.getByLabel('Palabras personalizadas').fill('chango, caserita, ya pues');
  await page.getByRole('button', { name: 'Agregar palabras', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Personalizadas (3)' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Salir de la sala' }).click();
  await expect(page.getByRole('button', { name: '¡Armemos la sala!' })).toBeVisible();
});

test('MP3 reales: acierto, final, Steve y Roblox respetan silencio y volumen', async ({ page, browser }) => {
  // Observe real Web Audio sources while still letting Chromium decode and play the MP3s.
  const observeAudio = () => {
    const state = { starts: 0, stops: 0 };
    (window as unknown as { observedAudio: typeof state }).observedAudio = state;
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = create.call(this); const start = source.start.bind(source); const stop = source.stop.bind(source);
      source.start = (...args: Parameters<typeof source.start>) => { state.starts++; start(...args); };
      source.stop = (...args: Parameters<typeof source.stop>) => { state.stops++; stop(...args); };
      return source;
    };
  };
  await page.addInitScript(observeAudio);
  const fanfareResponse = page.waitForResponse(response => response.url().endsWith('/audio/game/success-fanfare-trumpets.mp3'));
  const code = await createRoom(page);
  expect((await fanfareResponse).ok()).toBe(true);
  await page.getByLabel('Rondas', { exact: true }).selectOption('1');
  const context = await browser.newContext(); await context.addInitScript(observeAudio);
  const guest = await context.newPage();
  const count = (target: Page) => target.evaluate(() => (window as unknown as { observedAudio: { starts: number } }).observedAudio.starts);
  try {
    await guest.goto(`/?sala=${code}`); await guest.getByLabel('¿Cómo te dice la tropa?').fill('Caserita');
    await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
    for (const target of [page, guest]) {
      await target.getByRole('button', { name: 'Abrir efectos', exact: true }).click();
      await expect(target.getByRole('button', { name: 'Silenciar sonidos' })).toBeEnabled();
      await expect(target.getByLabel('Volumen de efectos')).toHaveValue('35');
    }
    await page.getByLabel('Volumen de efectos').fill('20');
    await expect(page.getByLabel('Volumen de efectos')).toHaveValue('20');
    for (const target of [page, guest]) await target.getByRole('button', { name: 'Cerrar efectos', exact: true }).click();
    await page.getByRole('button', { name: '¡A pintar, pues!' }).click();
    const choice = page.locator('.word-choices button').first(); const word = (await choice.innerText()).trim(); await choice.click();
    await page.getByRole('button', { name: 'Texto', exact: true }).click();
    await page.getByLabel('Lienzo para dibujar').click({ position: { x: 120, y: 90 } });
    await page.getByLabel('Texto para el lienzo').fill(word);
    await page.getByLabel('Texto para el lienzo').press('Enter');
    await expect(page.getByRole('status')).toContainText('No escribas la respuesta');
    expect(await count(page)).toBe(0); expect(await count(guest)).toBe(0);
    await guest.getByRole('button', { name: 'Reportar al pintor', exact: true }).click();
    await expect.poll(() => count(page)).toBe(2); await expect.poll(() => count(guest)).toBe(2);
    await expect(guest.getByRole('button', { name: 'Reportar al pintor', exact: true })).toHaveCount(0);
    await expect(guest.locator('.reveal-banner')).toContainText(word);
    await page.getByRole('button', { name: 'Abrir efectos', exact: true }).click();
    await page.getByRole('button', { name: 'Silenciar sonidos' }).click();
    await expect(page.getByLabel('Volumen de efectos')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { observedAudio: { stops: number } }).observedAudio.stops)).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Cerrar efectos', exact: true }).click();
    // El reporte unánime avanza solo; no hace falta adivinar y no concede puntos.
    await expect(guest.locator('.word-strip strong')).toHaveText(word);
    expect(await count(guest)).toBe(2);
    await expect(guest.locator('.player > div > span')).toHaveText(['0 puntos', '0 puntos']);
    expect(await count(page)).toBe(2);
    await expect(guest.locator('.word-choices button').first()).toBeVisible({ timeout: 10000 });
    const next = guest.locator('.word-choices button').first(); const finalWord = (await next.innerText()).trim(); await next.click();
    // Only the guesser hears their reaction; this guesser is muted.
    await page.getByLabel('Tu respuesta o mensaje').fill(finalWord);
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect.poll(() => count(guest)).toBe(2); // Final acierto, todavía sin fanfarria.
    await expect(guest.locator('.winner')).toHaveCount(0);
    await expect(guest.locator('.winner')).toBeVisible({ timeout: 10000 });
    await expect.poll(() => count(guest)).toBe(3); // Una sola fanfarria al mostrar al ganador.
    expect(await count(page)).toBe(2); // El jugador silenciado tampoco oye el final.
    await page.getByRole('button', { name: 'Abrir efectos', exact: true }).click();
    await page.getByRole('button', { name: 'Activar sonidos' }).click();
    await expect(page.getByRole('button', { name: 'Silenciar sonidos' })).toBeEnabled();
    await page.getByRole('button', { name: 'Cerrar efectos', exact: true }).click();
    expect(await count(page)).toBe(2); // Reactivar sonidos no repite la celebración.
    await guest.getByLabel('Tu respuesta o mensaje').fill('gg tropa');
    await guest.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(page.getByText('gg tropa', { exact: true })).toBeVisible();
    expect(await count(guest)).toBe(3); // Actualizar el chat no repite el audio.
    await page.getByRole('button', { name: '¡Sale la revancha!' }).click();
    await expect(page.locator('.word-choices button').first()).toBeVisible();
    expect(await count(guest)).toBe(3);
  } finally { await context.close(); }
});
