/**
 * 언어 스윕 (docs/design-i18n-ui.md §5.4).
 *
 * 각 화면을 en·ja 로 열어
 *   (a) innerText 와 placeholder·aria-label·alt·title 에 한글 0자 ([data-ugc]·[data-i18n-ignore] 조상 제외)
 *   (b) 기대 언어: <html lang> 과 화면별 대표 문구
 *   (c) 콘솔 오류·pageerror·hydration 경고 0건
 *   (d) 320·390·1280px 스크린샷 저장(사람이 넘침·잘림 검수)
 *
 * 실행: E2E_BASE_URL=http://localhost:3210 E2E_EMAIL=… E2E_PASSWORD=… npm run e2e:i18n
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";

const LOCALES = ["en", "ja"] as const;
type Locale = (typeof LOCALES)[number];
const WIDTHS = [320, 390, 1280] as const;

type Route = {
  path: string;
  /** 로그인 필요 */
  auth?: boolean;
  /** 화면별 대표 문구(기대 언어 확인). 정규식은 innerText 에 대해 검사 */
  expect: Record<Locale, RegExp>;
  /** 이 라우트에서는 한글 검사를 건너뛴다(공고 언어 우선·이용자 작성 글이 대부분인 화면) */
  skipHangul?: boolean;
};

const ROUTES: Route[] = [
  { path: "/", expect: { en: /casting/i, ja: /キャスティング|募集/ } },
  { path: "/login", expect: { en: /log in/i, ja: /ログイン/ } },
  { path: "/signup", expect: { en: /sign up/i, ja: /会員登録/ } },
  { path: "/feed", expect: { en: /casting/i, ja: /募集/ } },
  { path: "/dancers", expect: { en: /dancer/i, ja: /ダンサー/ } },
  { path: "/me", auth: true, expect: { en: /account|profile/i, ja: /アカウント|プロフィール/ } },
  { path: "/me/notifications", auth: true, expect: { en: /notification/i, ja: /通知/ } },
  { path: "/me/password", auth: true, expect: { en: /password/i, ja: /パスワード/ } },
  { path: "/applications", auth: true, expect: { en: /application/i, ja: /応募/ } },
  { path: "/proposals", auth: true, expect: { en: /offer|proposal/i, ja: /オファー|提案/ } },
  { path: "/me/portfolio", auth: true, expect: { en: /portfolio|profile/i, ja: /ポートフォリオ|プロフィール/ } },
  { path: "/me/teams", auth: true, expect: { en: /team/i, ja: /チーム/ } },
  { path: "/visa", expect: { en: /visa/i, ja: /ビザ/ } },
  { path: "/workshops", expect: { en: /workshop/i, ja: /ワークショップ/ } },
  { path: "/village", expect: { en: /village/i, ja: /ビレッジ|Village/ } },
];

const HANGUL = /[가-힣]/;

/** 제외 속성을 가진 조상 안의 텍스트·속성값은 검사에서 뺀다. */
async function collectVisibleText(page: Page): Promise<{ text: string; attrs: string[] }> {
  return page.evaluate(() => {
    const isIgnored = (el: Element | null): boolean => {
      for (let n = el; n; n = n.parentElement) {
        if (n.hasAttribute("data-ugc") || n.hasAttribute("data-i18n-ignore")) return true;
      }
      return false;
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const parts: string[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const el = node.parentElement;
      if (!el || isIgnored(el)) continue;
      const tag = el.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") continue;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      parts.push(node.textContent ?? "");
    }
    const attrs: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll("[placeholder],[aria-label],[alt],[title]"))) {
      if (isIgnored(el)) continue;
      for (const a of ["placeholder", "aria-label", "alt", "title"]) {
        const v = el.getAttribute(a);
        if (v) attrs.push(`${a}=${v}`);
      }
    }
    return { text: parts.join("\n"), attrs };
  });
}

async function login(page: Page) {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) test.skip(true, "E2E_EMAIL/E2E_PASSWORD 미설정");
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email!);
  await page.locator('input[name="password"]').fill(password!);
  // React 19 action 폼: 버튼 클릭이 기본, requestSubmit 은 대체 수단
  const submit = page.locator('form button[type="submit"]').first();
  await submit.click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
}

