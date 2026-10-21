import { test, expect, type Page } from '@playwright/test';

test('chat: agrupa por autor, alinea mensajes propios y recompone grupos al borrar', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByLabel('¿Cómo te dice la tropa?').fill('Vladi');
  await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  const code = await page.locator('.room-heading h1>span').innerText();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const guest = await context.newPage();
  const messages = (target: Page) => target.locator('.messages');
  async function send(target: Page, text: string) {
    await target.getByLabel('Tu respuesta o mensaje').fill(text);
    await target.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(messages(page).getByText(text, { exact: true })).toBeVisible();
    await expect(messages(guest).getByText(text, { exact: true })).toBeVisible();
    await target.waitForTimeout(360); // Pausa de 350 ms entre mensajes del mismo jugador.
  }
  try {
    await guest.goto(`/?sala=${code}`);
    await guest.getByLabel('¿Cómo te dice la tropa?').fill('Caserita');
    await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
    await expect(page.getByRole('button', { name: 'Moderar a Caserita' })).toBeVisible();
    await send(page, 'Hola tropa'); await send(page, '¿Listos para pintar?');
    await send(guest, 'Yo sí'); await send(guest, 'Tremendo giro');
    await send(page, 'Dale pues');
    for (const target of [page, guest]) {
      await expect(messages(target).locator('.chat.group-start')).toHaveCount(3);
      await expect(messages(target).locator('.chat.group-end')).toHaveCount(3);
      await expect(messages(target).locator('.chat > strong').filter({ hasText: /^Vladi$/ })).toHaveCount(2);
      await expect(messages(target).locator('.chat > strong').filter({ hasText: /^Caserita$/ })).toHaveCount(1);
    }
    await expect(messages(page).locator('.chat.own')).toHaveCount(3);
    await expect(messages(guest).locator('.chat.own')).toHaveCount(2);
    expect(await messages(page).locator('.chat.own > span').first().evaluate(element => getComputedStyle(element).alignSelf)).toBe('flex-end');
    await expect(guest.getByRole('button', { name: 'Borrar mensaje de Vladi' })).toHaveCount(0);
    await page.locator('.chat-panel').screenshot({ path: 'test-results/chat-groups-desktop.png' });
    await guest.locator('.chat-panel').screenshot({ path: 'test-results/chat-groups-mobile.png' });
    await page.getByRole('button', { name: 'Borrar mensaje de Caserita' }).first().click();
    await expect(messages(guest).getByText('Yo sí', { exact: true })).toHaveCount(0);
    await expect(messages(guest).getByText('Tremendo giro', { exact: true }).locator('..').locator('strong')).toHaveText('Caserita');
    await page.getByRole('button', { name: 'Borrar mensaje de Caserita' }).click();
    for (const target of [page, guest]) await expect(messages(target).locator('.chat.group-start')).toHaveCount(1);
    await page.getByRole('button', { name: 'Borrar mensaje de Vladi' }).first().click();
    await expect(messages(guest).getByText('¿Listos para pintar?', { exact: true }).locator('..').locator('strong')).toHaveText('Vladi');
    await page.getByRole('button', { name: 'Moderar a Caserita' }).click();
    await page.getByRole('button', { name: 'Silenciar chat', exact: true }).click();
    await expect(page.locator('.moderation-dialog')).not.toBeVisible();
    await expect(guest.getByLabel('Tu respuesta o mensaje')).toBeDisabled();
    await send(page, 'Después del aviso');
    await expect(messages(guest).locator('.chat.group-start')).toHaveCount(2);
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});
