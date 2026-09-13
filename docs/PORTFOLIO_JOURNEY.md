# Portfolio intake → editable profile → dancers.bio sharing

Implementation: `codex/portfolio-journey-20260913`.
Status: initial release deployed through PR #247; nickname usability follow-up described below.

## Existing gaps

The lite careers page explicitly hid `ImportEntryButton`.
The old parser synchronously called the OpenAI API using a billed API key.
The public page already rendered `dancers.portfolio` galleries, but owners had no multi-media editor.
`ProfileLinkCard` existed without an active caller.
Partial import saves retried already successful rows and could duplicate careers.

## User journey

### Nickname follow-up, 2026-09-13

The sharing step now includes an editable `dancers.bio/` nickname field and a stage-name suggestion.
Names are saved exactly after trimming/lowercasing; no random or numeric suffix is silently appended.
An occupied automatic stage-name address stays unset until the member chooses an available nickname.
Explicit duplicates are rejected, including addresses held by profiles hidden by RLS.
Application route names are blocked using the same reserved segment set as the vanity middleware.
Existing member addresses are unchanged until explicitly edited; after changing an address, members are prompted to update previously shared links.
The profile form is remounted after nickname saves so a later profile edit cannot restore a stale address.
The previous screenshot's `portfolio-qa-...` suffix belonged only to the synthetic test account.

Verification: nickname rule tests, TypeScript, focused ESLint and authenticated browser checks passed for exact save, stage-name selection, duplicate/reserved rejection, reload persistence and 320/390/1280px layouts.
Evidence: `Desktop/deliverables/deetz-portfolio-20260913/nickname/`.

1. Existing owners enter `/me/portfolio/[dancerId]` from My portfolio.
   New profile creation returns to this page, preserving an explicit casting/application `returnTo`.
2. PDF (32MB) or pasted text (50,000 characters) enters a private durable import job.
   The OAuth worker produces structured career drafts; the user checks dates, edits fields and selects what to save.
   Missing dates remain in the review instead of dropping the career.
   The date must be supplied before the existing careers schema accepts that row.
3. Saved careers use the existing `careers` table and editor.
   Stable import keys deduplicate repeated saves, including a lost response.
   Successful rows disappear from partial-error review; failed rows remain editable.
4. The existing profile/portrait editor is collapsible.
   Owners add multiple JPG/PNG photos and MP4 videos (50MB/file), or YouTube/Vimeo links.
   Media can be reordered or removed from the gallery.
   The existing single downloadable portfolio attachment remains available separately.
5. The final share section opens/copies `https://dancers.bio/<slug>` and explains adding it to Instagram's external profile links.
   Pending/rejected profiles retain their approval gate; no unusable share link is advertised.
   Clipboard failure offers manual selection of the full URL.

## Data and execution contracts

- `supabase/migrations/20260913084102_portfolio_journey.sql` adds private `portfolio_import_jobs`, two service-only invoker RPCs, `careers.import_key` and its `(dancer_id, import_key)` unique index.
- Jobs enforce one request per minute and five per rolling 24 hours under an advisory transaction lock.
  Identical request IDs return the original job before rate-limit evaluation.
- Claim uses `FOR UPDATE SKIP LOCKED`.
  Processing older than ten minutes becomes failed, without automatically billing another model attempt.
- Server actions authenticate each operation and scope job reads/writes to the current profile.
  Authenticated SQL access to jobs is SELECT-only with owner RLS; anon has no access.
- `scripts/portfolio-import-worker.mjs` reuses the established local Claude subscription authentication check and agent SDK installation.
  It passes no tools/MCP servers, persists no CLI session, validates output with Zod, and passes only OS/runtime environment variables into the model process.
  It does not call the old API-key extractor or write careers directly.
- Raw sources and extraction drafts remain private in the job table and `portfolio-uploads` bucket.
  Completed/replaced reviews receive `reviewed_at`; the latest unfinished review can be recovered without session storage.
  Automatic retention deletion is not introduced in this release.
