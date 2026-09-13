# Visa applicant administrator mobile layout

The `/admin/visa` page previously put the full batch invitation form ahead of the applicant list.
Within each applicant row, the non-shrinking status badge competed with the name and email for the remaining width.

The batch invitation form now opens from a disclosure.
Queue shortcuts use a two-column mobile layout, search takes the full width, and secondary filters open separately while retaining their values and showing the active count.
Mobile applicants use individual cards with wrapping names and email addresses and a separate status line.
Desktop applicants retain the compact row layout.

The visa detail drawer uses the dynamic viewport height, safe-area bottom padding, a wider desktop panel, and 44px controls with 16px input text.
Form columns respond to the drawer's actual width through a scoped container query.
Basic read-only fields remain in two columns.
The shared Drawer adds an optional content class, a wrapping title, a non-shrinking 44px close button, and a bounded scroll area.

`scripts/qa-visa-admin-mobile.cjs` signs in using the existing local E2E administrator reference.
It verifies search, empty results, reset, combined filters, collapsed filter state, sorting, batch-form disclosure, detail scrolling and input geometry at 320, 390, 430, 768 and 1280px.
It only edits an unsaved memo in browser state and never invokes save, invitation, payment or deletion actions.
Screenshots contain applicant information and must remain in local private artifacts, outside commits and pull request attachments.

Run with `QA_BASE_URL`, `QA_OUTPUT` and optionally `QA_BROWSER=webkit`.
`QA_BEFORE=1` captures the existing interface without asserting the new behavior.
The production Vercel environment must only be updated after user approval.

Validation completed against the production build on 2026-09-13:

- Changed-file ESLint, `npm run typecheck`, and `npm run build -- --webpack` passed.
- Chromium and WebKit passed the complete read-only flow at all five widths.
- List, drawer and drawer-content horizontal overflow was zero at every width.
- All 29 detail inputs/selects/textareas were at least 44px tall, used at least 16px text, and stayed within their parent at each width in both browsers.
- No browser page errors occurred.
- Physical-device software keyboard behavior remains outside this desktop browser check.

Use `QA_PLAYWRIGHT_MODULE` to select the installed global Playwright package when its browser cache differs from the repository version.
