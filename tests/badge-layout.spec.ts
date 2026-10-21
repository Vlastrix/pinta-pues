import { test, expect } from '@playwright/test';
import { BADGES } from '../shared/badges';

test('sala con todas las insignias: caben en cada tarjeta de escritorio y móvil', async ({ page, browser }) => {
  // Modify only this browser's incoming view to exercise the real components
  // with a full collection, without granting test badges in the database.
  await page.routeWebSocket('**/socket.io/**', socket => {
    const server = socket.connectToServer();
    server.onMessage(message => {
      if (typeof message === 'string' && message.startsWith('42[')) {
        const packet = JSON.parse(message.slice(2));
        if (packet[0] === 'room:state') {
          for (const player of packet[1].players) player.badges = BADGES.map(badge => badge.id);
          socket.send(`42${JSON.stringify(packet)}`); return;
        }
      }
      socket.send(message);
    });
  });
  await page.goto('/');
  await page.getByLabel('¿Cómo te dice la tropa?').fill('NombreDeVeinteLetrasX');
  await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  const code = await page.locator('.room-heading h1>span').innerText();
  const context = await browser.newContext(); const guest = await context.newPage();
  try {
    await guest.goto(`/?sala=${code}`); await guest.getByLabel('¿Cómo te dice la tropa?').fill('NombreLargoInvitadoXX');
    await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
    await expect(page.locator('.player .badge-icon')).toHaveCount(8);
    for (const width of [1440, 1024, 768, 650, 390, 360, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await expect.poll(() => page.evaluate(() => {
        const cards = [...document.querySelectorAll<HTMLElement>('.player')];
        return document.documentElement.scrollWidth <= innerWidth && cards.every(card => {
          const bounds = card.getBoundingClientRect();
          return card.scrollWidth <= card.clientWidth + 1 && [...card.querySelectorAll('.badge-icon')].every(badge => {
            const rect = badge.getBoundingClientRect();
            return rect.left >= bounds.left && rect.right <= bounds.right + 1 && rect.bottom <= bounds.bottom + 1;
          });
        });
      }), { message: `Las insignias deben caber a ${width}px` }).toBe(true);
    }
    await page.getByRole('button', { name: 'Insignia: Arte incomprendido', exact: true }).first().click();
    await expect(page.getByRole('dialog', { name: 'Detalle de insignia' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});
