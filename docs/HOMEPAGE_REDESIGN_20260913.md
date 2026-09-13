# Homepage redesign — 2026-09-13

Scope: the public `/` landing page.
The user rejected the beige/orange palette, decorative hero icons and repeated card styling.

The replacement uses white, neutral gray and black for the interface; the official DeetzLogo; a wide crop of the existing performance image in its original colors; and larger sans-serif headings.
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

The homepage change required separate production approval after review; the user authorized the production deployment on 2026-09-13.
The administrator mobile fix was already deployed separately through PR #244; the homepage deploy is handled through PR #245.

Copy review update: the user rejected “사람이 만드는 다음 무대” as translation-like, generic AI copy and requested headline candidates before choosing a replacement.
Keep media in its original colors; the neutral interface palette does not require grayscale media.
The user selected “댄서 섭외부터 안무 제작까지.” with the supporting sentence “뮤직비디오, 광고, 공연에 필요한 댄서와 안무가들의 프로필을 보고 작업에 맞는 사람을 찾으세요.”
The Korean copy now matches that selection, with English and Japanese conveying the same service scope.
The copy/color update passed all seven i18n tests, changed-file ESLint and the Chromium browser script's 12 viewport/language cases and navigation checks on the local dev server, with no overflow or page errors.
Updated screenshots are in `Desktop/deliverables/deetz-homepage-redesign/selected-copy`.

Follow-up: the homepage now shows cumulative public casting calls (`visibility=public`, status `open` or `closed`, `deleted_at IS NULL`) as “누적 공고” / “Total casting calls” / “累計募集件数”.
Drafts, cancellations, deleted records and private projects are excluded.
A read-only production count on 2026-09-13 returned 28: 7 open-status records and 21 closed records.
Three of the seven open-status records already passed their deadline under the existing KST deadline utility, so the old “open calls” total overstated currently available public calls.
The cumulative cache uses a new key while retaining the existing invalidation tag and 600-second refresh.

The international-dancer program link deliberately uses English in every landing locale, has `lang=en`, and routes to `/program?lang=en`.
Follow-up validation: TypeScript, changed-file ESLint, seven i18n tests and Chromium's 12 language/viewport cases and interactions passed.
Evidence: `Desktop/deliverables/deetz-homepage-redesign/cumulative-program`.
