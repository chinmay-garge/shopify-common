// Dismiss behaviour for sections/sandbox-banner.liquid.
export function initBanner() {
  document.querySelectorAll('.sandbox-banner__dismiss').forEach((button) => {
    button.addEventListener('click', () => {
      const banner = button.closest('.sandbox-banner');
      if (banner) banner.hidden = true;
    });
  });
}