async function newContext(browser: import("@playwright/test").Browser, locale: Locale, baseURL: string): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    locale: locale === "ja" ? "ja-JP" : "en-US",
    viewport: { width: 1280, height: 900 },
  });
  const url = new URL(baseURL);
  await ctx.addCookies([{ name: "deetz_lang", value: locale, domain: url.hostname, path: "/" }]);
  return ctx;
}

for (const locale of LOCALES) {
  test.describe(`locale=${locale}`, () => {
    let ctx: BrowserContext;
    let page: Page;
    const errors: string[] = [];

    test.beforeAll(async ({ browser, baseURL }) => {
      ctx = await newContext(browser, locale, baseURL!);
      page = await ctx.newPage();
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
        if (/hydrat/i.test(msg.text())) errors.push(`hydration: ${msg.text()}`);
      });
      page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
      if (ROUTES.some((r) => r.auth) && process.env.E2E_EMAIL) {
        await login(page);
        // 로그인 액션이 계정에 저장된 언어(profiles.preferred_lang)를 쿠키로 복사하므로(설계 §3.9),
        // 검사 대상 언어로 쿠키를 다시 고정한다.
        const url = new URL(baseURL!);
        await ctx.addCookies([{ name: "deetz_lang", value: locale, domain: url.hostname, path: "/" }]);
      }
    });

    test.afterAll(async () => {
      await ctx?.close();
    });

    for (const route of ROUTES) {
      test(`${route.path}`, async () => {
        if (route.auth && !process.env.E2E_EMAIL) test.skip(true, "로그인 계정 미설정");
        errors.length = 0;
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto(route.path, { waitUntil: "networkidle" });
        await page.waitForTimeout(300);

        // (b) 기대 언어
        expect(await page.getAttribute("html", "lang"), `${route.path} html lang`).toBe(locale);
        const { text, attrs } = await collectVisibleText(page);
        expect(text, `${route.path} 대표 문구(${locale})`).toMatch(route.expect[locale]);

        // (a) 한글 누출
        if (!route.skipHangul) {
          // "한국어" 는 언어의 자기 표기라 모든 언어에서 그대로 보인다(전역 전환기는 data-i18n-ignore,
          // 기존 기능 랜딩의 자체 토글은 표시 그대로). 그 한 단어만 있는 줄은 누출로 보지 않는다.
          const leakedLines = text
            .split("\n")
            .filter((l) => HANGUL.test(l) && l.trim() !== "한국어")
            .slice(0, 20);
          expect(leakedLines, `${route.path} 한글 누출(text)`).toEqual([]);
          const leakedAttrs = attrs.filter((a) => HANGUL.test(a)).slice(0, 20);
          expect(leakedAttrs, `${route.path} 한글 누출(attrs)`).toEqual([]);
        }

        // (d) 스크린샷 3폭
        for (const w of WIDTHS) {
          await page.setViewportSize({ width: w, height: w < 500 ? 844 : 900 });
          await page.waitForTimeout(150);
          await page.screenshot({
            path: `e2e/screenshots/${locale}/${w}${route.path.replace(/\//g, "_") || "_home"}.png`,
            fullPage: true,
          });
        }

        // (c) 오류 0건
        const relevant = errors.filter((e) => !/favicon|third-party|net::ERR_ABORTED|Failed to load resource/i.test(e));
        expect(relevant, `${route.path} 콘솔·페이지 오류`).toEqual([]);
      });
    }

    test("language switch → cookie·redirect·new language", async () => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto("/feed?lang=ko", { waitUntil: "networkidle" });
      // ?lang=ko 가 쿠키·언어를 ko 로 바꾼다
      expect(await page.getAttribute("html", "lang")).toBe("ko");
      // 전환기로 다시 locale 로: 사이드바(데스크톱)의 그룹 버튼
      const btn = page.locator(`[role="group"][data-i18n-ignore] button[lang="${locale}"]`).first();
      await btn.click();
      await page.waitForFunction((l) => document.documentElement.lang === l, locale, { timeout: 15_000 });
      expect(new URL(page.url()).searchParams.get("lang")).toBeNull();
      const cookies = await ctx.cookies();
      expect(cookies.find((c) => c.name === "deetz_lang")?.value).toBe(locale);
      await page.reload({ waitUntil: "networkidle" });
      expect(await page.getAttribute("html", "lang")).toBe(locale);
    });
  });
}
