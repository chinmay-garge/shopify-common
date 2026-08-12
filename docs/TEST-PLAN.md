# Test plan

Scenarios this sandbox exists to prove. Results get filled in as each is run,
so the final process document rests on observed behaviour rather than
assumption.

Status key: `[ ]` not run · `[~]` in progress · `[x]` passed · `[!]` failed,
see notes.

## A. Foundations

- [x] **A1 — Admin permissions.** Creating GitHub environments, variables, and
      protection rules all succeed here. This was the blocker on the real repo,
      where the account had `push` but not `admin`.
- [x] **A2 — Approval gates need the right plan.** `required_reviewers` is
      rejected on a **private** repo on a free plan
      (`422 … billing plan supports the required reviewers protection rule`),
      and accepted on a **public** repo on the same plan. `shopify-common` was
      made public for this reason.
      *Implication for the real setup: the client org is on a paid plan, so
      private is fine there — but this is exactly the class of surprise worth
      catching before touching production.*
- [x] **A3 — Build pipeline.** `npm run build` produces
      `theme/assets/global.vbt.css` and `global.vbt.js`.
- [x] **A4 — Theme provisioning.** Staging + Prod themes created on all three
      stores via CLI; Prod published live, Dawn's original theme preserved.
- [x] **A5 — CI auth.** Resolved, but not the way it started. Three separate
      credentials were tried and rejected before one worked:
      | Value | Prefix | Result |
      |---|---|---|
      | Theme Access password | `shptka_` | 401 — twice, on all three stores |
      | Storefront API token | `shpss_` | 401 — wrong API entirely |
      | **Client credentials grant** | mints `shpat_` | **works** |
      Store handles were verified correct throughout (they resolve and redirect
      to `/password`), so the failures were always credential-side.
- [x] **A7 — Client credentials grant.** `POST /admin/oauth/access_token` with
      `grant_type=client_credentials` returns an `shpat_` Admin API token,
      `scope=write_themes`, `expires_in=86399`. Verified end to end: the minted
      token drives `shopify theme list` and a full CI deploy.
      Adopted over a stored password because nothing long-lived sits in secrets
      and the credentials are org-level — so onboarding a store needs no new
      secret, only the app installed there.
- [x] **A6 — `ACCESS_PAT` cross-repo checkout works.** A classic PAT with `repo`
      scope reads all four repos; both `drift-detection` and
      `content-operations` successfully check out a second repo with it.

## B. Code deploys

- [ ] **B1 — Staging fan-out.** Push to `staging` deploys to all three staging
      themes; `fail-fast: false` means one bad site does not block the others.
      Deferred: only site-a has the app installed, so the matrix is narrowed to
      `SITE-A` for now.
