import { test, expect } from '@playwright/test';

test('efectos flotantes sin ocupar el chat: volumen, silencio, cierre y móvil', async ({ page }) => {
  await page.goto('/'); await page.getByLabel('¿Cómo te dice la tropa?').fill('Efectos');
  await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  const trigger = page.getByRole('button', { name: 'Abrir efectos', exact: true });
  const panel = page.getByRole('region', { name: 'Efectos del juego', exact: true });
  const messages = page.getByLabel('Chat de la sala');
  const before = (await messages.boundingBox())!;
  await trigger.click(); await expect(panel).toBeVisible();
  const after = (await messages.boundingBox())!;
  expect(after.y).toBe(before.y); expect(after.height).toBe(before.height);
  await expect(page.locator('.chat-panel > .sound-volume')).toHaveCount(0);
  await page.getByLabel('Volumen de efectos').fill('23'); await expect(panel.getByText('23%')).toBeVisible();
  await panel.getByRole('button', { name: 'Silenciar sonidos', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Activar sonidos', exact: true })).toBeEnabled();
  await panel.getByRole('button', { name: 'Activar sonidos', exact: true }).click();
  await expect(page.getByLabel('Volumen de efectos')).toHaveValue('23');
  await page.getByLabel('Tu respuesta o mensaje').click();
  await page.getByLabel('Tu respuesta o mensaje').fill('Sigo escribiendo');
  await expect(panel).toBeHidden();
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect(page.getByText('Sigo escribiendo', { exact: true })).toBeVisible();
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 640 }); await trigger.click();
    await expect(panel).toBeVisible();
    await expect.poll(async () => { const b = (await panel.boundingBox())!; return b.x >= 0 && b.x + b.width <= width && b.y >= 0 && b.y + b.height <= 640; }).toBe(true);
    if (width === 390) await page.screenshot({ path: 'test-results/effects-mobile.png' });
    await page.keyboard.press('Escape'); await expect(panel).toBeHidden();
  }
  await trigger.click(); await panel.getByRole('button', { name: 'Cerrar efectos' }).click(); await expect(panel).toBeHidden();
});
