# Text / screenshot project intake

Status (2026-09-12): implemented and tested locally; migration, production web release and scheduled runtime have NOT been activated.
The existing live `/admin/projects/import` text-only API-key importer remains unchanged.
The new subscription-only path is `/admin/projects/intake`.

## Operator workflow

1. Paste source text, upload screenshots or paste an image with Ctrl+V.
2. Select languages in display order (Korean, English, Japanese, Chinese, Thai or Indonesian; up to four).
3. Keep company/group/contact names hidden, optionally add private terms and separate administrator writing instructions.
4. The local worker extracts visible text and prepares a structured project, missing-information list, supporting excerpts and two existing Studio cards per language.
5. Review source screenshots, project fields, cards and captions together.
6. Edit fields or add corrections; regenerate cards before registering so the notice and cards use the same revision.
7. Register as a **draft**, including the default recruitment channel, via one idempotent transaction.
8. Open the project through its short-code link; publication and social dispatch remain separate approved operations.

Each deck has two 1080×1350 light-theme PNGs and a caption of at most 500 characters suitable for Instagram/Threads preparation.
Captions include `@deetz.kr` and `link in bio` application guidance.
The intake worker never calls Studio upload/enqueue, sends notifications or opens projects for recruitment.
Source language is not guessed: the first selected language is used for the project's title and description.

## Boundaries

- `src/lib/project-intake/schema.ts`: strict JSON/input contract, private-term/HTML checks and exact card/language counts.
- `src/app/actions/project-intake.ts`: every action calls `requireAdmin`; signed source uploads and batched private preview URLs; revision-aware review and registration.
- `db/migrations/20260912110952_project_intake_studio.sql`: admin-service-only inbox, private storage bucket, serial lease/claim and transactional draft registration.
- `scripts/project-intake-worker.mjs`: local Claude subscription auth check, tool-less vision/OCR, source deduplication, result validation, render checkpoints and private asset storage.
- `scripts/intake-studio.mjs`: existing Studio API and renderer only; safe-area/title verification; no new template or image-generation provider.
- `scripts/project-intake-scheduled.cjs`: optional 2-minute runtime, self-registration and 60-second heartbeat in the existing hub registry.

The design follows modoo CS drafts' separation of source data, administrator corrections, subscription inference and human approval.
Corrections accumulate in operator notes; an edited project is passed as authoritative input for regeneration.
This is not cross-project self-learning.

## Safety and recovery

Source limits: 20,000 text characters and five PNG/JPEG/WebP images, each at most 8MB and 40 million decoded pixels.
Images are decoded, rotated and reduced to a maximum 2000×4000 before vision inference.
Private screenshots are never attached to public projects or sent to the Studio.
Private review links expire after one hour.
Source text/images are untrusted data; the model has no tools, MCPs, shell or publishing capability.
API-key and alternative-provider environment variables are removed and `claude auth status` must report first-party `claude.ai` authentication.
There is no paid-API fallback.

Claims use a 15-minute lease and token/revision fencing; only one intake processes at a time to protect the shared renderer.
Expired leases can be reclaimed up to three attempts; completed inference/Studio job IDs are checkpointed.
Model/render/storage failures stop at `failed`, retain source data and require an operator retry.
Repeated registration returns the same project; a recruitment-channel failure rolls back project creation.
Missing facts are not silently filled except the existing database-required headcount default of one, disclosed in the review list.
The model can still misread screenshots or phrase requirements incorrectly: source/card review remains mandatory.
Only Korean and English have received actual screenshot-to-render validation in this release; other language choices require operator copy review.

## Deployment prerequisites (not yet executed)

Use a stable checkout of this branch, with Node 24+, project dependencies from `npm ci`, and the existing local Studio running on `127.0.0.1:7795`.
The Studio checkout supplies its existing `@anthropic-ai/claude-agent-sdk`, `ts-node` and card template.
The current global native Claude executable is used explicitly because the Studio SDK's old bundled CLI failed with `write EOF` during testing.
The local deetz `.env.local` supplies `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; do not copy their values into docs or the browser.

Optional local path overrides:

- `DEETZ_STUDIO_ROOT`: existing Studio checkout.
- `DEETZ_CLAUDE_EXECUTABLE`: subscription-authenticated native Claude executable.
- `DEETZ_HUB_WORKER_DIR`: existing hub worker directory whose private `.env` is read only by the scheduled runner.

After production release approval:

1. Apply the additive migration to the canonical deetz database (`wvfmqiajdvbsevlhlgtl`).
2. Deploy the web code through the repository's normal release workflow.
3. Run `node --env-file=.env.local scripts/project-intake-worker.mjs --check`.
4. Run `powershell -NoProfile -File scripts/install-project-intake-worker.ps1 -Enable`.
5. Verify the Windows task `DeetzProjectIntake` and hub `automations.key=deetz:project-intake-studio` are enabled and heartbeating.
6. Perform a live administrator submission/review/registration smoke test and an unauthorized-access check.

The installer without `-Enable` performs no changes.
The scheduled task uses a hidden PowerShell window and an interactive user token, so this Windows user must be logged in and the PC/Studio must be running.
For manual operation, `npm run intake:worker` processes the queue continuously; do not claim an always-on runtime from that command alone.
To pause after activation, disable the Windows task and the matching hub automation; leave jobs/assets and the additive schema intact.

## Validation

- `npm run test:project-intake`: input/privacy/OAuth/image checks; PGlite migration, lease recovery, stale-token rejection, admin/revision checks, real worker state transitions with mocked AI/Studio, storage-failure containment and transactional/idempotent registration.
- `node scripts/test-project-intake-ui.mjs`: real React component with mocked server actions, text submit, language order, dirty-edit guard, revision flow, registration link, clipboard upload, 390px overflow and page-error checks.
- `npm run typecheck` and targeted ESLint.
- `npm run build -- --webpack`: production build.
- `node scripts/verify-intake-ocr.mjs <screenshot paths...> --render`: opt-in real subscription OCR plus actual Studio rendering, without database writes or social dispatch.

Test outputs stay in gitignored `scripts/out/` because source transcripts can contain confidential details.
The UI test is an isolated harness, not proof of production authentication/storage/queue integration.
The remaining live acceptance checks are explicitly part of activation above.