- Photos/video bytes reuse `portfolio-media`, with existing owner Storage policies.
  Gallery data reuses `dancers.portfolio` JSONB; no public-profile schema or RPC change is needed.
  The owner-only action validates upload URLs against the dancer's own path and uses compare-and-swap to avoid lost concurrent edits.
  Gallery removal removes the reference, not the stored original object.
- Public career visibility and existing profile approval policy are preserved.
  Imported profile-name/bio fields are not automatically applied over an existing profile; the user edits those in the profile form.

## Activation checklist

1. Review/apply the migration to deetz Supabase `wvfmqiajdvbsevlhlgtl`.
2. Verify subscription authentication and queue access:
   `node --env-file=<deetz production env path> scripts/portfolio-import-worker.mjs --check`.
3. Register the dedicated Windows worker and hub automation before enabling intake.
   Run `powershell -NoProfile -File scripts/install-portfolio-import-worker.ps1 -Enable` after release approval.
   Hub key: `deetz:portfolio-import`; Windows task: `DeetzPortfolioImport`.
   It runs one job every minute through the shared hidden launcher, prevents overlapping instances, and records heartbeat and outcome in the hub.
   The Windows user must be logged in; failed runs restart on the next scheduled minute.
   Optional foreground development command: `node --env-file=<env> scripts/portfolio-import-worker.mjs --watch` (15-second polling).
   This is not an active automation until present and enabled in the hub registry.
4. Set `PORTFOLIO_IMPORT_ENABLED=true` and deploy the approved branch to Vercel `dancers-bio-lite`.
   Keep the flag absent/false until the migration and worker are healthy.
5. Confirm a consenting test account can upload, save, reload, edit and open its public vanity link.
   No real member records were written during local verification.
6. Disable new intake by setting the flag false and redeploying.
   Existing profile/career/media editors continue to work.
   Preserve queued data; no destructive rollback is required.

### Production activation, 2026-09-13

The user approved production deployment after reviewing the local result.
The migration was applied to the canonical deetz Supabase project, with owner-only reads and service-only queue mutations verified.
`DeetzPortfolioImport` was installed using the existing `wscript.exe` hidden launcher and registered in the hub.
Production `PORTFOLIO_IMPORT_ENABLED=true` was configured; release and canary identifiers are recorded in the project memory after verification.

## Verification

- `node --test scripts/test-portfolio-journey.mjs`: real PostgreSQL engine (PGlite) exercises schema, owner/stranger/anon access, service-only RPC permissions, limits, claim recovery and duplicate career keys.
- `PORTFOLIO_TEST_OAUTH=1` additionally calls the real subscription model with synthetic text and PDF fixtures.
  Both pass, including an undated career remaining in the result.
- `scripts/portfolio-qa-server.mjs` is a loopback-only, disposable Supabase boundary backed by PGlite.
  Use a QA-only `.env.local` pointing to `http://127.0.0.1:3321`, with dummy anon/service keys, `PORTFOLIO_IMPORT_ENABLED=true`, and `UI_LOCALES=ko,en,ja`.
  Build/start Next on port 3320 and run `NODE_PATH=<global npm root> node scripts/qa-portfolio-journey.cjs`.
  Browser requests to non-loopback origins are blocked.
- Browser coverage: accepted enqueue with lost response and idempotent retry, draft recovery after clearing session storage, extraction review, missing-date correction, edited save, replay deduplication, multi-photo upload (including long filenames), MP4 upload and actual public playback, video link, reorder/removal, reload, subsequent career edit, clipboard denial, 320/390/1280px layouts and ko/en/ja pages.
- Synthetic screenshots and passing result: `C:/Users/tkay/Desktop/deliverables/deetz-portfolio-20260913`.
  Final result: two careers, three media items and no browser page errors.
  The local build was produced with isolated QA configuration; rebuild with the intended environment before running elsewhere.
- Production webpack build, TypeScript and focused ESLint pass.
  Browser testing uses a local service boundary; deployed RLS/Storage and domain behavior still require post-approval production verification.
