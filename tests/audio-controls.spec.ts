import { test, expect } from '@playwright/test';

test('controles de audio distinguibles e iconos centrados en distintos tamaños', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('¿Cómo te dice la tropa?').fill('Controles');
  await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
  const header = page.locator('.chat-panel > .panel-heading');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const width of [320, 360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(header.getByText('Soundboard', { exact: true })).toBeVisible();
      await expect(header.getByText('Efectos', { exact: true })).toBeVisible();
      const problems = await page.evaluate(() => {
        const issues: string[] = [];
        for (const button of document.querySelectorAll<HTMLElement>('.icon-button, .tool-button')) {
          const icon = button.querySelector('svg');
          if (!icon || !button.getClientRects().length) continue;
          const b = button.getBoundingClientRect(), i = icon.getBoundingClientRect();
          if (Math.abs((b.left + b.right - i.left - i.right) / 2) > 1 || Math.abs((b.top + b.bottom - i.top - i.bottom) / 2) > 1) issues.push(button.getAttribute('aria-label') || button.title);
        }
        const h = document.querySelector('.chat-panel > .panel-heading')!.getBoundingClientRect();
        for (const button of document.querySelectorAll('.chat-audio-button')) {
          const b = button.getBoundingClientRect();
          if (b.left < h.left || b.right > h.right || b.top < h.top || b.bottom > h.bottom) issues.push('audio overflow');
        }
        if (document.documentElement.scrollWidth > innerWidth) issues.push('page overflow');
        return issues;
      });
      expect(problems, `${theme}, ${width}px`).toEqual([]);
      if (theme === 'light' && [360, 1440].includes(width)) {
        await header.locator('.game-audio-toggle').hover();
        await header.screenshot({ path: `test-results/audio-controls-${width}.png` });
      }
    }
  }
});
