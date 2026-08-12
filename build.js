// esbuild entry for the sandbox shared theme.
//
//   node build.js            -> watch mode (dev)
//   node build.js --bundle   -> one-shot build (CI)
//
// Output lands in theme/assets/ using a `.vbt.` infix so build artefacts are
// trivially distinguishable from hand-committed theme assets. That matters for
// two things we test in this sandbox:
//   - `npm run purge` can delete only generated files
//   - drift-detection can exclude generated files from its diff

import * as esbuild from 'esbuild';

const options = {
  entryPoints: ['src/global.vbt.js'],
  outdir: 'theme/assets',
  bundle: true,
  format: 'esm',
  splitting: true,
  chunkNames: 'chunk--[name]-[hash].vbt',
  entryNames: '[name]',
  target: ['es2019'],
  logLevel: 'info',
};

if (process.argv.includes('--bundle')) {
  await esbuild.build(options);
} else {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('esbuild watching src/ ...');
}
