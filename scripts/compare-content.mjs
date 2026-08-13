#!/usr/bin/env node
// Semantically compares two trees of Shopify template JSON.
//
// Why not `diff`
// --------------
// Byte-comparing these files does not work, and the failure is silent rather
// than obvious. Shopify prepends a `/* auto-generated ... */` banner to template
// JSON when serving it from a theme, and reformats the body. A repo copy never
// has that banner, so a byte-comparison reports **every** file as changed.
//
// Observed exactly that: a diff of 10 templates where only one had really
// changed reported all 10. A reviewer shown "everything changed" learns to
// ignore the report, which is worse than having no report — they will approve a
// promotion without reading it.
//
// So: parse both sides, strip the banner, canonicalise key order, compare.
// Object key order is not meaningful in these files; array order is (it drives
// section order on the page), so arrays are left alone.
//
// Usage:
//   node scripts/compare-content.mjs --a <dirA> --b <dirB> [--json]
//
// Exit code is always 0 — this reports, it does not gate.

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const val = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const asJson = argv.includes('--json');

const dirA = val('a');
const dirB = val('b');
if (!dirA || !dirB) {
  console.error('Usage: compare-content.mjs --a <dirA> --b <dirB> [--json]');
  process.exit(2);
}

// Same set the checklist offers, kept deliberately narrow: page templates plus
// the singletons. Shared defaults like product.json are excluded because
// promoting one changes every product page at once.
const isPage = (f) => /^page(\..+)?\.json$/.test(f);
const SINGLETONS = new Set(['index.json', 'cart.json', 'search.json', '404.json', 'password.json']);
const eligible = (f) => isPage(f) || SINGLETONS.has(f);

function read(dir, name) {
  const p = path.join(dir, name);
  if (!fs.existsSync(p)) return undefined;
  const raw = fs.readFileSync(p, 'utf8').replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '');
  try {
    return JSON.parse(raw);
  } catch {
    // Unparseable is meaningful — report it rather than treating it as absent.
    return { __unparseable: true };
  }
}

// Sort object keys recursively; leave arrays in place (array order drives
// section order on the page, so it is meaningful).
//
// Also drops properties whose value is an empty object. Shopify materialises
// `"settings": {}` when it stores a template, where the repo copy simply omits
// it — e.g. `{"main":{"type":"main-404"}}` in git becomes
// `{"main":{"type":"main-404","settings":{}}}` on the theme. Those mean the same
// thing, and treating them as different reported two extra "changed" files in a
// set of ten, which is exactly the noise that makes a diff untrustworthy.
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      const cv = canon(v[k]);
      const isEmptyObject =
        cv && typeof cv === 'object' && !Array.isArray(cv) && Object.keys(cv).length === 0;
      if (!isEmptyObject) out[k] = cv;
    }
    return out;
  }
  return v;
}

const listing = (dir) => {
  try {
    return fs.readdirSync(dir).filter(eligible);
  } catch {
    return [];
  }
};

const names = [...new Set([...listing(dirA), ...listing(dirB)])].sort();

const changed = [];
const onlyA = [];
const onlyB = [];
const unparseable = [];
let inSync = 0;

for (const name of names) {
  const a = read(dirA, name);
  const b = read(dirB, name);
  const rel = `templates/${name}`;

  if (a?.__unparseable || b?.__unparseable) {
    unparseable.push(rel);
    continue;
  }
  if (a === undefined) {
    onlyB.push(rel);
    continue;
  }
  if (b === undefined) {
    onlyA.push(rel);
    continue;
  }
  if (JSON.stringify(canon(a)) === JSON.stringify(canon(b))) inSync += 1;
  else changed.push(rel);
}

const result = { changed, onlyA, onlyB, unparseable, inSync };

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const show = (label, arr) => {
    if (arr.length) console.log(`${label}: ${arr.join(', ')}`);
  };
  show('changed', changed);
  show('only in A', onlyA);
  show('only in B', onlyB);
  show('unparseable', unparseable);
  console.log(`in sync: ${inSync}`);
}
