# Campaign results implementation handoff

Implementation date: 2026-09-07.
Design source: `docs/design-campaign-report.md`.
UI rework (2026-09-07): see `docs/campaign-ui-rework.md` for the ops shell, revised screens, and validation.

## Delivered files

| Files | Responsibility |
| --- | --- |
| `db/migrations/20260907_001_campaign_results.sql` | Six service-role-only tables, composite foreign keys, serialized daily reservation and transactional idempotent finalization. |
| `src/lib/instagram/handle.ts`, `handle.test.ts` | Shared Instagram handle normalization and case-preserving reel URL parsing. |
| `src/lib/rate-check/pricing.ts`, `server.test.mjs` | Retain the old normalization export and update the existing isolated test dependency. |
| `src/lib/casting/board-data.ts` | Use shared normalization when reading board handles. |
| `src/lib/campaign/types.ts` | Observation, execution, admin response and public report contracts. |
| `src/lib/campaign/metrics.ts` | Pure KPI, coverage, same-set comparison, distributions, follower tiers, account realization and compliance calculations. |
| `src/lib/campaign/observations.ts` | Actor response parsing, missing/error distinction, same-shortcode likes recovery, handle union and cost caps. |
| `src/lib/campaign/apify.ts` | Asynchronous actor start, status, abort and paginated dataset reads; sanitized errors. |
| `src/lib/campaign/repository.ts` | Explicit typed service-role projections, project scope, applicant/forecast validation and default board selection. |
| `src/lib/campaign/import.ts` | Multiline URL and quoted CSV validation with duplicate checks. |
| `src/lib/campaign/report-settings.ts` | Public setting allowlist. |
| `src/lib/campaign/report-builder.ts`, `report-data.ts` | Deep-copied publication DTO and published-payload-only public loading. |
| `src/lib/campaign/backfill.ts`, `scripts/backfill-campaign-lg.mts` | Validated original-run mapping and dry-run-first LG import; the script was not executed. |
| `src/app/actions/campaign-results.ts` | Staff/project gates, post/rule/report mutations, two-stage collection, polling, stale recovery, preview and publication. |
| `src/app/(ops)/tools/campaigns/page.tsx` | Scoped project selector and campaign table with search, filters, sorting and 50-row pages. |
| `src/app/(ops)/tools/campaigns/[projectId]/page.tsx` | Awaited URL state, project gate, snapshot selection, KPI and three tabs. |
| `src/components/admin/campaign/AddCampaign.tsx`, `AddPostsDialog.tsx` | Campaign selection and paste/CSV preview followed by save. |
| `src/components/admin/campaign/PostsTable.tsx`, `PostSheet.tsx` | Searchable/filterable/sortable 50-row post table and authorized raw/history editor. |
| `src/components/admin/campaign/SnapshotDialog.tsx` | Five-second polling, refresh recovery and stale-run closure. |
| `src/components/admin/campaign/RulesPanel.tsx`, `TrendPanel.tsx`, `CostPanel.tsx` | Rules, history, same-set growth, distributions, realization and super-admin-only cost input. |
| `src/components/admin/campaign/ReportsPanel.tsx`, `Controls.tsx` | Draft settings, selected trend range, preview, publish/republish, expiry and link copy. |
| `src/app/results/[code]/page.tsx`, `src/components/campaign/ResultsReport.tsx` | Dynamic noindex publication rendering, inline SVG, tables, coverage and separate follower measurement basis. |
| `src/components/admin/AdminNav.tsx`, `src/app/(app)/admin/projects/page.tsx`, `src/components/layout/SitePopup.tsx` | Campaign navigation, project performance links and `/results` popup exclusion. |
| `src/lib/campaign/{metrics,observations,report,server,backfill}.test.ts`, `test-fixtures.ts`, `test-loader.ts` | Pure, mocked server, permission, publication/rendering and backfill contract tests. |
| `src/lib/campaign/fixtures/lg-t10-counts.json` | Numeric-only 90-post regression fixture; no handles, names, URLs, raw payloads or credentials. |

## Validation

The PowerShell execution policy rejects `npx.ps1`/`npm.ps1`, so `.cmd` entry points were used.

| Requested check | Result |
| --- | --- |
| `npx tsc --noEmit` | Passed using `npx.cmd tsc --noEmit`. |
| ESLint for all changed JS/TS files | Passed with no warnings or errors. |
| `npx tsx --test src/lib/campaign/*.test.ts src/lib/instagram/*.test.ts` | Earlier runs executed through `npx.cmd`; the final invocation hit npm registry `EACCES` because `tsx` is not a project dependency. The same final test set passed, 30/30, with the already installed local tsx CLI below. |
| `npm run test:rate-check` | Passed, 25/25. |
| `npx next build` | Passed; the three new routes appear in the build output. |
| `git diff --check` | Passed. |

