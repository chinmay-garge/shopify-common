// Marks sections/sandbox-composite.liquid as hydrated.
//
// Used as the assertion that the esbuild output actually reached the theme:
// if the build did not run before deploy, `data-sandbox-hydrated` is absent.
export function initComposite() {
  document.querySelectorAll('[data-sandbox-composite]').forEach((el) => {
    el.dataset.sandboxHydrated = 'true';
  });
}
