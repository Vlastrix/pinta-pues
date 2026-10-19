import { test, expect } from '@playwright/test';

test('elige avatar, guarda al recargar y comparte las elecciones de ambos jugadores', async ({ page, browser }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Elegir avatar', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Elegí tu avatar', exact: true });
  await expect(dialog).toBeVisible();
  const selected = dialog.getByRole('button', { name: 'Avatar 5', exact: true });
  const chosen = await selected.locator('img').getAttribute('src');
  await selected.click(); await expect(dialog).not.toBeVisible();
  await expect(trigger.locator('img')).toHaveAttribute('src', chosen!);
  await page.reload(); await expect(trigger.locator('img')).toHaveAttribute('src', chosen!);
  await trigger.click(); await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
  await page.getByLabel('¿Cómo te dice la tropa?').fill('Vladi');
  await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  await expect(page.getByRole('img', { name: 'Avatar de Vladi' })).toHaveAttribute('src', chosen!);
  const code = await page.locator('.room-heading h1>span').innerText();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest = await context.newPage(); guest.on('pageerror', error => errors.push(error.message));
  try {
    await guest.goto(`/?sala=${code}`);
    await guest.getByRole('button', { name: 'Elegir avatar', exact: true }).click();
    const picker = guest.getByRole('dialog', { name: 'Elegí tu avatar' });
    const previous = await picker.getByRole('button', { name: 'Avatar 2', exact: true }).locator('img').getAttribute('src');
    await picker.getByRole('button', { name: 'Ver más avatares' }).click();
    await expect(picker.getByRole('button', { name: 'Avatar 2', exact: true }).locator('img')).not.toHaveAttribute('src', previous!);
    expect(await guest.evaluate(() => {
      const rect = document.querySelector('dialog')!.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth;
    })).toBe(true);
    const option = picker.getByRole('button', { name: 'Avatar 2', exact: true });
    const guestAvatar = await option.locator('img').getAttribute('src'); await option.click();
    await guest.getByLabel('¿Cómo te dice la tropa?').fill('Caserita');
    await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
    await expect(page.getByRole('img', { name: 'Avatar de Caserita' })).toHaveAttribute('src', guestAvatar!);
    await expect(guest.getByRole('img', { name: 'Avatar de Vladi' })).toHaveAttribute('src', chosen!);
    await expect(guest.getByRole('img', { name: 'Avatar de Caserita' })).toHaveAttribute('src', guestAvatar!);
    for (const target of [page, guest]) {
      expect(await target.getByRole('img', { name: 'Avatar de Vladi' }).evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    }
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
