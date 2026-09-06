# Changelog

## Unreleased

## 0.1.9.0 - 2026-09-06

- Let staff measure multiple Instagram accounts from newline-separated handles or profile URLs with duplicate removal, progress tracking, and per-account results.

## 0.1.8.0 - 2026-09-06

- Raise the shared daily Instagram rate-check measurement limit from 60 to 300 while keeping seven-day cache hits free from the quota.

## 0.1.7.0 - 2026-08-30

- Let selected casting posts request a companion's Instagram handle in the application message and show that message in the applicant detail panel.
- Register mixed-rate receivables in one form with server-calculated supply, VAT, and contract-cap validation.
- Compare the contracted supply amount with confirmed revenue and flag matching, missing, or excess amounts.
- Group multiple confirmed revenue items under one immutable tax-invoice record, with one issuance date, due date, and document total.
- Preserve the last valid recruitment-channel link through signup and onboarding, validate it again when applying, and restore the missing Baw attribution for Punchbunny.

## 0.1.6 - 2026-08-12

- Let clients review project candidates through a revocable, project-scoped magic link without creating an administrator account.
- Keep client choices separate from application status, and require a manager to apply selected candidates as accepted or confirmed.
- Reuse the existing casting board, hide direct-contact links, record review history, and support link expiry and reissuance.

## 0.1.5 - 2026-08-11

- Search administrator settlements instantly by dancer name, nickname, or project without refreshing the page or sending a request for each keystroke.
- Require a valid bank account and resident or foreigner registration number before withdrawal requests, transfer files, or paid-state transitions can proceed.
- Keep payout eligibility consistent in the dancer and administrator screens, and preserve the live database trigger as a versioned migration.

## 0.1.4 - 2026-08-11

- Collect name, birth year, height, primary genre, dance video, backup-dancer history, and optional personal-profile links on selected casting posts.
- Pre-fill application fields from the member profile while allowing applicants to complete or correct missing details before submission.
- Preserve submitted details as administrator-visible snapshots and enforce completeness, safe links, and applicant-side immutability at the database boundary.

## 0.1.3 - 2026-08-11

- Let administrators cancel unpaid test, duplicate, or otherwise invalid settlements from the detail panel.
- Add a visible `전체 선택 (인원수)` control that selects every payout-ready person for batch transfer processing.
- Protect paid settlements from cancellation and guard cancellation updates against concurrent status changes.

## 0.1.2 - 2026-08-01

- Redesign public dancer and team portfolios with image-led artist heroes, selected work, media galleries, and readable credits.
- Keep portfolio content unobstructed across mobile and tablet layouts, including clean dancers.bio profile URLs.
- Add safe external media fallbacks, complete career categories, and hardened profile metadata rendering.

## 0.1.1 - 2026-07-23

- Replace the free-text Zoom availability field with three localized date-and-time inputs.
- Validate distinct consultation options on both the client and server while preserving legacy schedule data.
- Present submitted consultation options clearly in visa operations.
