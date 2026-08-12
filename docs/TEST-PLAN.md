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
- [x] **B5 — Production needs approval.** Confirmed in both directions.
      *Held:* run status `waiting`, `approve` pending on `production-approval`,
      and the `deploy` job never started — nothing reached the store.
      *Resumed:* after a human approval, `approve` and `Deploy (SITE-A)` both
      succeeded and the push landed on `Sandbox Prod` (`role: live`), proving the
      `--allow-live` path.
      **This is the control that could not be tested on the real repo at all**,
      because creating the environment required admin there.
      Re-confirmed on a release-triggered run, not just a manual one.
- [ ] **B6 — Single approval covers all sites.** One approval releases the
      whole matrix. Needs more than one site installed.
- [x] **B7 — Backup artefact.** `backup-SITE-A-31624704580`, 596 KB, retained 90
      days (expires 2026-11-10). Taken before the overwrite, so it is a genuine
      rollback point rather than a record of what was just deployed.
- [x] **B8 — Rollback.** Both modes exercised against a real live theme, in
      opposite directions, using `theme_version` as an unambiguous marker:
      | Action | Before | After |
      |---|---|---|
      | `restore-backup` from run 31627539208 | `2026-08-12-1` | `16.0.0` |
      | `redeploy-tag` at `2026-08-12-1` | `16.0.0` | `2026-08-12-1` |
      Each run snapshotted the current state first
      (`pre-rollback-SITE-A-<run_id>`), so a rollback is itself reversible —
      which matters, because a rollback is a change made under pressure and is
      just as capable of being wrong.
- [x] **B8a — Bad rollback requests fail before the gate.** A `redeploy-tag`
      request with no `ref` failed at `Check inputs`; both the approval job and
      the rollback job were **skipped**. Validating before asking for approval
      is the point: an approver should never be shown an incoherent request to
      rubber-stamp.
- [x] **B9 — Version stamping.** `Cut a Release` bumped `theme_version` from
      Dawn's `16.0.0` to `2026-08-12-1` on `main`, so the deployed theme is
      identifiable in the Shopify admin.

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

- [x] **D0 — Checklists refresh themselves.** Added after noticing the original
      design relied on someone remembering to hit refresh. A content change in a
      site repo now fires `repository_dispatch` to this repo, which rebuilds that
      site's checklist. Verified twice: an edit to an existing page produced
      `refresh · sb-a · content changed`, and **adding** `page.sandbox-new.json`
      made "Sandbox New" appear in the checklist unprompted.
      Worth stating plainly: a stale checklist is worse than no checklist,
      because it looks authoritative while pointing at the wrong pages.
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

## H. Validation and guardrails

Added after the first pass through A–F, on the principle that catching a bad
change is worth more than recovering from one.

- [x] **H1 — Theme check catches missing translations.** The significant find:
      **Shopify's own `theme check` already detects this**, via
      `ValidSchemaTranslations`. A bespoke checker was written first and then
      deleted — the real gap was never a missing tool, it was that theme check
      was never run in CI. It flagged all 5 `sandbox-promo` keys immediately,
      and Dawn itself is clean (1417 keys, 96 files, zero missing), so no
      baseline was needed.
- [x] **H2 — Config must live inside `--path`.** `theme check` reads
      `.theme-check.yml` from the directory it is checking, not the repo root.
      Placed at the root it is silently ignored — errors stayed at 6 until the
      file was moved to `theme/.theme-check.yml`.
- [x] **H3 — Theme check also catches a skipped build.** It reported
      `MissingAsset` for `global.vbt.css` / `global.vbt.js` when run without
      building first, because those artefacts are gitignored. That makes it a
      stronger guard than the hand-written "assert artefacts exist" step, and it
      is why the check job builds first.
- [x] **H4 — Locale-change guard fires on PRs.** A PR touching
      `theme/locales/*.json` gets a comment explaining that merging and
      deploying will **not** change any theme. Verified on a real PR. Posts once
      per PR rather than once per push.
- [x] **H5 — JSON validity.** Every `theme/**/*.json` is parsed, stripping the
      `/* … */` banner Shopify prepends to some locale files.

## I. Operations made self-service

