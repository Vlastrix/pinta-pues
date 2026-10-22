import { test, expect } from '@playwright/test';

test('bandera dentro del lienzo: posición responsive, reporte confirmado y paso de turno', async ({ page, browser }) => {
  await page.goto('/'); await page.getByLabel('¿Cómo te dice la tropa?').fill('Artista');
  await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  const code = await page.locator('.room-heading h1>span').innerText();
  const context = await browser.newContext(); const guest = await context.newPage(), other = await context.newPage();
  try {
    for (const [tab, name] of [[guest, 'Uno'], [other, 'Dos']] as const) {
      await tab.goto(`/?sala=${code}`); await tab.getByLabel('¿Cómo te dice la tropa?').fill(name); await tab.getByRole('button', { name: 'Entrar a la sala' }).click();
    }
    await page.getByRole('button', { name: '¡A pintar, pues!' }).click(); await page.locator('.word-choices button').first().click();
    await expect(page.getByRole('button', { name: 'Reportar al pintor', exact: true })).toHaveCount(0);
    const button = guest.getByRole('button', { name: 'Reportar al pintor', exact: true });
    for (const width of [1440, 390, 320]) {
      await guest.setViewportSize({ width, height: 844 });
      const box = (await button.boundingBox())!, canvas = (await guest.getByLabel('Dibujo de la partida').boundingBox())!;
      expect(box.width).toBe(44); expect(box.height).toBe(44);
      expect(box.x).toBeGreaterThan(canvas.x); expect(box.y).toBeGreaterThan(canvas.y);
      expect(canvas.x + canvas.width - box.x - box.width).toBeLessThanOrEqual(14);
      expect(canvas.y + canvas.height - box.y - box.height).toBeLessThanOrEqual(14);
      expect(box.x + box.width).toBeLessThan(canvas.x + canvas.width);
      expect(box.y + box.height).toBeLessThan(canvas.y + canvas.height);
      await expect(guest.locator('.report-row')).toHaveCount(0);
    }
    await guest.locator('.board-surface').screenshot({ path: 'test-results/report-canvas-mobile.png' });
    await button.click();
    const reported = guest.getByRole('button', { name: 'Pintor reportado', exact: true });
    await expect(reported).toBeDisabled(); await expect(reported).toHaveAttribute('aria-pressed', 'true');
    await expect(reported.locator('.report-count')).toHaveText('1/2');
    await guest.evaluate(() => document.documentElement.dataset.theme = 'dark');
    await guest.locator('.board-surface').screenshot({ path: 'test-results/report-canvas-dark.png' });
    await page.waitForTimeout(3100); // El servidor exige 3 s entre reportes de la sala.
    await other.getByRole('button', { name: 'Reportar al pintor', exact: true }).click();
    await expect(guest.locator('.reveal-banner')).toBeVisible(); await expect(reported).toHaveCount(0);
    await expect(guest.locator('.player > div > span')).toHaveText(['0 puntos', '0 puntos', '0 puntos']);
    await expect(guest.locator('.word-choices button').first()).toBeVisible({ timeout: 10000 });
  } finally { await context.close(); }
});
