import { test, expect } from '@playwright/test';

test('ojito en registro y login: conserva texto, no envía el formulario y se oculta al cerrar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar con cuenta', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const password = dialog.getByLabel('Contraseña', { exact: true });
  await password.fill('Mi-clave-12345');
  await dialog.getByRole('button', { name: 'Mostrar contraseña', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'text'); await expect(password).toHaveValue('Mi-clave-12345');
  await dialog.getByRole('button', { name: 'Ocultar contraseña', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await dialog.getByRole('button', { name: '¿No tienes cuenta? Créala aquí' }).click();
  await password.fill('Otra-clave-12345');
  await dialog.getByRole('button', { name: 'Mostrar contraseña', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await dialog.getByRole('button', { name: 'Cerrar cuenta' }).click();
  await page.getByRole('button', { name: 'Entrar con cuenta', exact: true }).click();
  await expect(password).toHaveValue(''); await expect(password).toHaveAttribute('type', 'password');
});

test('recuperación: pide correo y muestra aviso cuando el envío todavía no está configurado', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar con cuenta', exact: true }).click();
  await page.getByRole('button', { name: 'Olvidé mi contraseña' }).click();
  const dialog = page.getByRole('dialog', { name: 'Recuperar contraseña' });
  await dialog.getByLabel('Correo', { exact: true }).fill('cuenta@example.com');
  await dialog.getByRole('button', { name: 'Enviar enlace' }).click();
  await expect(dialog.getByRole('alert')).toContainText('todavía no está disponible');
  await dialog.getByRole('button', { name: 'Volver a iniciar sesión' }).click();
  await expect(page.getByRole('dialog', { name: 'Entrar con cuenta' })).toBeVisible();
});

test('enlace de recuperación: limpia URL, confirma clave, muestra ojito y permite volver a login', async ({ page }) => {
  const token = 'a'.repeat(64); let submitted: { token: string; password: string } | undefined;
  await page.route('**/api/password/reset', route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { message: 'Contraseña actualizada. Ya puedes iniciar sesión con la nueva.' } });
  });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto(`/#restablecer=${token}`);
  const dialog = page.getByRole('dialog', { name: 'Nueva contraseña', exact: true });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toBe('');
  await dialog.getByLabel('Nueva contraseña', { exact: true }).fill('Una-nueva-clave-123');
  await dialog.getByRole('button', { name: 'Mostrar nueva contraseña', exact: true }).click();
  await expect(dialog.getByLabel('Nueva contraseña', { exact: true })).toHaveAttribute('type', 'text');
  await dialog.getByLabel('Confirmar contraseña', { exact: true }).fill('No-coincide-12345');
  await dialog.getByRole('button', { name: 'Guardar nueva contraseña' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Las contraseñas no coinciden.');
  expect(submitted).toBeUndefined();
  await dialog.getByLabel('Confirmar contraseña', { exact: true }).fill('Una-nueva-clave-123');
  await dialog.getByRole('button', { name: 'Guardar nueva contraseña' }).click();
  await expect(page.getByRole('dialog', { name: 'Entrar con cuenta' })).toBeVisible();
  expect(submitted).toEqual({ token, password: 'Una-nueva-clave-123' });
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Contraseña actualizada');
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
