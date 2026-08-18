/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("playwright");
const path = require("node:path");
const os = require("node:os");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

(async () => {
  const baseUrl = process.env.QA_BASE_URL ?? "http://127.0.0.1:3310";
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto(`${baseUrl}/signup`, { waitUntil: "networkidle" });
  await page.getByText("Mobile number", { exact: false }).first().waitFor();

  const country = page.locator("select[name=phone_country]");
  const phone = page.locator('input[name=phone]:not([type="hidden"])');
  const unavailable = page.locator("input[name=phone_unavailable]");

  assert((await country.locator("option").count()) > 200, "country list is incomplete");

  await country.selectOption("US");
  await phone.fill("(415) 555-2671");
  await phone.blur();
  await page.getByText("Valid phone number.", { exact: false }).waitFor();

  await unavailable.check();
  assert(await phone.isDisabled(), "phone input should be disabled when unavailable");
  await page.getByText("We'll contact you by email.", { exact: false }).waitFor();

  await unavailable.uncheck();
  await country.selectOption("KR");
  await phone.fill("010-123");
  await phone.blur();
  await page.getByText("Enter a valid mobile number.", { exact: false }).waitFor();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  assert(overflow <= 0, `mobile horizontal overflow: ${overflow}px`);
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(" | ")}`);

  await page.reload({ waitUntil: "networkidle" });
  const screenshot = path.join(os.tmpdir(), "deetz-signup-international-phone.png");
  await page.screenshot({ path: screenshot, fullPage: true, caret: "initial" });
  console.log(JSON.stringify({ screenshot, countryOptions: await country.locator("option").count(), overflow }));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
