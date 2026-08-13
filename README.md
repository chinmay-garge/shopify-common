# shopify-common — multi-site theme CI/CD sandbox

A disposable replica of a shared-theme, multi-site Shopify setup. It exists to
prove out a deployment process end to end — including the parts that could not
be tested against the real thing, because that account lacked the permissions
to create GitHub environments or approval gates.

Nothing here is derived from any client theme. The base is Shopify's
[Dawn](https://github.com/Shopify/dawn); every `sandbox-*` file was written for
this sandbox to reproduce a specific failure mode.

## Architecture

| Repo | Role |
|---|---|
| `shopify-common` (this repo) | Source of truth for CODE. Holds the build pipeline and every workflow. Deploys to all sites. |
| `site-a`, `site-b`, `site-c` | One per store. Git-connected to that store's **Staging** theme, so they mirror CONTENT. Each runs drift detection against this repo. |

Two lanes, and keeping them separate is the whole design:

- **CODE** — `.liquid`, `src/`, built assets. Owned by this repo, shipped by
  `deploy-staging.yml` / `deploy-production.yml`.
- **CONTENT** — `templates/*.json`, `config/settings_data.json`,
  `locales/*.json`, section groups. Owned by editors in the Shopify admin.
  Both deploy workflows **ignore** these, and they are promoted separately by
  `content-operations.yml`.

Every store: `Sandbox Prod` is live, `Sandbox Staging` is unpublished.

| Site | Store | Staging theme | Prod theme (live) |
|---|---|---|---|
| SITE-A | `site-a-store` | `157241114762` | `157241147530` |
| SITE-B | `site-b-store` | `158174281917` | `158174347453` |
| SITE-C | `site-c-store` | `158780850276` | `158780883044` |

## How do I…

Start here. Everything below is a button or a label — none of it needs a
terminal.

### …change page content (text, images, section settings)

1. Edit it in the **Shopify theme editor on the Staging theme**. Not in the live
   theme, and not in GitHub.
2. Your edit is committed to that site's repo automatically, and the promotion
   checklist rebuilds itself.
3. Open the issue titled **"Content promotion — Site A"** (or B / C).
4. Optional but recommended: add the **`show-diff-sb-a`** label to see exactly
   what differs from production. It only reports; it changes nothing.
5. Tick the pages you want live, then add the **`promote-sb-a`** label.
6. It waits for an approver. Once approved, only your ticked pages go live, and
   the previous production content is saved to a snapshot branch first.

If a promotion fails, nothing ships and your ticks are left alone — remove and
re-add the label to retry.

### …change code (a section's markup, styling, behaviour)

Branch off `main`, open a PR into `staging`. Every PR runs **Validate**
(theme check, build, JSON, locale reminder). Merging to `staging` deploys to all
staging themes automatically.

### …put code live

Run **Cut a Release** from the Actions tab. Leave the fields blank to release
what's on `staging` with an auto-generated version. It tags a release, which
starts the production deploy — and that **waits for approval**, so cutting a
release never ships anything on its own.

### …undo something

Run **Rollback - Production**. Pick the site and one of:

- **`redeploy-tag`** — go back to an earlier release. Restores **code only**;
  content is untouched. This is what you want for a bad code change.
- **`restore-backup`** — restore the full snapshot taken before a given deploy.
  Restores **code and content**, so content edits made since will be lost.

Either way, the current state is backed up first — you can undo the undo.

### …change wording in the theme editor UI (field labels, section names)

This one has a trap. Edit `theme/locales/*.json`, then **run Sync Locales
afterwards**. A normal deploy will succeed and still not change anything,
because deploys ignore locale files on purpose. A PR touching those files gets
an automatic comment reminding you.

## Workflows

In this repo:

| Workflow | Runs when | Gate |
|---|---|---|
| **Validate** | every PR, and pushes to `main` / `staging` | — |
| **Deploy – Staging** | push to `staging`, or manually | none — staging is cheap |
| **Deploy – Production** | a release is created, or manually | ✅ approval before anything is pushed |
| **Content operations** | an issue label is added; a site reports changed content; or manually | ✅ on promote |
| **Sync Locales** | manually only | ✅ only when targeting production |
| **Cut a Release** | manually | — (the deploy it triggers is gated) |
| **Rollback – Production** | manually | ✅ |

In each site repo:

| Workflow | Runs when |
|---|---|
| **Drift Detection** | push to `main`, weekly, or manually |
| **Notify content change** | content JSON changes on `main` |

`deploy-production.yml` downloads each live theme and uploads it as a 90-day
artefact **before** overwriting it, so there is always a rollback point. A failed
production deploy opens an issue explaining how to recover.

### Two things that are deliberately not automated

**Approving production.** The gate exists to be a human decision.

**Syncing locales.** It would be easy to make deploys push `locales/*.json`, and
tempting — it would remove the trap described above. But translators edit those
strings in the Shopify admin, and an automatic push would silently overwrite
their work on every deploy. A visible extra step is the lesser evil; the PR
comment exists to make it hard to forget.

### Why approval is its own job

A GitHub job may declare exactly one `environment:`. The deploy job must
declare the per-site environment to read that site's `STORE` / `THEME_ID` /
token. So approval cannot also live on that job — it is a separate upstream
`approve` job gated on `production-approval`. One approval releases the whole
matrix, which matches the agreed policy of a single approver for all sites.

## Configuration

Repo variables: `STAGING_SITES`, `PRODUCTION_SITES` (comma-separated env names).

### The sites

Store subdomains are auto-generated and unmemorable, so here is the mapping:

| Site | Store | Site repo | `prod` theme | `staging` theme |
|---|---|---|---|---|
| SITE-A | `0fjhbq-rs` | `chinmay-garge/site-a` | 163070083329 | 163070116097 |
| SITE-B | `m3cfzx-rp` | `chinmay-garge/site-b` | 192771785074 | 192771817842 |
| SITE-C | `kydspe-qt` | `chinmay-garge/site-c` | 193501921646 | 193501954414 |

Each store sits in its **own Shopify organisation**, which is why credentials are
per-environment rather than shared — see below. The client setup is expected to
be one organisation with many stores, which is the simpler case: identical
workflows, with the credentials moved up to repo level.

Every theme is connected to a branch of its site repo via Shopify's GitHub
integration: `staging` branch to the `staging` theme, `main` branch to `prod`.

Per-site environments (`SITE-A` / `SITE-B` / `SITE-C`):

| Key | Kind | Purpose |
|---|---|---|
| `STORE` | variable | store prefix |
| `THEME_ID` | variable | production theme |
| `THEME_ID_STAGING` | variable | staging theme |

Per-site environment **secrets** — one app per Shopify organisation, so these
cannot be shared:

| Key | Purpose |
|---|---|
| `SHOPIFY_CLIENT_ID` | app client ID, used to mint Shopify tokens at runtime |
| `SHOPIFY_CLIENT_SECRET` | app client secret |

Repo secret:

| Key | Purpose |
|---|---|
| `ACCESS_PAT` | GitHub PAT with `repo` scope, for cross-repo checkout |

There is deliberately **no repo-level** `SHOPIFY_CLIENT_ID`/`SECRET`. Environment
secrets override repo secrets of the same name, so a repo-level pair would act as
a silent fallback — and a site missing its own credentials would authenticate
against the **wrong store** instead of failing. Better to fail loudly.

### Shopify auth

No Shopify token is stored anywhere. Each job mints a short-lived one via the
[client credentials grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant),
using the local composite action `.github/actions/shopify-token`. Tokens last
about 24 hours, are masked with `::add-mask::`, and are passed to later steps
through `GITHUB_ENV` rather than step outputs.

Two benefits over a stored Theme Access password: nothing long-lived sits in
secrets, and because the credentials are org-level, onboarding a new store needs
**no new secret** — only the app installed on that store plus an environment
holding its `STORE` / `THEME_ID` / `THEME_ID_STAGING`.

The grant requires an app created in the **Dev Dashboard** and owned by your
organisation. A legacy "custom app" created under *Settings → Apps and sales
channels → Develop apps* is **not** eligible and will be rejected.

One wrinkle worth knowing: `uses:` resolves relative to `GITHUB_WORKSPACE`, so
the deploy workflows reference `./.github/actions/shopify-token` while
`content-operations.yml` — which checks this repo out into `hub/` — must
reference `./hub/.github/actions/shopify-token`.

`ACCESS_PAT` is needed because `content-operations.yml` checks out the site
repos and the built-in `GITHUB_TOKEN` is scoped to a single repo. Each site repo
needs its own copy so drift detection can read this one.

## The fixtures

Ten `sandbox-*` sections, each earning its place by reproducing something that
actually went wrong or could go wrong.

| Fixture | Lives in | Reproduces |
|---|---|---|
| `sandbox-hero`, `sandbox-cards`, `sandbox-quote` | common | baseline — identical shared code across sites |
| `sandbox-banner` | common **and** `site-b` (divergent) | a site that drifted; common must win |
| `sandbox-footer-cta` | common **and** `site-c` (extra setting) | a site with additive schema options that get dropped |
| `sandbox-table` + `sandbox-table-cell` | `site-a` only | porting a unique section **plus its snippet and locale keys** |
| `sandbox-steps` | `site-b` only | porting a unique section that needs **no** locale work |
| `sandbox-promo` | common, **locale keys deliberately absent** | the missing-translation bug, permanently |
| `sandbox-content-block` | common, used by `page.sandbox-content.json` | the CODE vs CONTENT split |
| `sandbox-composite` + `sandbox-badge` | common | snippet dependency + reliance on built `.vbt.` assets |

### The two bugs worth knowing about

**Missing translations.** A section's schema can reference `t:` keys that do not
exist in `locales/en.default.schema.json`. The theme editor then renders
`missing translation: t:sections.<name>.name` instead of a name.
`sandbox-promo` is the standing fixture for this.

**Locale changes never deploy.** Both deploy workflows ignore `locales/*.json`
on purpose, so translators' admin edits survive. The sharp edge: adding a
locale key in git does **not** put it on the theme. Only `sync-locales.yml`
does. These two bugs compound — the first looks fixed in git while remaining
broken in the editor.

## Local development

```bash
npm install
npm run build          # tailwind + esbuild -> theme/assets/*.vbt.*
npm run dev:a          # or dev:b / dev:c
npm run push:a         # manual push to a store
npm run purge          # delete generated .vbt. files
```

Build output is gitignored, which is why both deploy workflows build first and
then assert the artefacts exist before pushing.

## Releasing

```bash
./release.sh staging
```

Merges `staging`, stamps `theme_version` as `YYYY-MM-DD-N`, pushes `main`, and
cuts a GitHub release. The release triggers production deploy, which then waits
for approval — so running the script does not by itself ship anything live.

See [`docs/TEST-PLAN.md`](docs/TEST-PLAN.md) for the scenarios this sandbox is
meant to validate, and their results.
