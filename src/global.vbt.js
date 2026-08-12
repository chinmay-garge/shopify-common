// Bundle entry point. Kept intentionally small — its job in this sandbox is to
// prove that (a) the build runs in CI before every deploy, and (b) the built
// artefact is required by a section at render time (sandbox-composite).

import { initBanner } from './js/components/Banner.js';
import { initComposite } from './js/components/Composite.js';

const boot = () => {
  initBanner();
  initComposite();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
