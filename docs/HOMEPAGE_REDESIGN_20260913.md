# Homepage redesign — 2026-09-13

Scope: the public `/` landing page.
The user rejected the beige/orange palette, decorative hero icons and repeated card styling.

The replacement uses white, neutral gray and black; the official DeetzLogo; a wide monochrome treatment of the existing performance image; and larger sans-serif headings.
The hero separates its headline from a short introduction and two direct destinations: dancer discovery and casting calls.
The image links to its existing source video.
No generated image or invented endorsement is introduced.

The rest of the page has separate client/dancer paths, a single dark section describing project types, a program entry for international dancers, line-based FAQ disclosures, and contact/legal links.
Decorative icon tiles, gradient overlays, pill badges and the application tab bar were removed from this landing page.
All primary destinations remain reachable through the header, content and footer.

`src/app/page.tsx` retains the existing count loader, metadata and Service/FAQ structured data.
`src/components/landing/HomeLanding.tsx` owns the server-rendered presentation, and `home-landing.module.css` contains styles scoped to this page.
`src/lib/i18n/messages/landing.ts` supplies Korean, English and Japanese copy and accessibility labels.
Counts now show the returned exact numbers, with an em dash when unavailable instead of invented fallback totals.

The read-only browser script `scripts/qa-homepage-redesign.cjs` checks 320/390/768/1440px in all three languages, loaded hero imagery, overflow, FAQ disclosure, destination links, structured data, language persistence, dancer navigation and the authentication redirect for posting a casting call.
It supports Chromium and WebKit through the installed global Playwright runtime (`QA_PLAYWRIGHT_MODULE`), `QA_BASE_URL` and `QA_OUTPUT`.
`QA_BEFORE=1` captures the old homepage for comparison.
Use HTTPS when checking production-build language persistence in WebKit: the locale action sets a Secure cookie, which WebKit stores but does not send over local HTTP.
For an isolated localhost HTTPS proxy with a self-signed certificate, set `QA_SELF_SIGNED_HTTPS=1`; this only changes the test browser's certificate handling.

Validation: production build (`next build --webpack`), TypeScript, changed-file ESLint and all seven i18n tests passed.
Browser evidence is stored outside the repository at `Desktop/deliverables/deetz-homepage-redesign/final`.
Chromium passed all checks with no page errors.
WebKit passed all 12 layout cases and interaction assertions over local HTTPS, but the combined run reports access-control errors from RSC prefetch requests through the self-signed proxy.
An isolated WebKit language-switch/reload and primary-navigation run passed without page errors.
The remaining combined-run proxy/browser error is a validation limitation; do not describe the full WebKit suite as passing.

This homepage change requires separate production approval after review.
The administrator mobile fix was already deployed separately through PR #244.
