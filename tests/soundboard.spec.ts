import { test, expect, type Page } from '@playwright/test';
import { SOUNDBOARD_CLIPS } from '../shared/soundboard';

function observeAudio() {
  const contexts = new Map<AudioContext, { gain: GainNode; starts: number; stops: number }>();
  const createGain = AudioContext.prototype.createGain;
  const createSource = AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createGain = function () {
    const gain = createGain.call(this); contexts.set(this, { gain, starts: 0, stops: 0 }); return gain;
  };
  AudioContext.prototype.createBufferSource = function () {
    const source = createSource.call(this); const start = source.start.bind(source); const stop = source.stop.bind(source);
    source.start = (...args: Parameters<typeof source.start>) => { contexts.get(this)!.starts++; start(...args); };
    source.stop = (...args: Parameters<typeof source.stop>) => { contexts.get(this)!.stops++; stop(...args); };
    return source;
  };
  (window as unknown as { audioState: () => unknown }).audioState = () => [...contexts.values()].map(record => ({ starts: record.starts, stops: record.stops, volume: record.gain.gain.value }));
}
const stats = (page: Page) => page.evaluate(() => (window as unknown as { audioState: () => { starts: number; stops: number; volume: number }[] }).audioState());

test('soundboard: audio real compartido, silencio y volumen independientes, preferencias y móvil', async ({ page, browser }) => {
  await page.addInitScript(observeAudio); await page.goto('/');
  await page.getByLabel('¿Cómo te dice la tropa?').fill('Host'); await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  const code = await page.locator('.room-heading h1>span').innerText();
  const context = await browser.newContext({ viewport: { width: 360, height: 640 } }); await context.addInitScript(observeAudio);
  const guest = await context.newPage();
  try {
    await guest.goto(`/?sala=${code}`); await guest.getByLabel('¿Cómo te dice la tropa?').fill('Amigo'); await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
    await page.getByRole('button', { name: 'Abrir efectos', exact: true }).click();
    await page.getByRole('button', { name: 'Silenciar sonidos', exact: true }).click();
    await page.getByRole('button', { name: 'Cerrar efectos', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir soundboard' }).click(); await guest.getByRole('button', { name: 'Abrir soundboard' }).click();
    const board = page.getByRole('region', { name: 'Soundboard' }); const guestBoard = guest.getByRole('region', { name: 'Soundboard' });
    await expect(board.locator('.soundboard-clips button')).toHaveCount(SOUNDBOARD_CLIPS.length);
    await guest.getByLabel('Volumen del soundboard').fill('20'); await guestBoard.getByRole('button', { name: 'Silenciar soundboard' }).click();
    await expect(guestBoard.locator('.soundboard-clips button').first()).toBeDisabled();
    await expect(guestBoard.getByText('Activa el soundboard para escuchar y enviar audios.')).toBeVisible();
    await board.getByLabel('Buscar audio').fill('uwu'); await board.getByRole('button', { name: 'uwu', exact: true }).click();
    await expect.poll(async () => (await stats(page))[1]?.starts).toBe(1);
    expect((await stats(guest))[1].starts).toBe(0);
    await guestBoard.getByRole('button', { name: 'Activar soundboard' }).click();
    await expect(guestBoard.locator('.soundboard-clips button').first()).toBeEnabled();
    expect((await stats(guest))[1].starts).toBe(0);
    await board.getByLabel('Buscar audio').fill('old hardware');
    await expect(board.getByRole('button', { name: 'old hardware', exact: true })).toBeEnabled();
    await board.getByRole('button', { name: 'old hardware', exact: true }).click();
    await expect.poll(async () => (await stats(guest))[1].starts).toBe(1);
    expect((await stats(page))[0].starts).toBe(0);
    expect((await stats(guest))[1].volume).toBeCloseTo(.2);
    expect((await stats(guest))[0].volume).toBeCloseTo(.35);
    await guestBoard.getByRole('button', { name: 'Silenciar soundboard' }).click();
    expect((await stats(guest))[1].stops).toBeGreaterThan(0);
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await guest.getByRole('button', { name: 'Cerrar soundboard' }).click();
    await guest.getByRole('button', { name: 'Salir de la sala', exact: true }).click();
    await expect(guest.getByRole('button', { name: 'Entrar a la sala' })).toBeVisible();
    await guest.goto(`/?sala=${code}`); await guest.getByRole('button', { name: 'Entrar a la sala' }).click(); await guest.getByRole('button', { name: 'Abrir soundboard' }).click();
    await expect(guest.getByRole('button', { name: 'Activar soundboard' })).toBeVisible(); await expect(guest.getByLabel('Volumen del soundboard')).toHaveValue('20');
    await expect(guest.getByRole('region', { name: 'Soundboard' }).locator('.soundboard-clips button').first()).toBeDisabled();
  } finally { await context.close(); }
});

test('panel flotante: permite chat, dibujo y envíos repetidos; se mueve y cabe en móvil', async ({ page, browser }) => {
  let sends = 0;
  page.on('websocket', socket => socket.on('framesent', frame => {
    const data = frame.payload.toString(); const index = data.indexOf('[');
    if (data.startsWith('42') && index >= 0 && JSON.parse(data.slice(index))[0] === 'soundboard:play') sends++;
  }));
  await page.goto('/'); await page.getByLabel('¿Cómo te dice la tropa?').fill('Artista');
  await page.getByRole('button', { name: '¡Armemos la sala!' }).click(); const code = await page.locator('.room-heading h1>span').innerText();
  const context = await browser.newContext(); const guest = await context.newPage();
  try {
    await guest.goto(`/?sala=${code}`); await guest.getByLabel('¿Cómo te dice la tropa?').fill('Amigo'); await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
    await page.getByRole('button', { name: 'Abrir soundboard' }).click();
    const board = page.getByRole('region', { name: 'Soundboard' });
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await page.getByLabel('Tu respuesta o mensaje').fill('Chat con soundboard abierto'); await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(guest.getByText('Chat con soundboard abierto', { exact: true })).toBeVisible();
    await expect(board).toBeVisible();
    await board.getByLabel('Buscar audio').fill('uwu');
    for (let i = 0; i < 4; i++) await board.getByRole('button', { name: 'uwu', exact: true }).click();
    await expect.poll(() => sends).toBe(4); await expect(board.getByRole('button', { name: 'uwu', exact: true })).toBeEnabled();
    const grip = (await board.getByRole('button', { name: 'Mover soundboard' }).boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down(); await page.mouse.move(20, 20, { steps: 5 }); await page.mouse.up();
    expect((await board.boundingBox())!.x).toBeLessThan(30);
    await page.getByRole('button', { name: '¡A pintar, pues!' }).click(); await page.locator('.word-choices button').first().click();
    const canvas = page.getByLabel('Lienzo para dibujar'); const bounds = (await canvas.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height * .5); await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * .9, bounds.y + bounds.height * .5); await page.mouse.up();
    await expect(page.getByRole('button', { name: 'Deshacer', exact: true })).toBeEnabled(); await expect(board).toBeVisible();
    await page.setViewportSize({ width: 320, height: 640 });
    await expect.poll(async () => { const rect = (await board.boundingBox())!; return rect.x >= 0 && rect.x + rect.width <= 320 && rect.y >= 0 && rect.y + rect.height <= 640; }).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape'); await expect(board).toHaveCount(0);
  } finally { await context.close(); }
});

test('soundboard: cambia de tamaño, distribuye los audios y conserva controles en móvil', async ({ page }) => {
  await page.goto('/'); await page.getByLabel('¿Cómo te dice la tropa?').fill('Tamaño');
  await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  await page.getByRole('button', { name: 'Abrir soundboard' }).click();
  const board = page.getByRole('region', { name: 'Soundboard' });
  const grip = (await board.getByRole('button', { name: 'Mover soundboard' }).boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down(); await page.mouse.move(30, 30, { steps: 4 }); await page.mouse.up();
  const before = (await board.boundingBox())!, handle = board.getByRole('button', { name: 'Cambiar tamaño del soundboard' });
  const corner = (await handle.boundingBox())!;
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2); await page.mouse.down();
  await page.mouse.move(corner.x + corner.width / 2 + 250, corner.y + corner.height / 2 + 100, { steps: 5 }); await page.mouse.up();
  const grown = (await board.boundingBox())!;
  expect(grown.width).toBeGreaterThan(before.width + 200); expect(grown.height).toBeGreaterThan(before.height + 50);
  expect(await board.locator('.soundboard-clips').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBeGreaterThan(2);
  await handle.focus(); await handle.press('ArrowLeft');
  await expect.poll(async () => (await board.boundingBox())!.width).toBeCloseTo(grown.width - 20, 0);
  await board.getByLabel('Buscar audio').fill('uwu'); await expect(board.getByRole('button', { name: 'uwu', exact: true })).toBeVisible();
  const customWidth = (await board.boundingBox())!.width;
  await board.getByRole('button', { name: 'Cerrar soundboard' }).click(); await page.getByRole('button', { name: 'Abrir soundboard' }).click();
  expect((await board.boundingBox())!.width).toBeCloseTo(customWidth, 0);
  await page.setViewportSize({ width: 320, height: 640 });
  await expect.poll(async () => { const b = (await board.boundingBox())!; return b.x >= 0 && b.x + b.width <= 320 && b.y >= 0 && b.y + b.height <= 640; }).toBe(true);
  await handle.focus(); for (let i = 0; i < 18; i++) await handle.press('ArrowUp');
  await expect(handle).toBeInViewport(); await expect(board.getByLabel('Buscar audio')).toBeVisible();
  await expect(board.getByRole('button', { name: 'uwu', exact: true })).toBeInViewport();
  await page.screenshot({ path: 'test-results/soundboard-resized-mobile.png' });
  await page.getByLabel('Tu respuesta o mensaje').fill('Sigo en el chat'); await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect(page.getByText('Sigo en el chat', { exact: true })).toBeVisible();
  await expect(board).toBeVisible();
});

test('todos los archivos importados se pueden decodificar en el navegador', async ({ page }) => {
  await page.goto('/');
  const failures = await page.evaluate(async files => {
    const context = new AudioContext(); const failures: string[] = [];
    try {
      for (const file of files) {
        try { const response = await fetch(`/audio/soundboard/${encodeURIComponent(file)}`); if (!response.ok) throw new Error(); const buffer = await context.decodeAudioData(await response.arrayBuffer()); if (!buffer.duration) throw new Error(); }
        catch { failures.push(file); }
      }
    } finally { await context.close(); }
    return failures;
  }, SOUNDBOARD_CLIPS.map(clip => clip.file));
  expect(failures).toEqual([]);
});
