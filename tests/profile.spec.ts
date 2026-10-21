import { test, expect } from '@playwright/test';

test('mi cuenta: guarda apodo y avatar, recupera en otro navegador y permite cancelar', async ({ page, browser }) => {
  const email = `perfil-${Date.now()}@example.com`;
  const password = 'Una-clave-perfil-123';
  await page.request.post('/api/auth/register', { data: { email, password } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Mi cuenta', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Mi cuenta', exact: true });
  await dialog.getByLabel('Tu apodo').fill('Vanguard');
  await dialog.getByRole('button', { name: 'Elegir avatar', exact: true }).click();
  await page.getByRole('button', { name: 'Avatar 5', exact: true }).click();
  await dialog.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel('¿Cómo te dice la tropa?')).toHaveValue('Vanguard');
  const avatar = await page.locator('.entry-card .avatar-trigger img').getAttribute('src');
  await page.reload();
  await expect(page.getByLabel('¿Cómo te dice la tropa?')).toHaveValue('Vanguard');
  await page.getByRole('button', { name: 'Mi cuenta', exact: true }).click();
  await dialog.getByLabel('Tu apodo').fill('No guardar');
  await dialog.getByRole('button', { name: 'Cerrar cuenta' }).click();
  await page.getByRole('button', { name: 'Mi cuenta', exact: true }).click();
  await expect(dialog.getByLabel('Tu apodo')).toHaveValue('Vanguard');
  const context = await browser.newContext({ viewport: { width: 360, height: 640 } });
  try {
    await context.request.post('http://127.0.0.1:5175/api/auth/login', { data: { email, password } });
    const phone = await context.newPage(); await phone.goto('/');
    await expect(phone.getByLabel('¿Cómo te dice la tropa?')).toHaveValue('Vanguard');
    await expect(phone.locator('.entry-card .avatar-trigger img')).toHaveAttribute('src', avatar!);
    await phone.getByRole('button', { name: 'Mi cuenta', exact: true }).click();
    await expect(phone.getByLabel('Tu apodo')).toHaveValue('Vanguard');
    const centered = await phone.getByRole('button', { name: 'Cerrar sesión', exact: true }).boundingBox();
    const bounds = await phone.getByRole('dialog', { name: 'Mi cuenta', exact: true }).boundingBox();
    expect(Math.abs(centered!.x + centered!.width / 2 - bounds!.x - bounds!.width / 2)).toBeLessThan(2);
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});
