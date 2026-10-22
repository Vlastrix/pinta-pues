import { test, expect, type Page } from '@playwright/test';
import { GUESS_REACTION_FILES } from '../src/guessReactions';

function observeAudio() {
  let starts = 0;
  const create = AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource = function () {
    const source = create.call(this), start = source.start.bind(source);
    source.start = (...args: Parameters<typeof source.start>) => { starts++; start(...args); };
    return source;
  };
  (window as unknown as { audioStarts: () => number }).audioStarts = () => starts;
}
const count = (page: Page) => page.evaluate(() => (window as unknown as { audioStarts: () => number }).audioStarts());

test('acierto personal: puntos, estrellas, audio exclusivo, silencio y móvil', async ({ page, browser }) => {
  await page.addInitScript(observeAudio); await page.goto('/');
  await page.getByLabel('¿Cómo te dice la tropa?').fill('Artista');
  await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  const code = await page.locator('.room-heading h1>span').innerText();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(observeAudio);
  const guest = await context.newPage(), other = await context.newPage();
  try {
    for (const [tab, name] of [[guest, 'Uno'], [other, 'Dos']] as const) {
      await tab.goto(`/?sala=${code}`); await tab.getByLabel('¿Cómo te dice la tropa?').fill(name);
      await tab.getByRole('button', { name: 'Entrar a la sala' }).click();
      await tab.getByRole('button', { name: 'Abrir efectos', exact: true }).click();
      await expect(tab.getByRole('button', { name: 'Silenciar sonidos' })).toBeEnabled();
    }
    await guest.getByLabel('Volumen de efectos').fill('23');
    await other.getByRole('button', { name: 'Silenciar sonidos' }).click();
    for (const tab of [guest, other]) await tab.getByRole('button', { name: 'Cerrar efectos', exact: true }).click();
    await page.getByRole('button', { name: '¡A pintar, pues!' }).click();
    const choice = page.locator('.word-choices button').first(), word = (await choice.innerText()).trim(); await choice.click();
    const reaction = guest.waitForResponse(response => response.url().includes('/audio/guess-reactions/'));
    await guest.getByLabel('Tu respuesta o mensaje').fill(word); await guest.getByRole('button', { name: 'Enviar mensaje' }).click();
    const celebration = guest.locator('.guess-celebration');
    await expect(celebration).toBeVisible();
    const points = Number((await celebration.locator('.guess-reward-card > span').innerText()).match(/\d+/)![0]);
    expect(points).toBe(60);
    await expect(guest.locator('.player').filter({ hasText: 'Uno' }).locator('div > span')).toHaveText(`${points} puntos`);
    await expect(celebration.locator('.guess-sparks svg')).toHaveCount(8);
    await expect(celebration).toHaveCSS('pointer-events', 'none');
    await guest.locator('.board-surface').screenshot({ path: 'test-results/guess-celebration-mobile.png' });
    expect((await reaction).ok()).toBe(true);
    await expect.poll(() => count(guest)).toBe(1);
    expect(await count(page)).toBe(0); expect(await count(other)).toBe(0);
    await expect(page.locator('.guess-celebration')).toHaveCount(0); await expect(other.locator('.guess-celebration')).toHaveCount(0);
    await other.emulateMedia({ reducedMotion: 'reduce' });
    await other.evaluate(() => document.documentElement.dataset.theme = 'dark');
    await other.getByLabel('Tu respuesta o mensaje').fill(word); await other.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(other.locator('.guess-celebration')).toBeVisible();
    await expect(other.locator('.guess-celebration')).toHaveCSS('animation-name', 'none');
    await expect(other.locator('.guess-sparks')).toBeHidden();
    await other.locator('.board-surface').screenshot({ path: 'test-results/guess-celebration-dark.png' });
    expect(await count(other)).toBe(0);
    await expect(celebration).toHaveCount(0, { timeout: 4000 });
    expect(await count(guest)).toBe(1);
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});

test('todos los audios personales se pueden decodificar', async ({ page }) => {
  await page.goto('/');
  const decoded = await page.evaluate(async files => {
    const context = new AudioContext();
    try {
      return await Promise.all(files.map(async file => {
        try {
          const response = await fetch(file); if (!response.ok) throw new Error(file);
          const buffer = await context.decodeAudioData(await response.arrayBuffer());
          return { file, duration: buffer.duration };
        } catch { return { file, duration: 0 }; }
      }));
    } finally { await context.close(); }
  }, [...GUESS_REACTION_FILES]);
  expect(decoded).toHaveLength(18); expect(decoded.filter(clip => clip.duration <= 0)).toEqual([]);
});

test('reacciones aleatorias: evitan repetición y descartan cargas pendientes al silenciar', async ({ page }) => {
  await page.addInitScript(observeAudio); await page.goto('/'); await page.mouse.click(1, 1);
  const result = await page.evaluate(async () => {
    const modulePath = '/src/sound.ts'; const { SoundPlayer } = await import(modulePath);
    const player = new SoundPlayer(.23); await player.enable();
    const random = Math.random, fetchFile = window.fetch.bind(window), requested: string[] = [];
    let release: (() => void) | undefined;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const file = String(args[0]);
      if (file.includes('/guess-reactions/')) {
        requested.push(file);
        if (requested.length === 3) await new Promise<void>(resolve => { release = resolve; });
      }
      return fetchFile(...args);
    };
    Math.random = () => 0;
    const starts = () => (window as unknown as { audioStarts: () => number }).audioStarts();
    try {
      await player.correct(); await player.correct(); const audible = starts();
      const pending = player.correct(); player.mute(); await player.enable(); release!(); await pending;
      const afterCancelled = starts(); await player.correct(); const resumed = starts();
      return { requested, audible, afterCancelled, resumed };
    } finally { player.mute(); window.fetch = fetchFile; Math.random = random; }
  });
  expect(result.audible).toBe(2); expect(result.afterCancelled).toBe(2); expect(result.resumed).toBe(3);
  expect(new Set(result.requested).size).toBe(4);
});