Final test fallback (no install, no network, no dependency edits):

```powershell
node 'C:/Users/tkay/Desktop/dev/mid-class-board/node_modules/tsx/dist/cli.mjs' --test src/lib/campaign/*.test.ts src/lib/instagram/*.test.ts
```

Existing warnings: multiple lockfiles/workspace-root inference, the deprecated Next.js middleware convention, and the existing Node typeless-package warning in rate-check tests.
No build configuration was changed to hide these warnings.

## Migration/application order

1. Confirm the existing `projects`, `dancers`, `applications`, `profiles`, `casting_boards`, `casting_board_members` tables and `gen_project_survey_code()` function are present.
2. Apply `20260907_001_campaign_results.sql` as one transaction in the separately authorized deployment step.
   It creates objects and is intended to be applied once through the migration ledger.
3. Verify all six tables have RLS, no public/authenticated policies or direct grants, and only `service_role` can execute the two RPCs.
4. Deploy the application after the schema is available.
   The implementation uses explicit temporary schema types; `db:types` was not run.
5. Verify logged-in admin/co-manager flows, cross-project refusal, actual RPC concurrency and public 200/404 behavior after schema application.
6. Reconcile the LG source discrepancies below before an authorized LG backfill/publication.
   Start with the script's default dry-run; `--apply` is a separate explicit choice.

The script, DB migration, live Apify collection, production deployment and git commit were not executed in this implementation session.
The database concurrency/foreign-key checks are SQL contract checks, not a claim that a live database test was run.
Logged-in browser verification remains with the representative, as specified by the design.

## Source discrepancies / design disagreements

No alternative product architecture was substituted for the design.
Two requested numerical baselines disagree with the supplied source files:

* The original T+10 top-ten sum is **66,925 / 219,808 = 30.447...%**, which rounds to **30.4%**, not the document's **30.5%**.
  The implementation retains ordinary arithmetic.
  The regression test records this discrepancy rather than changing observations or forcing the display value.
  Other requested totals match: 219,808 plays; 88/90 found; 690 comments; 553 shares on 79 posts; 7,045 confirmed likes on 62 posts; top-one/top-five 5.1%/19.4%.
* `lg-reels-profiles-snapshot-20260903.raw.json` contains **100 items, 99 measured follower counts, sum 235,190**.
  The separate `lg-reels-profiles-snapshot-20260903-fix-ggoomchimaaaan.raw.json` contributes the missing **26,521** and has its own `fetchedAt`, but no original run ID in its metadata.
  This explains the document's 261,711 total.
  The implementation does not silently attribute this separate observation to the original profile run.
  The backfill prints the available coverage and warns when it differs from the planning baseline.
  A separately reconciled input/provenance decision is required for the exact 100-account baseline.

## Operational details and remaining risks

* The profile-start CAS stores `__starting__` in `profiles_run_id` before the external call, then replaces it with the actual run ID.
  This makes simultaneous polls start at most one profile actor.
  If the process dies between claiming and saving, the existing 30-minute stale-run operation closes the ledger; actor timeout/cost limits bound external execution.
* Missing hashtag/mention observations are nullable; an observed empty array means a confirmed missing requirement.
  This preserves the design's distinction between unknown observations and noncompliance.
* Reels/profile `maxTotalChargeUsd` are reserved per-actor and sum to at most $3.
  Profile targets discovered after reel collection use the reserved profile cap; low coverage is possible when previously unknown collaborators exceed the estimate.
* Backfill reruns skip any existing original `apify_run_id`, including incomplete historical imports, as requested.
  Inspect an incomplete import before retrying rather than assuming the script will overwrite it.
* Migration application, live Actor behavior and authenticated browser interactions still require operational verification.
  The tests use explicit side-effect mocks and do not access credentials.

## Shared SSoT follow-up

The shared files under `C:/Users/tkay/.claude/` are outside this session's writable workspace, and approval escalation is unavailable.
They were not edited.
After review, append the following implementation status to `CAPABILITY_MAP.md` and the relevant campaign memory, and document the integration in `INTEGRATIONS.md`:

> Campaign results implemented locally: `/tools/campaigns`, `/tools/campaigns/[projectId]`, frozen `/results/[code]`; migration `20260907_001_campaign_results.sql` not applied; no deployment/backfill executed.
> Two-stage asynchronous Apify collection uses the existing `RATE_CHECK_APIFY_TOKEN` and service-role-only campaign tables/RPCs.
> See `docs/campaign-results-implementation.md` for tests, deployment order and the two LG source discrepancies.
