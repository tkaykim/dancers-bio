# Campaign operations

The campaign submissions and budget routes use a unified operations panel.
Staff can search by name, account or owner, filter work that needs attention, sort by scheduled date, compare fee negotiations, and edit participant details in the existing drawer.

## Data and accounting

- `campaign_participant_operations`: engagement, schedule and schedule kind, owner, reported-upload flag, next action, notes, and account-level deliverable allocations.
- `campaign_operations_settings`: campaign operating notes, retention and payout notes, and super-admin spending target/cap.
- `campaign_budget_fees.terms`: guide, creator request, offer, base amount, conditional bonus, threshold and manually confirmed condition status.
- Only base plus bonus reserves a participant fee; comparison amounts and account allocations are not additional expenses.
- Held/cancelled participants do not reserve planned fees; existing settlements still count using the existing budget calculation.
- Unknown fees and expenses remain unknown; known required amount is not actual paid spending or final remaining budget.
- Multiple collaborative submissions referencing the same post count once toward required deliverables.

## Access and writes

Staff and project scope checks run before service database reads and actions.
Only super-admin responses include campaign budget, operating costs, settlements and spending limits.
Assigned managers can view and edit participant fee negotiations and operating notes.
Public boards, reports and participant self-submission responses do not load these private operations tables.
Client visibility remains an explicit existing setting and is not enabled by this change.

`campaign_operations_mutate` serializes project changes, checks participant/operations/fee versions, validates input, and records an audit event atomically.
Cancelling a participant preserves fees and submission history.
Manual participants are protected from duplicate creation by later roster synchronization.
Legacy fee total changes clear stale structured terms.
No payment, notification, automatic approval or paid collection is triggered by operational edits.

## Validation

`npm run test:campaigns` includes pure calculation, authorization, redaction, and actual migration/RPC tests in isolated PostgreSQL.
Run `npm run build` and ESLint on changed modules.
Browser checks cover desktop/mobile layout, filters, money comparison and participant drawer.
Operational campaign imports belong in private local artifacts, never public source or PR descriptions.
