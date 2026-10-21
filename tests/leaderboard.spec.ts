import { test, expect } from '@playwright/test';

test('ranking: vacío, top 10, tu puesto, móvil y recuperación tras un error', async ({ page }) => {
  let mode: 'empty' | 'ranking' | 'error' = 'empty';
  await page.route('**/api/leaderboard', route => {
    if (mode === 'error') return route.fulfill({ status: 503, json: { error: 'No disponible' } });
    return route.fulfill({ json: mode === 'empty' ? [] : Array.from({ length: 10 }, (_, index) => ({
      rank: index + 1, name: index === 0 ? '<b>La leyenda</b>' : `Jugador ${index + 1}`, avatar: 'pinta-pues-1',
      points: 10000 - index * 500, games: 20 - index, wins: 10 - index, isYou: index === 2,
    })) });
  });
  await page.goto('/');
  const ranking = page.getByRole('region', { name: 'Top 10 de la tropa' });
  await expect(ranking.getByText(/La cima está libre/)).toBeVisible();
  mode = 'ranking';
  await page.getByRole('button', { name: 'Actualizar ranking' }).click();
  await expect(ranking.locator('li')).toHaveCount(10);
  await expect(ranking.getByText('<b>La leyenda</b>', { exact: true })).toBeVisible();
  await expect(ranking.locator('.leaderboard-you')).toContainText('Jugador 3 (vos)');
  await page.setViewportSize({ width: 320, height: 640 });
  await ranking.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
  await expect(ranking.locator('li')).toHaveCount(10);
  mode = 'error';
  await page.getByRole('button', { name: 'Actualizar ranking' }).click();
  await expect(ranking.getByText(/No se pudo cargar/)).toBeVisible();
  mode = 'ranking';
  await page.getByRole('button', { name: 'Actualizar ranking' }).click();
  await expect(ranking.locator('li')).toHaveCount(10);
});
