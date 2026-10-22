import { test, expect } from '@playwright/test';

test('insignias nuevas aparecen en sala, ranking y mi cuenta sin recargar', async ({ page, browser }) => {
  await page.request.post('/api/auth/register', { data: { email: `insignias-${Date.now()}@example.com`, password: 'Clave-insignias-123' } });
  await page.goto('/');
  await page.getByLabel('¿Cómo te dice la tropa?').fill('Artista');
  await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  const code = await page.locator('.room-heading h1>span').innerText();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest = await context.newPage();
  try {
    await guest.goto(`/?sala=${code}`); await guest.getByLabel('¿Cómo te dice la tropa?').fill('Amigo');
    await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
    await page.getByLabel('Rondas', { exact: true }).selectOption('1');
    await page.getByRole('button', { name: '¡A pintar, pues!' }).click();
    const choice = page.locator('.word-choices button').first(); const word = await choice.innerText(); await choice.click();
    await guest.getByLabel('Tu respuesta o mensaje').fill(word); await guest.getByRole('button', { name: 'Enviar mensaje' }).click();
    const next = guest.locator('.word-choices button').first(); await expect(next).toBeVisible({ timeout: 10000 }); await next.click();
    await page.getByRole('button', { name: 'Reportar al pintor', exact: true }).click();
    const artist = page.locator('.player').filter({ hasText: 'Artista' });
    await expect(artist.locator('.badge-icon')).toHaveCount(3, { timeout: 10000 });
    await expect(artist.getByRole('button', { name: 'Insignia: Último de la tropa', exact: true })).toBeVisible();
    await artist.getByRole('button', { name: 'Insignia: Cero aciertos', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Detalle de insignia' })).toContainText('sin adivinar ningún dibujo');
    await page.getByRole('button', { name: 'Cerrar insignia' }).click();
    await page.getByRole('button', { name: 'Salir de la sala', exact: true }).click();
    await expect(page.locator('.leaderboard-you .badge-icon')).toHaveCount(3);
    await page.getByRole('button', { name: 'Mi cuenta', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Mis insignias' })).toContainText('3/4');
    await expect(page.locator('.badge-earned')).toHaveCount(3);
    await page.getByRole('button', { name: 'Cerrar cuenta' }).click();
    await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
    await expect(page.locator('.player .badge-icon')).toHaveCount(3);
  } finally { await context.close(); }
});
