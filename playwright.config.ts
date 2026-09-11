import { defineConfig, devices } from "@playwright/test";

/**
 * 언어 스윕 E2E (docs/design-i18n-ui.md §5.4).
 *   E2E_BASE_URL   대상 서버 (기본 http://localhost:3210 — `npm run dev -- -p 3210`)
 *   E2E_EMAIL / E2E_PASSWORD   로그인 필요 화면용 테스트 계정 (운영 DB 의 E2E 계정, 커밋 금지)
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/report" }]],
  outputDir: "e2e/results",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3210",
    trace: "retain-on-failure",
    screenshot: "off",
    video: "off",
    ...devices["Desktop Chrome"],
  },
});
