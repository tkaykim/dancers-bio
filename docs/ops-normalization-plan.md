# Operations Normalization Plan

## Goal

Normalize the ad-hoc NDOL operations flow into reusable project operations primitives without breaking existing NDOL links or legacy data.

Existing NDOL pages remain legacy-compatible. New projects should use:

- one parent `projects` row
- many `recruitment_channels`
- many `project_events`
- event-scoped participants, bibs, QR passes, attendance, and onsite status
- outreach tasks separated from application status

## URL Policy

Do not expose Korean names or guessable project labels in URLs.

- `projects.short_code`: existing 6-character external project URL code
- `recruitment_channels.share_code`: random channel apply/share code
- `project_events.ops_code`: long random operations-board code
- `project_events.public_pass_code`: short shared participant lookup/pass entry code
- `event_participants.pass_token`: long per-participant QR token

Operations and personal-pass URLs should use longer tokens than public project/channel links.

## Data Model

### `projects`

Represents the parent project/client work unit.

Examples:

- Male idol dancer recruitment
- Commercial shoot
- Tour rehearsal pool

Legacy NDOL child projects such as `ndol26`, `ndolsm`, `ndolbd`, and `ndol37` are not rewritten. They can be linked through `recruitment_channels.legacy_project_id` if needed.

### `recruitment_channels`

Represents where an applicant entered from.

Examples:

- General
- Sangmyung University
- BADD
- Seoul Culture Arts University
- Direct recruit

Channel managers can see only their own channel applicants and channel outreach tasks.

### `applications`

Continues to represent the applicant decision record.

Additive link:

- `applications.recruitment_channel_id`

The app must keep application decision state here only:

- pending
- accepted
- rejected
- withdrawn

Operations tables should not copy application status as source of truth.

### `project_events`

Represents an operational date or session.

Examples:

- 2026-06-18 audition/rehearsal
- 2026-07-13 rehearsal
- 2026-07-14 rehearsal
- shoot day

### `event_participants`

Represents who is expected or actually handled at one event.

Event-scoped fields live here:

- bib code
- QR pass token
- attendance status
- onsite status
- checked-in time
- elimination/self-withdrawal state
- settlement eligibility

This prevents bibs and attendance from leaking across dates.

### `outreach_tasks`

Represents contact work.

This is separate from application status and event attendance.

Examples:

- call applicant
- Instagram DM follow-up
- confirm 16:00-21:00 availability
- no answer
- unavailable
- available

## Access Model

Use one operations board surface with role-scoped visibility.

| Role | Scope |
| --- | --- |
| Project owner/admin/PM | Whole parent project |
| Channel manager | Own recruitment channel only |
| Event staff | Assigned event operations only |
| Client viewer | Explicit event/project summary views only |

Do not create separate boards per channel. Use one board and filter by permissions.

## Legacy Strategy

Existing NDOL URLs and tables remain readable.

- Do not rewrite old `applications.project_id` values.
- Do not delete `ops_ndol_contacts`.
- Do not redirect old NDOL ops links to the new board until a verified compatibility layer exists.
- Use archive snapshots before adding new tables.
- Use NDOL as a read-only mapping test case before migrating any write flow.

## Migration Strategy

1. Snapshot important current tables into `archive`.
2. Add new tables and nullable FK columns only.
3. Backfill only safe permission rows from existing owners/managers into `project_members`.
4. Add RLS policies for project/channel/event scoped access.
5. Keep existing UI untouched until the new read model is verified.
6. New projects use the normalized flow first.
7. Legacy projects can be mapped gradually through channel/event rows.

## 2026-06-19 Implementation Status

Applied migration:

- `db/migrations/20260619_002_ops_normalization_foundation.sql`
- `db/migrations/20260620_001_channel_member_decision_permissions.sql`
- `db/migrations/20260621_001_event_participants_channel_ops_rls.sql`

Implemented app surface:

- New projects automatically create a `기본 모집` recruitment channel.
- Public channel entry URL: `/c/[share_code]`
- `/c/[share_code]` validates the active channel and target project, redirects to the project detail with `?channel=[share_code]`, and stores the latest valid channel for that project in a 30-day HttpOnly cookie.
- Project detail accepts `?channel=[share_code]` and stores the matching `recruitment_channel_id` on new applications.
- If signup or onboarding drops the channel query, application submission restores the project-scoped cookie, revalidates the active current or legacy project mapping, and consumes the cookie only after the application is saved.
- Parent project applicant console can filter applicants by recruitment channel.
- Parent project settings includes recruitment channel creation, share-link copy, manager-list link, and channel manager assignment.
- Channel manager applicant list URL: `/channels/[share_code]/applicants`
- Channel manager applicant list is read-only and scoped by RLS to that channel.
- Signup/login return paths preserve channel-linked application URLs, with the project-scoped cookie as the recovery path when the query is lost.
- Project managers can create reusable operation events from the applicant console.
- Accepted applicants can be copied into `event_participants` per event without changing application status.
- Generic event ops URL: `/ops/events/[ops_code]`
- Generic event ops page provides contact operation, attendance, QR/manual check-in, onsite decision, labels, and QR pass surfaces.
- Channel managers with decision permission can manage their own channel outreach tasks and event participants.
- Event staff with `admin`, `checkin`, or `floor_manager` role can update event participant state for the assigned event.

Compatibility:

- Existing project URLs such as `/projects/[short_code]` remain valid.
- Existing NDOL ops URLs and `ops_ndol_contacts` remain untouched.
- Existing projects without channel rows continue to work; managers can add channels manually.
- Future projects get the default channel automatically and can add more channels from the applicant console.

## 2026-06-21 RLS Debug Note

The normalized event data for test project `ndolt1` was present and correctly keyed.

The test event had 134 `event_participants`, 134 bib codes, 134 pass tokens, and 134 outreach tasks.

The false "0명" symptom was caused by the wrong verification path and an RLS write gap, not by missing rows.

`outreach_tasks` already allowed `can_manage_recruitment_channel(recruitment_channel_id)`.

`event_participants_manage` only checked `can_manage_project_event(event_id)` on write checks.

That blocked channel managers and non-admin event staff from updating attendance or onsite state.

`20260621_001_event_participants_channel_ops_rls.sql` adds the channel manager and event staff write paths to `event_participants`.

Verification used SQL policy/function inspection and a simulated channel-manager `auth.uid()` context.

Do not use Codex sandbox local `next dev` render checks as the source of truth for this route.

Use SQL/typecheck in Codex, then Vercel Preview or Claude Code browser verification for real render/RLS session testing.

## Non-Negotiables

- No existing links should break.
- No existing applications should be moved or overwritten.
- No old operational rows should be deleted.
- New writes should prefer normalized tables.
- Legacy and normalized data should be combined only through explicit mapping views or service-layer queries.
