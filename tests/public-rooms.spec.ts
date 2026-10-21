import { test, expect } from '@playwright/test';

test('pública con un botón: crea, une desde móvil y vuelve a privada', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByLabel('¿Cómo te dice la tropa?').fill('Anfitrión público');
  await page.getByRole('button', { name: 'Jugar en sala pública' }).click();
  const code = await page.locator('.room-heading h1>span').innerText();
  await expect(page.getByLabel('Visibilidad de la sala')).toHaveValue('public');
  const context = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });
  const phone = await context.newPage();
  try {
    await phone.goto('/');
    await phone.getByRole('button', { name: 'Jugar en sala pública' }).click();
    await expect(phone.locator('.room-heading')).toHaveCount(0);
    await phone.getByLabel('¿Cómo te dice la tropa?').fill('Celular público');
    await phone.getByRole('button', { name: 'Jugar en sala pública' }).click();
    await expect(phone.locator('.room-heading h1>span')).toHaveText(code);
    await expect(phone.getByLabel('Visibilidad de la sala')).toBeDisabled();
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel('Visibilidad de la sala').selectOption('private');
    await expect(phone.getByLabel('Visibilidad de la sala')).toHaveValue('private');
    await phone.getByRole('button', { name: 'Salir de la sala', exact: true }).click();
    await phone.getByRole('button', { name: 'Jugar en sala pública' }).click();
    await expect(phone.locator('.room-heading h1>span')).not.toHaveText(code);
    await expect(phone.getByLabel('Visibilidad de la sala')).toHaveValue('public');
  } finally { await context.close(); }
});
