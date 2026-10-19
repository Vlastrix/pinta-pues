import { test, expect } from '@playwright/test';

test('cuenta opcional: registro, sesión tras recargar, salir y volver a entrar', async ({ page }) => {
  await page.goto('/');
  const email = `cuenta-${Date.now()}@example.com`; const password = 'Una-clave-larga-123!';
  await page.getByRole('button', { name: 'Entrar con cuenta', exact: true }).click();
  await page.getByRole('button', { name: '¿No tienes cuenta? Créala aquí', exact: true }).click();
  await page.getByLabel('Correo', { exact: true }).fill(email); await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mi cuenta', exact: true })).toBeEnabled();
  await page.reload(); await page.getByRole('button', { name: 'Mi cuenta', exact: true }).click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Entrar con cuenta', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Entrar con cuenta', exact: true }).click();
  await page.getByLabel('Correo', { exact: true }).fill(email); await page.getByLabel('Contraseña', { exact: true }).fill('incorrecta-pero-larga');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mi cuenta', exact: true })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('el anfitrión borra mensajes, silencia, habilita y expulsa; el invitado no puede reingresar', async ({ page, browser }) => {
  await page.goto('/'); await page.getByLabel('¿Cómo te dice la tropa?').fill('Vladi');
  await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  await expect(page.getByText('Que no falte nadie, pues.')).toBeVisible();
  const code = await page.locator('.room-heading h1>span').innerText();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest = await context.newPage();
  try {
    await guest.goto(`/?sala=${code}`); await guest.getByLabel('¿Cómo te dice la tropa?').fill('Caserita');
    await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
    await expect(guest.getByText('Que no falte nadie, pues.')).toBeVisible();
    await expect(guest.getByRole('button', { name: 'Moderar a Vladi' })).toHaveCount(0);
    await guest.getByLabel('Tu respuesta o mensaje').fill('mensaje a borrar'); await guest.getByRole('button', { name: 'Enviar mensaje' }).click();
    await page.getByRole('button', { name: 'Borrar mensaje de Caserita' }).click();
    await expect(guest.getByText('mensaje a borrar', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Moderar a Caserita' }).click();
    await page.getByRole('button', { name: 'Silenciar chat', exact: true }).click();
    await expect(guest.getByLabel('Tu respuesta o mensaje')).toBeDisabled();
    await page.getByRole('button', { name: 'Moderar a Caserita' }).click();
    await page.getByRole('button', { name: 'Habilitar chat', exact: true }).click();
    await expect(guest.getByLabel('Tu respuesta o mensaje')).toBeEnabled();
    await page.getByRole('button', { name: 'Moderar a Caserita' }).click();
    await page.getByRole('button', { name: 'Expulsar de la sala', exact: true }).click();
    await page.getByRole('button', { name: 'Sí, expulsar', exact: true }).click();
    await expect(guest.getByRole('status')).toContainText('te expulsó');
    await expect(guest.getByRole('button', { name: 'Entrar a la sala', exact: true })).toBeEnabled();
    await guest.goto(`/?sala=${code}`); await guest.getByRole('button', { name: 'Entrar a la sala', exact: true }).click();
    await expect(guest.getByRole('status')).toContainText('Fuiste expulsado de esta sala.');
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});
