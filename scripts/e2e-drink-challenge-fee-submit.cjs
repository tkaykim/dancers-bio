const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");

const SITE_URL = process.env.E2E_SITE_URL || "https://www.deetz.kr";
const PROJECT_SHORT_CODE = process.env.E2E_PROJECT_SHORT_CODE || "qhb5xc";
const PROJECT_ID = process.env.E2E_PROJECT_ID || "443e791a-327e-4556-b632-b8f87e9d5559";
const TEST_EMAIL = process.env.E2E_EMAIL || "e2e-deetz-metest@gmail.com";
const TEST_PASSWORD = process.env.E2E_PASSWORD || "Test1234!e2e";
const TEST_USER_ID = process.env.E2E_USER_ID || "425b7e89-8cfe-4044-ad61-ed515d7463d9";
const TEST_DISPLAY_NAME = "E2E테스트";
const TEST_STAGE_NAME = `Deetz E2E Fee ${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
const TEST_FEE = 350000;
const TEST_FEE_UNIT = "건당";
const TEST_COVER = "공개모집 단가 제출 E2E 테스트입니다.";

const outputDir = path.resolve(__dirname, "..", "..", "..", "outputs");
const screenshots = {
  feeForm: path.join(outputDir, "deetz-e2e-fee-form.png"),
  submitted: path.join(outputDir, "deetz-e2e-fee-submitted.png"),
  withdrawn: path.join(outputDir, "deetz-e2e-fee-withdrawn.png"),
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(__dirname, "..", ".env.local"));
loadEnvFile("C:/Users/tkay/Desktop/dev/dancers-bio/.env.local");

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

const admin = createClient(
  requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function getKnownTestUser() {
  const { data, error } = await admin.auth.admin.getUserById(TEST_USER_ID);
  if (!error && data?.user?.email?.toLowerCase() === TEST_EMAIL.toLowerCase()) {
    return data.user;
  }
  if (error && !String(error.message || "").toLowerCase().includes("not found")) {
    throw error;
  }
  return null;
}

async function ensureTestUser() {
  let user = await getKnownTestUser();
  let createdUser = false;
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: TEST_DISPLAY_NAME, phone: "010-0000-0000" },
    });
    if (error) throw error;
    user = data.user;
    createdUser = true;
  } else {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: {
        ...(user.user_metadata || {}),
        display_name: user.user_metadata?.display_name || TEST_DISPLAY_NAME,
      },
    });
    if (error) throw error;
    user = data.user;
  }

  const { data: profile, error: profileFetchError } = await admin
    .from("profiles")
    .select("id, display_name, phone")
    .eq("id", user.id)
    .maybeSingle();
  if (profileFetchError) throw profileFetchError;
  if (!profile) {
    const { error } = await admin.from("profiles").insert({
      id: user.id,
      display_name: TEST_DISPLAY_NAME,
      phone: "010-0000-0000",
    });
    if (error) throw error;
  }

  return { user, createdUser };
}

async function getProject() {
  const { data, error } = await admin
    .from("projects")
    .select("id, short_code, title, status, visibility, collect_applicant_fee")
    .eq("id", PROJECT_ID)
    .single();
  if (error) throw error;
  return data;
}

async function getOwnDancer(userId) {
  const { data, error } = await admin
    .from("dancers")
    .select("id, stage_name, slug, profile_id, is_active, approval_status, created_at")
    .eq("profile_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

async function getLatestApplication(userId) {
  const { data, error } = await admin
    .from("applications")
    .select(
      "id, project_id, applicant_id, dancer_id, status, cover_message, proposed_fee, proposed_fee_currency, proposed_fee_unit, fee_status, recruitment_channel_id, created_at, responded_at",
    )
    .eq("project_id", PROJECT_ID)
    .eq("applicant_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

async function withdrawActiveSetupApplications(userId) {
  const { data, error } = await admin
    .from("applications")
    .select("id, status")
    .eq("project_id", PROJECT_ID)
    .eq("applicant_id", userId)
    .is("archived_at", null)
    .in("status", ["pending", "accepted"]);
  if (error) throw error;
  if (!data || data.length === 0) return [];
  const ids = data.map((row) => row.id);
  const { error: updateError } = await admin
    .from("applications")
    .update({ status: "withdrawn", responded_at: new Date().toISOString() })
    .in("id", ids);
  if (updateError) throw updateError;
  return data;
}

async function pollApplication(userId, predicate, label, timeoutMs = 20000) {
  const started = Date.now();
  let latest = null;
  while (Date.now() - started < timeoutMs) {
    latest = await getLatestApplication(userId);
    if (latest && predicate(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error(`Timed out waiting for application: ${label}. Latest=${JSON.stringify(latest)}`);
}

async function clickButtonByName(page, name) {
  await page.getByRole("button", { name }).click();
}

async function maybeCreateDancerViaUi(page) {
  const before = await getOwnDancer(globalState.user.id);
  if (before) return { created: false, dancer: before };

  await page.getByRole("link", { name: /댄서 프로필 만들기/ }).click();
  await page.waitForURL(/\/me\/portfolio\/add/);
  await page.getByRole("link", { name: /시작하기/ }).click();
  await page.waitForURL(/\/me\/portfolio\/add\/search/);
  await page.getByRole("button", { name: /바로 새로 만들기|새로 만들기/ }).click();
  await page.waitForURL(/\/onboarding\/create/);

  await page.locator('input[placeholder="예: Hong Gil Dong"]').fill(TEST_STAGE_NAME);
  await page.locator('input[placeholder="예: Seoul"]').fill("Seoul");
  await page.locator('input[placeholder="키 (cm)"]').fill("170");
  await page.locator('input[placeholder="신발 (mm)"]').fill("260");
  await clickButtonByName(page, "다음");
  await clickButtonByName(page, "다음");
  await clickButtonByName(page, "다음");
  await clickButtonByName(page, "다음");
  await clickButtonByName(page, "다음");
  await page.locator("textarea").fill("deetz 운영 E2E 검증용 테스트 프로필입니다.");
  await page.getByRole("button", { name: "프로필 생성 완료" }).click();
  await page.waitForURL(new RegExp(`/projects/${PROJECT_SHORT_CODE}`), { timeout: 30000 });

  const dancer = await pollDancer(globalState.user.id);
  return { created: true, dancer };
}

async function pollDancer(userId, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const dancer = await getOwnDancer(userId);
    if (dancer) return dancer;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error("Timed out waiting for dancer profile");
}

async function assertNoNewActiveApplicationAfterBlankSubmit(userId, blankStartedAtIso) {
  const { data, error } = await admin
    .from("applications")
    .select("id, status, created_at, proposed_fee")
    .eq("project_id", PROJECT_ID)
    .eq("applicant_id", userId)
    .is("archived_at", null)
    .gte("created_at", blankStartedAtIso)
    .in("status", ["pending", "accepted"]);
  if (error) throw error;
  if (data && data.length > 0) {
    throw new Error(`Blank fee submit created an active application: ${JSON.stringify(data)}`);
  }
}

async function runUiFlow() {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    locale: "ko-KR",
  });
  const page = await context.newPage();
  const consoleMessages = [];
  const dialogMessages = [];
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) {
      consoleMessages.push(`${msg.type()}: ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    consoleMessages.push(`pageerror: ${err.message}`);
  });
  page.on("dialog", async (dialog) => {
    dialogMessages.push(`${dialog.type()}: ${dialog.message()}`);
    await dialog.accept();
  });

  const applyPath = `/projects/${PROJECT_SHORT_CODE}?apply=1`;
  await page.goto(`${SITE_URL}/login?redirect=${encodeURIComponent(applyPath)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByLabel("이메일").fill(TEST_EMAIL);
  await page.getByLabel("비밀번호").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(new RegExp(`/projects/${PROJECT_SHORT_CODE}`), { timeout: 30000 });
  await page.waitForLoadState("domcontentloaded");

  const dancerResult = await maybeCreateDancerViaUi(page);
  await page.goto(`${SITE_URL}${applyPath}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('text=제안 단가 (필수)', { timeout: 20000 });
  await page.screenshot({ path: screenshots.feeForm, fullPage: true });

  const feeInput = page.locator('input[placeholder="예: 1,500,000"]').first();
  const blankStartedAtIso = new Date().toISOString();
  await page.getByRole("button", { name: "지원하기" }).click();
  const feeInputMissing = await feeInput.evaluate((input) => {
    return input.validity.valueMissing || input.validationMessage.length > 0;
  });
  if (!feeInputMissing) {
    const errorVisible = await page.getByText("러프한 금액이라도 제안 단가를 입력해 주세요.").isVisible().catch(() => false);
    if (!errorVisible) throw new Error("Blank fee submit did not trigger required validation");
  }
  await assertNoNewActiveApplicationAfterBlankSubmit(globalState.user.id, blankStartedAtIso);

  await page.locator('textarea[name="cover_message"]').fill(TEST_COVER);
  await page.getByLabel("통화").selectOption("KRW");
  await feeInput.fill(String(TEST_FEE));
  await page.getByLabel("단위").selectOption(TEST_FEE_UNIT);
  await page.getByLabel(/세부 조건은 협의 가능합니다/).check();
  await page.getByRole("button", { name: "지원하기" }).click();

  const submitted = await pollApplication(
    globalState.user.id,
    (app) =>
      app.status === "pending" &&
      app.proposed_fee === TEST_FEE &&
      app.proposed_fee_unit === TEST_FEE_UNIT &&
      app.fee_status === "negotiable",
    "pending quoted/negotiable application",
    30000,
  );
  await page.screenshot({ path: screenshots.submitted, fullPage: true });

  await page.goto(`${SITE_URL}/applications`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.getByRole("heading", { name: "내 지원" }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);
  const row = page.locator("li").filter({ hasText: "[대외비] 음료 브랜드 댄스챌린지 참여 댄서 모집" }).first();
  await row.waitFor({ timeout: 20000 });
  await row.getByRole("button", { name: "지원 취소" }).click();

  const withdrawn = await pollApplication(
    globalState.user.id,
    (app) => app.id === submitted.id && app.status === "withdrawn",
    "withdrawn application",
    45000,
  );
  await page.screenshot({ path: screenshots.withdrawn, fullPage: true });
  await browser.close();

  return {
    dancerResult,
    submitted,
    withdrawn,
    dialogMessages,
    consoleMessages: consoleMessages.slice(-20),
  };
}

const globalState = {};

(async () => {
  const project = await getProject();
  if (project.short_code !== PROJECT_SHORT_CODE) {
    throw new Error(`Project short code mismatch: ${project.short_code}`);
  }
  if (project.status !== "open" || project.visibility !== "public") {
    throw new Error(`Project is not public/open: ${project.status}/${project.visibility}`);
  }
  if (!project.collect_applicant_fee) {
    throw new Error("Project does not collect applicant fee");
  }

  const userResult = await ensureTestUser();
  globalState.user = userResult.user;
  const setupWithdrawn = await withdrawActiveSetupApplications(userResult.user.id);
  const initialDancer = await getOwnDancer(userResult.user.id);
  const flow = await runUiFlow();

  const result = {
    ok: true,
    siteUrl: SITE_URL,
    project,
    testUser: {
      id: userResult.user.id,
      email: TEST_EMAIL,
      createdUser: userResult.createdUser,
    },
    setupWithdrawn,
    initialDancer,
    dancer: flow.dancerResult.dancer,
    dancerCreatedViaUi: flow.dancerResult.created,
    blankFeeValidationPassed: true,
    submitted: flow.submitted,
    withdrawn: flow.withdrawn,
    screenshots,
    consoleMessages: flow.consoleMessages,
  };
  console.log(JSON.stringify(result, null, 2));
})().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
