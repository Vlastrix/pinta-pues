import { test, expect } from '@playwright/test';

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

test('broma del creador: solo al remitente, tres cierres, teclado y móvil', async ({ page, browser }) => {
  await page.addInitScript(observeAudio);
  await page.goto('/'); await page.getByLabel('¿Cómo te dice la tropa?').fill('Host');
  await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  const code = await page.locator('.room-heading h1>span').innerText();
  const context = await browser.newContext({ viewport: { width: 320, height: 640 } }); await context.addInitScript(observeAudio); const guest = await context.newPage();
  try {
    await guest.goto(`/?sala=${code}`); await guest.getByLabel('¿Cómo te dice la tropa?').fill('Fresco');
    await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
    let audible = 0;
    for (const phrase of ['vLaDi FrEsCo', 'VLADI GRAN PVTA', 'Vladi puto']) {
      if (phrase === 'Vladi puto') {
        await guest.getByRole('button', { name: 'Abrir efectos', exact: true }).click();
        await guest.getByRole('button', { name: 'Silenciar sonidos', exact: true }).click();
        await guest.getByRole('button', { name: 'Cerrar efectos', exact: true }).click();
      } else audible++;
      await guest.getByLabel('Tu respuesta o mensaje').fill(phrase); await guest.getByRole('button', { name: 'Enviar mensaje' }).click();
      const modal = guest.getByRole('dialog', { name: '¡Al creador se lo respeta, pues!' });
      await expect(modal).toBeVisible(); await expect(page.locator('.creator-prank')).toHaveCount(0);
      for (const tab of [page, guest]) {
        const announcement = tab.locator('.message.prank strong').last();
        await expect(announcement).toHaveText('¡Fresco es un traidor! Al creador se lo respeta, pues. 👑');
        await expect(announcement).toHaveCSS('font-weight', '800');
      }
      await expect.poll(() => guest.evaluate(() => (window as unknown as { audioStarts: () => number }).audioStarts())).toBe(audible);
      expect(await page.evaluate(() => (window as unknown as { audioStarts: () => number }).audioStarts())).toBe(0);
      const before = (await modal.getByRole('button').boundingBox())!;
      await modal.getByRole('button', { name: 'Cerrar (1/3)', exact: true }).click();
      await expect(modal.getByRole('button', { name: 'Cerrar (2/3)', exact: true })).toBeVisible();
      const after = (await modal.getByRole('button').boundingBox())!;
      expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(20);
      const area = (await modal.locator('.creator-prank-playground').boundingBox())!;
      expect(after.x).toBeGreaterThanOrEqual(area.x - 1); expect(after.y).toBeGreaterThanOrEqual(area.y - 1);
      expect(after.x + after.width).toBeLessThanOrEqual(area.x + area.width + 1);
      expect(after.y + after.height).toBeLessThanOrEqual(area.y + area.height + 1);
      await expect(modal.getByRole('button')).toBeFocused();
      await guest.keyboard.press('Escape');
      expect(await guest.evaluate(() => (window as unknown as { audioStarts: () => number }).audioStarts())).toBe(audible);
      await expect(modal.getByRole('button', { name: 'Cerrar (3/3)', exact: true })).toBeVisible();
      expect(await modal.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await modal.getByRole('button', { name: 'Cerrar (3/3)', exact: true }).click();
      await expect(modal).toHaveCount(0);
      await expect(guest.getByLabel('Tu respuesta o mensaje')).toBeFocused();
      await guest.waitForTimeout(360);
    }
  } finally { await context.close(); }
});
