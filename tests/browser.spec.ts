import { test, expect, type Page } from '@playwright/test';

async function createRoom(page: Page) {
  await page.goto('/');
  await page.getByLabel('¿Cómo te dice la tropa?').fill('Vladi');
  await expect(page.getByRole('button', { name: '¡Armemos la sala!' })).toBeEnabled();
  await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  await expect(page.getByText('Que no falte nadie, pues.')).toBeVisible();
  return await page.locator('.room-heading h1>span').innerText();
}

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
    await expect(page.getByRole('status')).toContainText('Primero escribí una pista');
    await expect(page.getByLabel('Texto para el lienzo')).toBeFocused();
    await page.getByLabel('Texto para el lienzo').fill('   ');
    await canvas.click({ position: { x: 180, y: 70 } });
    await expect(page.getByRole('status')).toContainText('Primero escribí una pista');
    await expect(page.getByLabel('Texto para el lienzo')).toBeFocused();
    await page.getByLabel('Texto para el lienzo').fill('PRUEBA');
    await canvas.click({ position: { x: 180, y: 70 } });
    // A valid text must reach the other player, and undo must remove it again.
    const textRegion = () => viewer.evaluate((canvas: HTMLCanvasElement) => {
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor(180 * canvas.width / rect.width); const y = Math.floor(70 * canvas.height / rect.height);
      return Array.from(canvas.getContext('2d')!.getImageData(x, y - 30, 120, 30).data).filter((value, i) => i % 4 !== 3 && value < 200).length;
    });
    await expect.poll(textRegion).toBeGreaterThan(20);
    await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
    await expect.poll(textRegion).toBe(0);
    await page.getByLabel('Texto para el lienzo').fill(word.toUpperCase().split('').join(' '));
    await canvas.click({ position: { x: 180, y: 70 } });
    await expect(page.getByRole('status')).toContainText('No escribas la respuesta');
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
  await expect(page.getByRole('heading', { name: /Vos dibujá/ })).toBeVisible();
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

test('MP3 reales: denuncia unánime reproduce Steve y Roblox, respeta silencio y volumen', async ({ page, browser }) => {
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
  const code = await createRoom(page);
  const context = await browser.newContext(); await context.addInitScript(observeAudio);
  const guest = await context.newPage();
  const count = (target: Page) => target.evaluate(() => (window as unknown as { observedAudio: { starts: number } }).observedAudio.starts);
  try {
    await guest.goto(`/?sala=${code}`); await guest.getByLabel('¿Cómo te dice la tropa?').fill('Caserita');
    await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
    for (const target of [page, guest]) {
      await expect(target.getByRole('button', { name: 'Silenciar sonidos' })).toBeEnabled();
      await expect(target.getByLabel('Volumen de efectos')).toHaveValue('35');
    }
    await page.getByLabel('Volumen de efectos').fill('20');
    await expect(page.getByLabel('Volumen de efectos')).toHaveValue('20');
    await page.getByRole('button', { name: '¡A pintar, pues!' }).click();
    const choice = page.locator('.word-choices button').first(); const word = (await choice.innerText()).trim(); await choice.click();
    await page.getByRole('button', { name: 'Texto', exact: true }).click();
    await page.getByLabel('Texto para el lienzo').fill(word);
    await page.getByLabel('Lienzo para dibujar').click({ position: { x: 120, y: 90 } });
    await expect(page.getByRole('status')).toContainText('No escribas la respuesta');
    expect(await count(page)).toBe(0); expect(await count(guest)).toBe(0);
    await guest.getByRole('button', { name: 'Reportar al pintor', exact: true }).click();
    await expect.poll(() => count(page)).toBe(2); await expect.poll(() => count(guest)).toBe(2);
    await expect(guest.getByRole('button', { name: 'Pintor reportado' })).toBeDisabled();
    await page.getByRole('button', { name: 'Silenciar sonidos' }).click();
    await expect(page.getByLabel('Volumen de efectos')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { observedAudio: { stops: number } }).observedAudio.stops)).toBeGreaterThan(0);
    // Exercise the mute gate with a live server event, independently of its three-second cooldown.
    await guest.getByLabel('Tu respuesta o mensaje').fill(word);
    await guest.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(guest.locator('.word-strip strong')).toHaveText(word);
    await expect(guest.locator('.word-choices button').first()).toBeVisible({ timeout: 10000 });
    const next = guest.locator('.word-choices button').first(); await next.click();
    await page.getByRole('button', { name: 'Reportar al pintor', exact: true }).click();
    await expect.poll(() => count(guest)).toBe(4);
    expect(await count(page)).toBe(2);
  } finally { await context.close(); }
});
