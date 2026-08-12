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
- [ ] **A5 — Theme Access tokens work in CI.** Pending valid tokens; the first
      batch returned 401 from both the CLI and the raw Admin API.

## B. Code deploys

- [ ] **B1 — Staging fan-out.** Push to `staging` deploys to all three staging
      themes; `fail-fast: false` means one bad site does not block the others.
- [ ] **B2 — Manual single-site deploy.** `workflow_dispatch` with a site
      picked deploys only that site.
- [ ] **B3 — Build guard.** Deleting the build step (or shipping without it)
      is caught by the artefact assertion rather than silently deploying a
      theme with no CSS/JS.
- [ ] **B4 — Content is not clobbered.** Edit `page.sandbox-content.json` in a
      Staging theme editor, run a code deploy, confirm the edit **survives**
      (this is what the ignore list buys).
- [ ] **B5 — Production needs approval.** A release triggers production deploy
      and it **waits**; nothing reaches any store until a reviewer approves.
- [ ] **B6 — Single approval covers all sites.** One approval releases the
      whole matrix.
- [ ] **B7 — Backup artefact.** Each production run uploads
      `backup-<site>-<run_id>` before overwriting.
- [ ] **B8 — Rollback.** Re-run production against an older tag and confirm the
      store returns to that state.
- [ ] **B9 — Version stamping.** `release.sh` writes `theme_version`, and the
      deployed theme reports it in the Shopify admin.

## C. Drift detection

- [ ] **C1 — Divergent file flagged.** `site-b`'s `sandbox-banner.liquid`
      raises a drift issue naming that file.
- [ ] **C2 — Site-unique file flagged.** `site-a`'s `sandbox-table.liquid` is
      reported as present locally but absent from the shared repo.
- [ ] **C3 — No duplicate issues.** A second push updates the existing issue
      instead of opening another.
- [ ] **C4 — Auto-close.** Once drift is resolved the issue closes itself.
- [ ] **C5 — Exclusions hold.** Content JSON edits and `.vbt.` build output do
      **not** trigger drift.
- [ ] **C6 — Common wins.** After a code deploy, `site-b`'s banner marker flips
      from `SITE-B-VERSION` to `COMMON-VERSION`, and `site-c` loses its extra
      `hide_background` setting.
- [ ] **C7 — Orphaned settings are harmless.** Content JSON that still sets
      `hide_background` after the setting is dropped does not break rendering.

## D. Content promotion

- [ ] **D1 — Refresh builds the checklist.** `refresh-sb-a` creates the issue
      with the eligible templates listed, and removes its own label.
- [ ] **D2 — Eligibility is conservative.** `product.json` / `collection.json`
      are absent from the checklist; page templates and singletons are present.
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

- [ ] **E1 — The bug reproduces.** `sandbox-promo` shows
      `missing translation: t:sections.sandbox-promo.name` in the theme editor.
- [ ] **E2 — Committing keys is not enough.** Adding the keys in git and
      running a normal deploy leaves the editor still broken.
- [ ] **E3 — Sync fixes it.** `sync-locales.yml` against staging clears the
      warning.
- [ ] **E4 — Production locale sync is gated.** Targeting production requires
      approval; targeting staging does not.

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
