import { test, expect } from '@playwright/test';

test('adivinar por partes: pista privada en móvil, recarga y puntos solo al completar', async ({ page, browser }) => {
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const guest = await mobile.newPage(), other = await mobile.newPage();
  try {
    await page.goto('/'); await page.getByLabel('¿Cómo te dice la tropa?').fill('Pintor');
    await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
    const code = await page.locator('.room-heading h1>span').innerText();
    for (const [tab, name] of [[guest, 'Uno'], [other, 'Dos']] as const) {
      await tab.goto(`/?sala=${code}`); await tab.getByLabel('¿Cómo te dice la tropa?').fill(name);
      await tab.getByRole('button', { name: 'Entrar a la sala' }).click();
    }
    await page.locator('.custom-words summary').click();
    await page.getByLabel('Palabras personalizadas').fill('candado digital, palabraalfa, palabrabeta');
    await page.getByRole('button', { name: 'Agregar palabras', exact: true }).click();
    for (const category of await page.locator('.category-picker button.selected').allTextContents()) {
      if (!category.startsWith('Personalizadas')) await page.locator('.category-picker').getByRole('button', { name: category, exact: true }).click();
    }
    await page.getByRole('button', { name: '¡A pintar, pues!' }).click();
    await page.locator('.word-choices').getByRole('button', { name: 'candado digital', exact: true }).click();
    await guest.getByLabel('Tu respuesta o mensaje').fill('CANDADO'); await guest.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(guest.locator('.word-strip strong')).toHaveText('candado _______');
    await expect(guest.locator('.chat-tip')).toContainText('¡Vas bien!');
    await expect(guest.locator('.player').filter({ hasText: 'Uno' }).locator('div > span')).toHaveText('0 puntos');
    await expect(other.locator('.word-strip strong')).toHaveText('_______ _______');
    await expect(other.locator('.messages')).not.toContainText('CANDADO');
    await guest.reload(); await expect(guest.locator('.word-strip strong')).toHaveText('candado _______');
    await expect(guest.getByLabel('Tu respuesta o mensaje')).toBeEnabled();
    await guest.getByLabel('Tu respuesta o mensaje').fill('digital'); await guest.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(guest.locator('.player').filter({ hasText: 'Uno' }).locator('div > span')).toHaveText('60 puntos');
    await expect(guest.getByLabel('Tu respuesta o mensaje')).toBeDisabled();
    await expect(guest.locator('.guess-celebration')).toBeVisible();
    await expect(other.getByLabel('Tu respuesta o mensaje')).toBeEnabled();
    await expect(other.locator('.word-strip strong')).not.toContainText('candado');
  } finally { await mobile.close(); }
});
