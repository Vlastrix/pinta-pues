// Apply the saved theme before the interface paints, including on reload.
(() => {
  let theme = 'light';
  try { if (localStorage.getItem('pinta-theme') === 'dark') theme = 'dark'; } catch {}
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#17151e' : '#fcf8ef');
})();