- [x] **B2 — Manual single-site deploy.** `workflow_dispatch` with `SITE-A`
      deployed only site-a, to its **Staging** theme
      (`Sandbox Staging` #157241114762) — confirmed from the push result, so the
      staging/prod theme IDs are not transposed.
- [~] **B3 — Build guard.** Positive case confirmed: "Build artefacts present"
      before every push. The negative case (deploy with the build step removed)
      is still untested — and it is the one that matters, so it should not be
      counted as passing yet.
- [x] **B3a — Token never leaks.** Grepped the full deploy log for
      `shpat_[a-f0-9]{6}`: no match. `::add-mask::` plus passing the token via
      `GITHUB_ENV` rather than step outputs holds up.
- [ ] **B4 — Content is not clobbered.** Edit `page.sandbox-content.json` in a
      Staging theme editor, run a code deploy, confirm the edit **survives**
      (this is what the ignore list buys).
- [~] **B5 — Production needs approval.** The gate holds. Run status `waiting`,
      `approve` job pending on `production-approval` with reviewer
      `chinmay-garge`, and — the point — the `deploy` job never started, so
      nothing reached the store. Awaiting a human approval to confirm the
      resume path. **This is the control that could not be tested on the real
      repo at all**, because creating the environment required admin there.
- [ ] **B6 — Single approval covers all sites.** One approval releases the
      whole matrix. Needs more than one site installed.
- [ ] **B7 — Backup artefact.** Each production run uploads
      `backup-<site>-<run_id>` before overwriting.
- [ ] **B8 — Rollback.** Re-run production against an older tag and confirm the
      store returns to that state.
- [ ] **B9 — Version stamping.** `release.sh` writes `theme_version`, and the
      deployed theme reports it in the Shopify admin.

## C. Drift detection

- [x] **C1 — Divergent file flagged.** Both divergence fixtures were reported
      as differing, and only those:
      `Files shared/theme/sections/sandbox-banner.liquid and site/sections/sandbox-banner.liquid differ` (site-b),
      `…sandbox-footer-cta.liquid… differ` (site-c).
- [x] **C2 — Site-unique file flagged.** `Only in site/sections: sandbox-table.liquid`
      and `Only in site/snippets: sandbox-table-cell.liquid` (site-a);
      `Only in site/sections: sandbox-steps.liquid` (site-b). The snippet being
      caught alongside its section is the important part — that is the
      dependency people forget when porting.
- [x] **C3 — No duplicate issues.** A second run left exactly one open issue and
      added a "Drift still present as of \<sha\>" comment. Worth keeping: the
      naive version opens a fresh issue every push, and since these repos also
      receive a commit for every content edit made in the Shopify admin, that
      buries real drift under noise.
- [ ] **C4 — Auto-close.** Once drift is resolved the issue closes itself.
      Pending — will be exercised by F1, which resolves site-a's drift.
- [x] **C5 — Exclusions hold.** Strong result: across 300+ files per repo —
      all of Dawn, content JSON on both sides, and `.vbt.` build assets present
      in the site repos but gitignored in common — exactly the five intended
      fixtures were flagged and nothing else. Zero false positives.
- [ ] **C6 — Common wins.** After a code deploy, `site-b`'s banner marker flips
      from `SITE-B-VERSION` to `COMMON-VERSION`, and `site-c` loses its extra
      `hide_background` setting.
- [ ] **C7 — Orphaned settings are harmless.** Content JSON that still sets
      `hide_background` after the setting is dropped does not break rendering.

## D. Content promotion

- [x] **D1 — Refresh builds the checklist.** Manual dispatch for `sb-a` created
      issue #1 `Content promotion — sb-a` labelled `content-promotion-sb-a`,
      with all nine eligible templates listed as unticked boxes. Confirms the
      cross-repo read: the list came from `site-a`'s templates, not this repo's.
- [x] **D2 — Eligibility is conservative.** `product.json`, `collection.json`,
      `blog.json`, `article.json`, `list-collections.json` and `gift_card.liquid`
      all exist in `site-a` and were all correctly excluded; only page templates
      and the five singletons appeared. This matters because promoting
      `product.json` would change every product page at once — a decision that
      should never be one tick in a checklist.
- [ ] **D3 — Diff is accurate.** After editing content on Staging,
      `show-diff-sb-a` reports changed / staging-only / prod-only correctly.
- [ ] **D4 — Line endings are not false positives.** A CRLF-vs-LF difference
      alone does not show as changed.
- [ ] **D5 — Promote is approval-gated.** `promote-sb-a` waits for approval
      before touching Prod.
- [ ] **D6 — Snapshot before overwrite.** The pre-promotion Prod state lands on
      `content-snapshots-sb-a`.
- [ ] **D7 — Only ticked files ship.** Unticked templates are untouched on Prod.
- [ ] **D8 — Checklist resets.** Ticks clear after a successful promotion.
- [ ] **D9 — Nothing ticked.** Promoting with no ticks comments and bails
      without shipping.
- [ ] **D10 — Failure leaves a retry path.** A failed promotion keeps the label
      and reports the run URL.
- [ ] **D11 — Site isolation.** `promote-sb-a` never touches site-b or site-c.
- [ ] **D12 — Unknown site key.** A malformed label fails loudly instead of
      defaulting to some site.

## E. Locales

- [x] **E1 — The bug's precondition is present.** Pulled the deployed staging
      theme's locale file: seven `sandbox-*` sections have entries and
      `sandbox-promo` has none — the exact state that renders
      `missing translation: t:sections.sandbox-promo.name` in the editor.
- [x] **E2 — Committing keys is not enough.** The important one. Changed
      `sandbox-hero.name` to `"Sandbox Hero (locale probe)"`, pushed, ran a
      **fully successful** deploy — and the theme still read `"Sandbox Hero"`.
      A green deploy that silently does not ship your change is precisely the
      bug that reached a live client store.
- [x] **E3 — Sync fixes it.** `sync-locales.yml` against staging updated the
      theme to the probe value. Probe then reverted and the theme re-synced;
      the `sandbox-promo` fixture was verified still intact afterwards.
- [~] **E4 — Production locale sync is gated.** Staging half confirmed: the
      `approve` job reported `skipped` while `sync` succeeded, so routine
      staging syncs are not gated. The production half is untested.

## F. Onboarding a new site

The rehearsal for adding a fourth site — the real-world scenario that started
all of this.

- [ ] **F1 — Port a unique section.** Move `sandbox-table` into common
      *deliberately forgetting* the snippet and locale keys; confirm the
      failures surface. Then do it properly.
- [ ] **F2 — Port the simple case.** `sandbox-steps` needs no locale work;
      confirm the runbook does not demand unnecessary steps.
- [ ] **F3 — Cold onboarding.** Add a site to the matrix with **no**
      environment configured and confirm it fails loudly and in isolation,
      rather than half-deploying.
- [ ] **F4 — Full onboarding.** Environment, vars, token, labels, matrix entry
      — then deploy successfully.

## G. Git hygiene

- [ ] **G1 — Diverged history reproduces.** Sync `main` and `staging` by
      content but not ancestry, and confirm PRs then show a large phantom diff.
- [ ] **G2 — Merge fixes it.** A real merge between the branches restores clean
      diffs.
- [ ] **G3 — Dropped commit.** Reproduce a follow-up commit being lost when a
      PR merges mid-push, and find a guard against it.

## Findings

Recorded as they come up, with the process change each one implies.

| # | Finding | Implication |
|---|---|---|
| 1 | Free plan blocks `required_reviewers` on private repos (A2) | Verify plan/visibility before promising an approval gate |
| 2 | Theme Access tokens from the app UI can be unusable; the emailed value is authoritative (A5) | Onboarding runbook must say "use the emailed password" |
| 3 | `gh` fails with `fatal: not a git repository` when both checkouts use `path:`, because the workspace root is not a repo | Every `gh` call in a multi-checkout workflow must pass `--repo "$GITHUB_REPOSITORY"`. Caught only by running it — the workflow was valid YAML and the diff steps passed. |
| 4 | Line endings must be pinned repo-wide | Added `.gitattributes` with `* text=auto eol=lf` to all four repos. Without it a Windows checkout rewrites text to CRLF and byte-comparison reports every file as changed — the same effect that made 49 identical real files look diverged. Drift detection and content diffing both depend on byte equality. |
| 5 | Shopify credential prefixes are easy to confuse, and all failures look identical (`401`) | Three wrong credentials were tried before one worked. Worth stating explicitly in the runbook: `shptka_` = Theme Access password, `shpss_` = Storefront token **and also the client secret**, `shpat_` = Admin API token (the one theme operations need). A 401 never says which mistake you made. |
| 6 | A green deploy can silently not ship your change (E2) | The single most dangerous finding. Because `locales/*.json` is ignored by design, a locale change is committed, deployed successfully, and still absent from the theme. Any process doc must pair "locale changed?" with "run Sync Locales" — reading a green checkmark as proof is wrong. |
| 7 | `uses:` resolves from `GITHUB_WORKSPACE`, not the workflow file | A local composite action is `./.github/actions/x` in the deploy workflows but `./hub/.github/actions/x` in `content-operations.yml`, which checks the repo out into `hub/`. Same class of bug as finding 3: multi-checkout workflows break path assumptions. |