- [x] **I1 — Rollback is a form, not a runbook.** Two explicit modes:
      `redeploy-tag` (code only) and `restore-backup` (code **and** content).
      Conflating those two is how a rollback quietly destroys content edits, so
      the distinction is in the input names and the summary. Snapshots current
      state before acting, so a rollback is itself reversible.
- [x] **I2 — Releases from the UI.** `Cut a Release` does what `release.sh` did,
      without a terminal.
- [x] **I3 — Release must be created with a PAT.** Subtle and easy to miss:
      GitHub suppresses workflow triggers for events created with
      `GITHUB_TOKEN`, to prevent recursion. A release cut with the default token
      appears in the Releases tab and deploys **nothing** — a silent no-op.
      `release.yml` uses `ACCESS_PAT` for exactly this reason.
      **Verified rather than assumed:** the release cut by the workflow produced
      a `deploy-production` run with `event: release`, which then held at the
      approval gate as intended. Had the default token been used, the only
      symptom would have been a release that shipped nothing — with no error
      anywhere to explain it.
- [x] **I4 — Failed production deploys are visible.** Opens an issue naming the
      ref, the run, the backup artefact, and which rollback mode to use.
- [x] **I5 — Weekly drift sweep.** Push-triggered detection cannot see drift
      introduced on the shared repo's side, since that produces no commit in the
      site repo. A weekly cron closes that blind spot.
- [x] **I6 — Human-readable site names.** Issue titles and comments now read
      "Site A" rather than `sb-a`; the key survives only in label names, where it
      is plumbing.

## G. Git hygiene

- [ ] **G1 — Diverged history reproduces.** Sync `main` and `staging` by
      content but not ancestry, and confirm PRs then show a large phantom diff.
- [ ] **G2 — Merge fixes it.** A real merge between the branches restores clean
      diffs.
- [ ] **G3 — Dropped commit.** Reproduce a follow-up commit being lost when a
      PR merges mid-push, and find a guard against it.

## J. GitHub–theme connection

A gap found by being asked a direct question: the whole content lane rests on
"the site repo **is** Staging's content", and that connection was never actually
made. Editor commits were simulated by pushing to the site repos, which produces
the same git effect but proves nothing about the integration.

It cannot be scripted — `shopify theme` has no subcommand for it, and there is no
API. It is configured only in the Shopify admin, so it needs a human.

**Chosen model** — each theme connected to its own branch, per site repo:

| Branch | Theme |
|---|---|
| `staging` | Sandbox Staging |
| `main` | Sandbox Prod (live) |

This differs from the client setup, where only Staging is connected. It makes
production content git-tracked, so content rollback becomes a git operation and
promotion can become a **merge** rather than a scoped CLI push.

**The risk it introduces, and why protection was added first.** Connecting the
live theme means any commit to `main` publishes immediately — which would bypass
the approval gate that currently protects production. Mitigation: `main` is
branch-protected on all three site repos (no force pushes, no deletions), and
the gated promote workflow is the only intended writer. Honest caveat: on a
single-owner repo, protection cannot lock out the owner, so this documents intent
more than it enforces it. In a real org, pushes to `main` should be restricted to
the workflow's app or team.

- [ ] **J1 — Editor → commit.** An edit in the Staging theme editor appears as a
      commit on the site repo's `staging` branch. This is the premise everything
      else assumes.
- [ ] **J2 — Commit → theme.** A commit to `staging` reaches the Staging theme.
- [ ] **J3 — Echo-back from a CI deploy.** The one to watch. CI pushes code to a
      theme that the integration also writes to, so Shopify may commit the deploy
      back into the branch. **Not hypothetical** — the client's own troubleshooting
      documents it causing non-fast-forward rejections. Needs measuring: does it
      happen, does it loop, does it trip `drift-detection` or `content-changed`.
- [ ] **J4 — Commit to `main` publishes.** Confirm the risk above is real, then
      confirm protection plus the gated workflow contains it.
- [ ] **J5 — Promotion as a merge.** If J1–J4 behave, promotion could become
      "commit the ticked files to `main`" instead of `theme push --only`, and the
      `content-snapshots-*` branches become redundant because git history is the
      snapshot. **Deliberately not built yet** — rewriting the promote job before
      observing the echo-back would be guessing.

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
