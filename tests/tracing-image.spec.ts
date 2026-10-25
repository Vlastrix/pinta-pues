import { test, expect } from '@playwright/test';

for (const mobile of [false, true]) test(`referencia privada para calcar: ${mobile ? 'móvil' : 'escritorio'}`, async ({ browser }) => {
  const ownerContext = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
  const guestContext = await browser.newContext();
  const page = await ownerContext.newPage(), guest = await guestContext.newPage();
  const sent: string[] = [];
  page.on('websocket', socket => socket.on('framesent', event => sent.push(String(event.payload))));
  try {
    await page.goto('/'); await page.getByLabel('¿Cómo te dice la tropa?').fill('Pintor');
    await page.getByRole('button', { name: '¡Armemos la sala!' }).click();
    const code = await page.locator('.room-heading h1>span').innerText();
    await guest.goto(`/?sala=${code}`); await guest.getByLabel('¿Cómo te dice la tropa?').fill('Amiga');
    await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
    await page.getByRole('button', { name: '¡A pintar, pues!' }).click();
    const choice = page.locator('.word-choices button').first(); const word = await choice.innerText(); await choice.click();
    const canvas = page.getByLabel('Dibujo de la partida');
    const blank = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
    const data = await page.evaluate(() => {
      const image = document.createElement('canvas'); image.width = 300; image.height = 200;
      const ctx = image.getContext('2d')!; ctx.fillStyle = '#e02020'; ctx.fillRect(0, 0, 300, 200);
      return image.toDataURL().split(',')[1];
    });
    const upload = page.getByLabel('Imagen para calcar', { exact: true });
    await upload.setInputFiles({ name: 'referencia.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
    const reference = page.getByAltText('Referencia privada para calcar');
    await expect(reference).toBeVisible(); await expect(reference).toHaveCSS('opacity', '0.35');
    await expect(guest.getByAltText('Referencia privada para calcar')).toHaveCount(0);
    await expect(guest.getByRole('button', { name: 'Imagen para calcar' })).toHaveCount(0);
    expect(await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).toBe(blank);
    expect(await guest.getByLabel('Dibujo de la partida').evaluate((node: HTMLCanvasElement) => node.toDataURL())).toBe(blank);
    await page.getByLabel('Opacidad de la referencia').fill('65');
    await expect(reference).toHaveCSS('opacity', '0.65');
    await page.getByLabel('Tamaño de la referencia').fill('80');
    await page.getByRole('button', { name: 'Mover imagen', exact: true }).click();
    const handle = page.getByRole('button', { name: 'Mover imagen de referencia', exact: true });
    await handle.scrollIntoViewIfNeeded();
    const before = (await handle.boundingBox())!;
    if (mobile) {
      const touch = await ownerContext.newCDPSession(page);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: before.x + 20, y: before.y + 20 }] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: before.x + 40, y: before.y + 40 }] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await touch.detach();
    } else {
      await page.mouse.move(before.x + 20, before.y + 20); await page.mouse.down();
      await page.mouse.move(before.x + 60, before.y + 60, { steps: 5 }); await page.mouse.up();
    }
    await expect.poll(async () => (await handle.boundingBox())!.x).toBeGreaterThan(before.x + 10);
    expect(await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).toBe(blank);
    await handle.focus(); const left = await handle.evaluate(node => (node as HTMLElement).style.left);
    await handle.press('ArrowRight'); expect(await handle.evaluate(node => (node as HTMLElement).style.left)).not.toBe(left);
    await page.getByRole('button', { name: 'Volver a dibujar' }).click();
    await page.getByLabel('Lienzo para dibujar').click({ position: { x: 40, y: 40 } });
    await expect.poll(() => canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).not.toBe(blank);
    await expect.poll(() => guest.getByLabel('Dibujo de la partida').evaluate((node: HTMLCanvasElement) => node.toDataURL())).toBe(await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL()));
    await page.locator('.board-column').screenshot({ path: `test-results/tracing-${mobile ? 'mobile' : 'desktop'}.png` });
    if (mobile) {
      await page.setViewportSize({ width: 320, height: 640 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(sent.some(frame => frame.includes('blob:') || frame.includes(data))).toBe(false);
    const firstUrl = await reference.getAttribute('src');
    await upload.setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
    await expect(reference).not.toHaveAttribute('src', firstUrl!);
    expect(await page.evaluate(async url => { try { await fetch(url!); return false; } catch { return true; } }, firstUrl)).toBe(true);
    await page.getByRole('button', { name: 'Quitar referencia' }).click();
    await expect(reference).toHaveCount(0);
    await upload.setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
    await expect(page.getByRole('alert')).toContainText('PNG');
    await upload.setInputFiles({ name: 'again.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
    await expect(reference).toBeVisible();
    const finalUrl = await reference.getAttribute('src');
    await guest.getByLabel('Tu respuesta o mensaje').fill(word); await guest.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(page.locator('.reveal-banner')).toBeVisible();
    await expect(reference).toHaveCount(0);
    await expect(page.locator('.tracing-controls')).toHaveCount(0);
    expect(await page.evaluate(async url => { try { await fetch(url!); return false; } catch { return true; } }, finalUrl)).toBe(true);
  } finally { await ownerContext.close(); await guestContext.close(); }
});
