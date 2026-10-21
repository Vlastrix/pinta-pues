import { test, expect } from '@playwright/test';

test('temas: selector accesible, preferencia persistente, diálogos y móvil', async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Activar modo oscuro' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('pinta-theme'))).toBe('dark');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Activar modo claro' })).toBeVisible();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#17151e');
  await page.screenshot({ path: 'test-results/theme-dark-desktop.png', fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Activar modo claro' })).toBeInViewport();
  }
  await page.getByRole('button', { name: 'Entrar con cuenta' }).click();
  await expect(page.locator('.account-dialog')).toBeVisible();
  expect(await page.locator('.account-dialog').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(33, 30, 43)');
  await page.getByRole('button', { name: 'Cerrar cuenta' }).click();
  await page.getByRole('button', { name: 'Elegir avatar' }).click();
  await expect(page.locator('.avatar-dialog')).toBeVisible();
  expect(await page.locator('.avatar-dialog').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(33, 30, 43)');
  await page.getByRole('button', { name: 'Cerrar selector de avatar' }).click();
  await page.screenshot({ path: 'test-results/theme-dark-mobile.png', fullPage: true });
  const tab = await context.newPage(); await tab.goto('/');
  await expect(tab.getByRole('button', { name: 'Activar modo claro' })).toBeVisible();
  await page.getByRole('button', { name: 'Activar modo claro' }).click();
  await expect(tab.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  // El script inicial aplica el tema incluso antes de arrancar React.
  await page.evaluate(() => localStorage.setItem('pinta-theme', 'dark'));
  await page.route('**/src/main.tsx', route => route.abort());
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('temas durante la partida: elección individual y lienzo blanco sin alterar trazos', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
  await page.getByLabel('¿Cómo te dice la tropa?').fill('Oscuro');
  await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  const code = await page.locator('.room-heading h1>span').innerText();
  const context = await browser.newContext(); const guest = await context.newPage();
  try {
    await guest.goto(`/?sala=${code}`);
    await guest.getByLabel('¿Cómo te dice la tropa?').fill('Claro');
    await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
    await guest.getByLabel('Tu respuesta o mensaje').fill('Hola desde el modo claro');
    await guest.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(page.locator('.messages').getByText('Hola desde el modo claro', { exact: true })).toBeVisible();
    await expect(guest.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.screenshot({ path: 'test-results/theme-dark-room.png', fullPage: true });
    await page.getByRole('button', { name: '¡A pintar, pues!' }).click();
    await page.locator('.word-choices button').first().click();
    const board = page.getByLabel('Dibujo de la partida');
    expect(await board.evaluate((canvas: HTMLCanvasElement) => Array.from(canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data))).toEqual([255, 255, 255, 255]);
    await page.getByLabel('Lienzo para dibujar').click({ position: { x: 100, y: 100 } });
    await expect(page.getByRole('button', { name: 'Deshacer', exact: true })).toBeEnabled();
    const drawing = await board.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await page.getByRole('button', { name: 'Activar modo claro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await board.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(drawing);
    await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
    expect(await board.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(drawing);
    await expect(guest.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.screenshot({ path: 'test-results/theme-dark-drawing.png', fullPage: true });
  } finally { await context.close(); }
});
