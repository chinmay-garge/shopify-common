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

- [x] **B1 — Staging fan-out.** PASSED. Deployed to all three staging themes in one run, each to its own theme (`163070116097`, `192771817842`, `193501954414`) on its own store. Confirmed twice. `fail-fast: false` isolation proved separately by F3.

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
- [x] **B4 — Content is not clobbered.** PASSED. Site-a staging content stayed at `r5-promote-retest` across a full code deploy, and `sandbox-table.liquid` survived too — a direct regression test of the `--nodelete` fix that previously deleted it.

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
- [x] **C6 — Common wins.** PASSED, with the branch as evidence. Both site-b and site-c staging branches now read `data-sandbox-origin="COMMON-VERSION"` and site-c's extra `hide_background` setting is gone, with `shopify[bot]: Update from Shopify for theme staging` as the latest commit. Common won, the theme took it, the branch recorded it.

- [!] **C7 — Orphaned settings are harmless.** NOT EXERCISABLE as written. After the deploy replaced site-c's section, no template in site-c still referenced the removed `hide_background` setting, so there was no orphaned setting left to test. Recording this rather than claiming a pass — the fixture needed a template that sets the value, which it never had.

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
- [x] **D3 — Diff is accurate.** Fixed twice over. A byte-comparison of the repo
      against a theme pull reported **10 of 10 templates changed when 1 had**,
      because Shopify prepends an auto-generated banner and materialises empty
      `"settings": {}`. Now compares `staging` branch against `main` branch —
      no Shopify call, no token, and none of those artefacts, since both sides
      are repo-formatted. Reports exactly the one changed page.
      Why it mattered: a report that always says "everything changed" gets
      ignored, and then a reviewer approves a promotion without reading it.
- [x] **D4 — Line endings and reformatting are not false positives.** Reproduces
      the client artefact precisely. The same ten templates, re-indented to four
      spaces and converted to CRLF: a byte-level `diff -qr` reported **15 files
      different**; the semantic comparison reported **0 changed, 10 in sync**.
      This is the effect that made 49 identical client files look diverged, and
      the reason the comparator parses rather than compares bytes.
      *(This entry was accidentally deleted by a careless `sed` range while
      tidying the document, and restored. Worth noting because the same class of
      mistake — a range delete taking neighbours with it — is exactly what the
      `--nodelete` finding was about.)*
- [x] **D5 — Promote is approval-gated.** Verified with a real pending
      deployment on `production-approval`. An earlier run where `approve`
      finished in 3s looked like a bypass but was simply a fast human click.
- [x] **D6 — There is a way back.** The snapshot branch was **removed**, not
      fixed: it was the cause of the silent no-op (see J5), and `main`'s history
      is a better record anyway. The success comment names the commit SHA and
      says to revert it.
- [x] **D7 — Only ticked files ship.** One page ticked of ten; the commit
      contains exactly that path.
- [x] **D8 — Checklist resets.** 0 ticked boxes and the `promote-sb-a` label
      removed after a successful promotion.
- [x] **D13 — Promotion is verified, not assumed.** The new step reads the live
      theme back and semantically compares it to what was committed, retrying for
      ~90s, and **fails** if the theme never matches. Also distinguishes "already
      identical to production" from "promoted", so a no-op cannot be reported as a
      success. This exists because of J5.
      End-to-end proof: `staging` r5 → gated approval → commit to `main` →
      **live theme r5**, confirmed independently afterwards.
- [x] **D9 — Nothing ticked.** PASSED. Promoting with nothing ticked posts "Nothing to promote — no pages were ticked", removes the label, and the approval and promote jobs never run — so no reviewer is pinged for an empty request.

- [ ] **D10 — Failure leaves a retry path.** A failed promotion keeps the label
      and reports the run URL.
- [x] **D11 — Site isolation.** PASSED, and now structural rather than incidental. Promoting `sb-a` commits only to `site-a`; site-b and site-c `main` branches were untouched, still on their earlier commit. Cross-site contamination is impossible by construction since each promote targets one repo.

- [x] **D12 — Unknown site key.** PASSED. A `promote-sb-z` label failed at `resolve` with an explicit "Unknown site key" error, and every downstream job — including the approval — was skipped.

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

- [x] **F1 — Port a unique section.** PASSED, both halves. **Incomplete port** (section only, no snippet, no locale keys) was caught by Validate with `MissingTemplate` naming `snippets/sandbox-table-cell.liquid` at the `{% render %}` line, plus 11 × `ValidSchemaTranslations`. **Completed port** (snippet + locale keys added) went green. This is the client's comparison-table mistake, now caught at PR time instead of by a human opening the theme editor.

- [x] **F2 — Port the simple case.**  needed no locale
      keys and no snippet dependency, so it is the true simple case. Validate
      passed on the first try, no additional work needed.
      One complication surfaced while setting this up, not part of the test
      itself: the fixture had been deleted from site-b's  branch by
      an earlier pre- deploy (same bug as J3/J5, a second
      instance). It survived on , was restored to  from
      there, and only then ported.

