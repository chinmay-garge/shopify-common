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

## Workflows

| Workflow | Trigger | Gate |
|---|---|---|
| `deploy-staging.yml` | push to `staging`, or manual | none — staging is cheap |
| `deploy-production.yml` | release created, or manual | `production-approval` reviewer, before anything is pushed |
| `content-operations.yml` | issue labels, or manual | `production-approval` on promote only |
| `sync-locales.yml` | manual | only when targeting production |

`deploy-production.yml` downloads each live theme and uploads it as a 90-day
artefact **before** overwriting it, so there is always a rollback point.

### Why approval is its own job

A GitHub job may declare exactly one `environment:`. The deploy job must
declare the per-site environment to read that site's `STORE` / `THEME_ID` /
token. So approval cannot also live on that job — it is a separate upstream
`approve` job gated on `production-approval`. One approval releases the whole
matrix, which matches the agreed policy of a single approver for all sites.

## Configuration

Repo variables: `STAGING_SITES`, `PRODUCTION_SITES` (comma-separated env names).

Per-site environments (`SITE-A` / `SITE-B` / `SITE-C`):

| Key | Kind | Purpose |
|---|---|---|
| `STORE` | variable | store prefix |
| `THEME_ID` | variable | production theme |
| `THEME_ID_STAGING` | variable | staging theme |

Repo secrets:

| Key | Purpose |
|---|---|
| `SHOPIFY_CLIENT_ID` | app client ID, used to mint Shopify tokens at runtime |
| `SHOPIFY_CLIENT_SECRET` | app client secret |
| `ACCESS_PAT` | GitHub PAT with `repo` scope, for cross-repo checkout |

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
