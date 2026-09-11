/**
 * 가입 언어 선택 (docs/design-i18n-ui.md §3.9).
 *
 *   (a) 영어 화면에서 가입 폼의 언어 선택(자기 표기 pill)이 보이고 기본값은 현재 언어다.
 *   (b) 日本語 를 고르면 페이지를 다시 불러오지 않고 폼 제목·라벨·버튼이 일본어로 바뀐다(입력값 유지).
 *   (c) 가입을 마치면 온보딩으로 이동하고 <html lang> 과 쿠키가 고른 언어(ja)가 된다.
 *
 * 실행: E2E_BASE_URL=… E2E_SIGNUP_EMAIL=e2e-…+tag@gmail.com npx playwright test e2e/signup-language.spec.ts
 * 계정은 실제로 생성된다(profiles.preferred_lang 은 SQL 로 확인). 비밀번호는 E2E_SIGNUP_PASSWORD(기본 Test1234!e2e).
 */
import { test, expect } from "@playwright/test";

test("signup: 언어 선택이 폼을 즉시 바꾸고 계정·쿠키에 저장된다", async ({ browser, baseURL }) => {
  const email = process.env.E2E_SIGNUP_EMAIL;
  const password = process.env.E2E_SIGNUP_PASSWORD ?? "Test1234!e2e";
  test.skip(!email, "E2E_SIGNUP_EMAIL 미설정");

  const url = new URL(baseURL!);
  const ctx = await browser.newContext({ locale: "en-US", viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: "deetz_lang", value: "en", domain: url.hostname, path: "/" }]);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/signup", { waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  // (a) 언어 선택 pill 3개, 기본값 English
  const enPill = page.getByTestId("signup-lang-en");
  const jaPill = page.getByTestId("signup-lang-ja");
  await expect(enPill).toBeVisible();
  await expect(page.getByTestId("signup-lang-ko")).toBeVisible();
  await expect(jaPill).toBeVisible();
  await expect(enPill.locator("input")).toBeChecked();
  const submit = page.locator('form button[type="submit"]');
  await expect(submit).toHaveText("Sign up");
  await expect(page.locator("h1")).toHaveText("Let's get started");

  // 입력값이 언어 전환 뒤에도 남는지 보려고 먼저 이름을 채운다
  await page.locator('input[name="display_name"]').fill("E2E i18n signup");

  // (b) 日本語 선택 → 즉시 일본어, 페이지 언어(html lang)는 그대로 en
  await jaPill.click();
  await expect(jaPill.locator("input")).toBeChecked();
  await expect(submit).toHaveText("登録する");
  await expect(page.locator("h1")).toHaveText("はじめましょう");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator('input[name="display_name"]')).toHaveValue("E2E i18n signup");

  // (c) 가입
  await page.locator('input[name="phone"]').fill("010-1234-5678");
  await page.locator('input[name="email"]').fill(email!);
  await page.locator('input[name="password"]').fill(password);
  await submit.click();
  await page.waitForURL((u) => u.pathname.startsWith("/onboarding"), { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  const cookies = await ctx.cookies();
  expect(cookies.find((c) => c.name === "deetz_lang")?.value).toBe("ja");
  expect(errors).toEqual([]);
  await ctx.close();
});