- [x] **F3 — Cold onboarding.** PASSED. Adding `SITE-D` to the matrix with no environment configured: `Deploy (SITE-D)` failed while SITE-A, SITE-B and SITE-C all succeeded, and the failure came from the token action's own diagnostic rather than an opaque error. Matrix variable restored afterwards.

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

- [x] **G1 — Diverged history reproduces.** PASSED — reproduced the phantom diff. Two branches with byte-identical trees but a stale merge-base (content "synced" by copying rather than merging): a feature branch containing **one** real change showed **11 files** in its diff.

- [x] **G2 — Merge fixes it.** PASSED — the fix works. After a real merge restored ancestry, the same feature branch showed **1 file**. Content never changed; only history did.

- [x] **G3 — Dropped commit.** PASSED in a deterministic variant, with an honest caveat. The original incident was a race and is not reproducible on demand. What is reproducible: merging a branch at an earlier SHA silently omits later commits — the merged result did not contain "Follow-up fix". The detection also works: comparing the merge result against the branch tip surfaces exactly the file left behind. Lesson: "merged" does not imply "contains the latest".

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
- [x] **J2 — Commit → theme.** Confirmed twice, in both directions of the
      pipeline. Restoring `sandbox-table.liquid` to the `staging` branch put it on
      the staging theme; committing a promoted template to `main` put it on the
      **live** theme before the first poll. This is the property the whole
      git-based promote design rests on.
- [x] **J3 — Echo-back from a CI deploy. This found the worst bug in the setup.**

      The echo is real: a staging deploy produced
      `shopify[bot]: Update from Shopify for theme staging` on all three site
      repos within a minute.

      But the echo was not the problem — what it *carried* was. The commit
      **deleted** site-a's own files:
      ```
      sections/sandbox-table.liquid      | 105 ------------------------
      snippets/sandbox-table-cell.liquid |  22 ------
      ```
      Cause: `shopify theme push` removes remote files absent locally unless
      `--nodelete` is passed, and **neither deploy workflow passed it**. So the
      deploy deleted the site's unique section from the theme, and because the
      theme is GitHub-connected, Shopify then committed that deletion **back into
      the repo** — destroying the git record as well.

      Those two files are the stand-in for skinstylus's `comparison-table`, i.e.
      exactly the class of file the real migration is about.

      How narrowly this was survived: the files remained on `main` only because we
      had deployed to staging alone. `main` is connected to the live theme, so a
      production deploy would have deleted them from **both** branches — gone from
      the theme, gone from the repo, no git history anywhere.

      **The client repo has the same exposure.** `hydrafacial`'s
      `deploy-staging.yml` and `deploy-production.yml` contain zero occurrences of
      `--nodelete`; skinstylus's workflow used it. Today it is masked because the
      five regions are meant to hold identical code — but any region-specific file,
      or any file not yet ported during the skinstylus migration, is deleted on the
      next deploy.

      Fixed here by adding `--nodelete` to both deploys, with the trade-off stated
      in the workflow: files intentionally removed from the shared repo now linger
      on themes, and clearing them should be a deliberate prune rather than a
      silent side effect of every deploy. **A prune path does not exist yet** —
      noted as a gap rather than quietly ignored. (The client had a
      `theme-prune.yml`, since retired.)
- [x] **J3a — No runaway loop, but the workflows watched the wrong branch.**
      The echo triggered nothing, which was luck rather than design: it landed on
      `staging` while both site workflows watched `main`. In the two-branch model
      that is simply wrong — editors work in the Staging theme, so their commits
      land on `staging`. `content-changed` would never have fired for a real
      editor change, and drift detection was blind to the branch receiving all the
      activity. Now `content-changed` watches `staging`, and `drift-detection`
      watches both.
      Worth keeping in mind: the fix re-opens the loop question, since
      `content-changed` now watches the branch the echo lands on. It is contained
      by the path filter — the echo carries `.liquid`/`.css`/`settings_schema.json`,
      none of which match `templates/**.json`, `sections/*.json` or
      `settings_data.json`. That containment is a path filter away from breaking,
      so it is deliberate, not incidental.
- [x] **J4 — Commit to `main` publishes.** Confirmed, and quickly: committing a
      template to `main` reached the live prod theme before the first poll.
      The risk is real, and branch protection plus a gated writer is what
      contains it.
