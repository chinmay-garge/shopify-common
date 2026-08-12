#!/usr/bin/env node
// Helper for content-operations.yml. Not meant to be run by hand.
//
//   --dir <templates>                      -> checklist issue body
//   --diff --staging <dir> --prod <dir>    -> Staging vs Prod diff comment
//   --names a,b,c                          -> markdown table rows
//
// Always pass --site <key> so the emitted text names the right labels.
//
// Which templates are eligible for promotion is deliberately conservative:
// page templates (one page each, low blast radius) plus a small set of
// singletons. Shared defaults like product.json / collection.json are excluded
// because promoting one of those changes EVERY product or collection at once —
// that needs a human decision, not a checkbox.

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

const SITE = flag('site', '<site>');
const SINGLETONS = new Set(['index.json', 'cart.json', 'search.json', '404.json', 'password.json']);
const isPage = (f) => /^page(\..+)?\.json$/.test(f);
const eligible = (f) => isPage(f) || SINGLETONS.has(f);

const PRETTY = {
  'index.json': 'Home',
  'cart.json': 'Cart',
  'search.json': 'Search',
  '404.json': '404 — Not found',
  'password.json': 'Password',
  'page.json': 'Page (default)',
};

const titleise = (s) =>
  s
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

function friendly(rel) {
  const base = rel.replace(/^templates\//, '');
  if (PRETTY[base]) return PRETTY[base];
  const stem = base.replace(/\.json$/, '');
  const dot = stem.indexOf('.');
  if (dot === -1) return titleise(stem);
  return titleise(stem.slice(dot + 1));
}

function listTemplates(dir) {
  try {
    return fs
      .readdirSync(dir)
      .filter(eligible)
      .map((f) => `templates/${f}`)
      .sort();
  } catch {
    return [];
  }
}

const rows = (paths) =>
  paths
    .map((p) => ({ p, name: friendly(p) }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((r) => `| ${r.name} | \`${r.p}\` |`)
    .join('\n');

// --- mode: table rows only -----------------------------------------------
if (has('names')) {
  const paths = (flag('names') || '').split(',').map((s) => s.trim()).filter(Boolean);
  process.stdout.write(rows(paths) + '\n');
  process.exit(0);
}

// --- mode: Staging vs Prod diff ------------------------------------------
if (has('diff')) {
  const stagingDir = flag('staging');
  const prodDir = flag('prod');

  const staging = new Set(listTemplates(stagingDir));
  const prod = new Set(listTemplates(prodDir));

  const changed = [];
  const onlyStaging = [];
  const onlyProd = [];
  let inSync = 0;

  const read = (dir, rel) => {
    try {
      // Normalise line endings and trailing whitespace so a CRLF-vs-LF
      // checkout difference is not reported as a content change.
      return fs.readFileSync(path.join(dir, path.basename(rel)), 'utf8').replace(/\r\n/g, '\n').trim();
    } catch {
      return null;
    }
  };

  for (const rel of staging) {
    if (!prod.has(rel)) {
      onlyStaging.push(rel);
      continue;
    }
    if (read(stagingDir, rel) === read(prodDir, rel)) inSync += 1;
    else changed.push(rel);
  }
  for (const rel of prod) if (!staging.has(rel)) onlyProd.push(rel);

  const section = (heading, paths) =>
    paths.length ? `\n**${heading}**\n\n| Page | Template |\n|---|---|\n${rows(paths)}\n` : '';

  let out = `**Staging ↔ Prod content diff — \`${SITE}\`**\n`;
  if (!changed.length && !onlyStaging.length && !onlyProd.length) {
    out += `\nAll ${inSync} eligible template(s) are identical on Staging and Prod.\n`;
  } else {
    out += section('Changed on Staging — not yet promoted', changed);
    out += section('New on Staging — not on Prod', onlyStaging);
    out += section('Only on Prod — missing from Staging', onlyProd);
    out += `\n_${inSync} template(s) already in sync._\n`;
  }
  process.stdout.write(out);
  process.exit(0);
}

// --- mode: checklist body ------------------------------------------------
const dir = flag('dir', 'templates');
const found = listTemplates(dir);
const lines = found
  .map((p) => ({ p, name: friendly(p) }))
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((r) => `- [ ] ${r.name} — \`${r.p}\``);

let out = '';
out += `Tick the template(s) to promote to **Production**, then add the **\`promote-${SITE}\`** label.\n\n`;
out += `- Need the newest list? Add **\`refresh-${SITE}\`** — it rebuilds this body and removes itself.\n`;
out += `- Want to see what actually differs first? Add **\`show-diff-${SITE}\`** (read-only).\n\n`;
out += `_Auto-generated from \`${SITE}\`'s repo, which is git-connected to its Staging theme — so this repo **is** Staging's content. Do not edit the list by hand; refreshing resets all ticks._\n\n`;
out += '<!-- CONTENT-LIST:START -->\n';
out += '### Templates\n';
out += (lines.length ? lines.join('\n') : '_No eligible templates found._') + '\n';
out += '<!-- CONTENT-LIST:END -->\n';
process.stdout.write(out);