- [x] **J5 — RETRACTED AND CORRECTED. The cause was a bug in this repo's own
      promote job, not Shopify.**

      What was originally concluded here — "a `theme push` to a GitHub-connected
      theme reports success and does not persist" — **was wrong.** It was inferred
      from one failing run without isolating the variable. Two later tests
      disproved it: a code marker pushed to the connected staging theme persisted
      and echoed into the branch, and an `r4` content push to the **live**
      connected prod theme persisted and echoed into `main`. Pushes to connected
      themes work in both directions.

      The real cause, found by reading the step that runs immediately before the
      push:
      ```bash
      cp -f ../prod-snapshot/templates/*.json templates/   # in working-directory: site
      ```
      The snapshot step pulled **production's** content and copied it **over the
      staging checkout**. The push then shipped `page.sandbox-content.json` — which
      by then held production's own content. So promote pushed prod back to prod:
      a genuine no-op that correctly reported `pushed successfully`.

      Reproduced twice (`r3-promoted`, then `r5-promote-retest`), which is what
      turned it from "Shopify is unreliable" into "find the bug in your own
      workflow".

      Two lessons worth keeping:
      - **The failure shape is still the dangerous one**: green run, success
        comment, checklist reset, production unchanged. That part of the original
        finding stands, and it is why promote must verify rather than assume.
      - **A snapshot must never be written into the tree you are about to deploy
        from.** Reading state and staging a deploy are different jobs and need
        different directories.

      Design conclusion unchanged, but for honest reasons: promotion moves to git —
      commit ticked files to the connected branch — because it removes the CLI, the
      token, the `--only` plumbing and the snapshot clobber all at once, and
      because `main`'s history is a better snapshot than a force-pushed branch.
      Not because the CLI cannot do it.

      Measured on the live prod theme (`163070083329`, connected to `main`):

      | Path | Outcome |
      |---|---|
      | `shopify theme push --allow-live --only <file>` | log says **"The theme 'prod' (#163070083329) was pushed successfully."** — and the content **did not persist**; the template still read `r2` |
      | commit the same file to `main` | reached the theme immediately; `r3-promoted` live |

      So the promote job's `theme push --only` was a **silent no-op that reported
      success**: green run, success comment on the issue, checklist reset, and
      production unchanged. Worse than a failure, because everyone believes the
      content shipped.

      Not fully explained, and worth stating honestly rather than dressing up: the
      earlier *staging* code deploy went the other way — the CLI push won and
      Shopify echoed the change (including deletions) into the branch. So a CLI
      push and a connected branch can each win, and the outcome was not
      predictable from the outside. The client's own troubleshooting notes the same
      fight, as non-fast-forward rejections.

      What is reproducible: **going through git works every time; CLI pushes to a
      connected theme cannot be relied on.** That is enough to decide the design.

      Consequences to act on:
      - the promote job must commit ticked files to the connected branch
      - `content-snapshots-*` branches become redundant — `main`'s history is the
        snapshot, and a revert is the rollback
      - **code deploys are now suspect too**: `deploy-staging` CLI-pushes to a
        connected theme. It appeared to work, but by the rule above it cannot be
        trusted. Untested and important.
- [x] **J6 — Are code deploys durable against a connected theme?** PASSED — and it corrected an earlier wrong conclusion. A code marker CLI-pushed to the connected staging theme persisted on the theme, survived 45s, and was echoed into the `staging` branch by `shopify[bot]`. Code deploys to connected themes are durable; see J5 for the retraction this contributed to.

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
| 11 | **A deploy step can report success and ship nothing (J5)** | Cause was ours: a snapshot step copied prod's content over the staging checkout, so the push shipped prod back to prod. **`pushed successfully` is not evidence that your content shipped** — verify the result, and never write state into the tree you deploy from. An earlier version of this row blamed Shopify's GitHub connection; that was wrong and was retracted after two tests showed pushes to connected themes persist fine. |
| 14 | Diagnosing from a single failing run produced a confidently wrong conclusion | The claim above survived one run and a plausible mechanism. It took a reproduction plus two controlled counter-tests to overturn. Worth remembering when a finding implicates a third party rather than your own code. |
| 12 | Diff must be semantic, not byte-for-byte (D3) | Shopify prepends an auto-generated banner and materialises empty `"settings": {}`. A byte diff reported 10 of 10 templates changed when 1 had. A diff that always says "everything changed" is worse than none — reviewers stop reading it and approve blind. |
| 13 | A connected theme means the branch, not the theme, is the unit of work | Reading `ref: main` for content that lives on `staging` made the diff compare production against itself, and would have made promote a no-op even without finding 11. |
| 8 | **A deploy without `--nodelete` deletes a site's own files — from the theme AND, via the GitHub connection, from the repo (J3)** | **The most serious finding. `hydrafacial`'s deploys pass `--nodelete` nowhere; skinstylus's did.** Masked today only because the five regions hold identical code. Fix before the skinstylus migration, or unported files are destroyed with no git record. Add a deliberate prune path for intentional removals. |
| 9 | Connecting a theme per branch moves where activity lands (J3a) | Editors' commits arrive on the branch connected to the Staging theme, not `main`. Workflows written for a single-branch model watch the wrong branch and silently never fire. |
| 10 | Shopify's GitHub app grants access per-repository, and repos created after install are excluded | "Connected account, empty repository dropdown" is this, not a broken connection. Also survives a GitHub account rename showing the old login. Belongs in the onboarding runbook. |
| 7 | `uses:` resolves from `GITHUB_WORKSPACE`, not the workflow file | A local composite action is `./.github/actions/x` in the deploy workflows but `./hub/.github/actions/x` in `content-operations.yml`, which checks the repo out into `hub/`. Same class of bug as finding 3: multi-checkout workflows break path assumptions. |
