// Local-only browser integration test. Auth/REST are a fixture adapter; SQL and app actions are real.
// No production credentials, network mutations, or persistent accounts are used.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const output = path.resolve(
  process.env.CAMPAIGN_QA_OUTPUT || path.join(root, ".qa-campaign-submissions"),
);
const origin = "http://127.0.0.1:3397",
  dbOrigin = "http://127.0.0.1:3398";
let browser, next, server, pg;
const failures = [];
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const { createTestDb, ids, mutate } =
    await import("./campaign-submissions-test-db.mjs");
  pg = await createTestDb();
  await mutate(pg, ids.admin, "configure", {
    version: 0,
    enabled: true,
    board_id: ids.board,
    deadline: "2026-09-13T14:59:00Z",
    client_visible: false,
  });
  await mutate(pg, ids.admin, "sync", {});
  await pg.query("select campaign_budget_mutate($1,$2,'configure',$3)",[ids.project,ids.admin,JSON.stringify({version:0,total_amount:88000000,operations_reserve:100000,basis:"QA 예산 근거"})]);
  const people = (await pg.query("select * from campaign_participants")).rows;
  const riwoo = people.find((p) => p.dancer_id === ids.dancer),
    external = people.find((p) => !p.dancer_id);
  await mutate(pg, ids.admin, "submit", {
    participant_id: riwoo.id,
    url: "https://www.instagram.com/reel/Dc-2MpLTvXV/",
    short_code: "Dc-2MpLTvXV",
  });
  const tables = new Set(
    (
      await pg.query(
        "select table_name from information_schema.tables where table_schema='public'",
      )
    ).rows.map((r) => r.table_name),
  );
  function tokenUser(req) {
    try {
      return JSON.parse(
        Buffer.from(
          (req.headers.authorization || "").split(" ")[1].split(".")[1],
          "base64url",
        ),
      ).sub;
    } catch {
      return null;
    }
  }
  server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") {
      res.end();
      return;
    }
    const url = new URL(req.url, dbOrigin),
      actor = tokenUser(req);
    const send = (value, status = 200) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(value));
    };
    try {
      if (url.pathname === "/auth/v1/user") {
        if (!actor) return send({ message: "not logged in" }, 401);
        return send({
          id: actor,
          aud: "authenticated",
          role: "authenticated",
          email: "fixture@example.invalid",
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        });
      }
      let body = "";
      for await (const chunk of req) body += chunk;
      const input = body ? JSON.parse(body) : {};
      if (url.pathname === "/auth/v1/token") {
        const id = input.refresh_token;
        if (![ids.admin, ids.member, ids.other, ids.manager].includes(id))
          return send(
            { error: "invalid_grant", message: "unknown fixture" },
            400,
          );
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const access_token =
          Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
            "base64url",
          ) +
          "." +
          Buffer.from(
            JSON.stringify({
              sub: id,
              exp,
              aud: "authenticated",
              role: "authenticated",
            }),
          ).toString("base64url") +
          ".localfixture";
        return send({
          access_token,
          refresh_token: id,
          expires_in: 3600,
          expires_at: exp,
          token_type: "bearer",
          user: {
            id,
            aud: "authenticated",
            role: "authenticated",
            app_metadata: {},
            user_metadata: {},
          },
        });
      }
      const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
      if (rpc) {
        if(rpc[1] === "campaign_budget_mutate") return send((await pg.query("select campaign_budget_mutate($1,$2,$3,$4) as result",[input.p_project,input.p_actor,input.p_action,JSON.stringify(input.p_data)])).rows[0].result);
        if (rpc[1] === "can_manage_project")
          return send(
            actor === ids.admin ||
              (actor === ids.manager && input.p_id === ids.project),
          );
        if (rpc[1] === "campaign_submission_mutate")
          return send(
            await mutate(
              pg,
              input.p_actor,
              input.p_action,
              input.p_data,
              input.p_project,
            ),
          );
        return send(null);
      }
      const table = url.pathname.match(/^\/rest\/v1\/(\w+)$/)?.[1];
      const single = (req.headers.accept || "").includes("vnd.pgrst.object");
      if (!table || !tables.has(table)) return send(single ? null : []);
      if (req.method !== "GET" && req.method !== "HEAD")
        return send({ message: "unhandled mutation" }, 400);
      const columns = new Set(
        (
          await pg.query(
            "select column_name from information_schema.columns where table_schema=$1 and table_name=$2",
            ["public", table],
          )
        ).rows.map((r) => r.column_name),
      );
      const where = [],
        values = [];
      for (const [key, value] of url.searchParams) {
        if (!columns.has(key)) continue;
        const match = value.match(
          /^(not\.)?(eq|neq|is|in|ilike|gt|gte|lt|lte)\.(.*)$/,
        );
        if (!match) continue;
        const [, not, op, raw] = match;
        if (op === "is" && raw === "null") {
          where.push(`"${key}" is ${not ? "not " : ""}null`);
          continue;
        }
        if (op === "in") {
          const list = raw
            .slice(1, -1)
            .split(",")
            .map((x) => x.replace(/^"|"$/g, ""));
          const placeholders = list.map((x) => {
            values.push(x);
            return "$" + values.length;
          });
          where.push(
            `"${key}" ${not ? "not " : ""}in (${placeholders.join(",")})`,
          );
          continue;
        }
        values.push(raw);
        const operator = {
          eq: "=",
          neq: "<>",
          ilike: "ilike",
          is: "=",
          gt: ">",
          gte: ">=",
          lt: "<",
          lte: "<=",
        }[op];
        where.push(
          `${not ? "not " : ""}("${key}" ${operator} $${values.length})`,
        );
      }
      let sql = `select * from "${table}"${where.length ? " where " + where.join(" and ") : ""}`;
      const order = url.searchParams.get("order")?.split(".")[0];
      if (order && columns.has(order))
        sql += ` order by "${order}" ${url.searchParams.get("order").includes(".desc") ? "desc" : "asc"}`;
      sql += ` limit ${Math.min(1000, Number(url.searchParams.get("limit")) || 1000)} offset ${Number(url.searchParams.get("offset")) || 0}`;
      let rows = (await pg.query(sql, values)).rows;
      if (table === "casting_boards")
        rows = rows.map((r) => ({
          ...r,
          casting_board_members: [{ count: 2 }],
        }));
      return send(single ? (rows[0] ?? null) : rows);
    } catch (e) {
      return send({ message: e.message, code: e.code || "XX000" }, 400);
    }
  });
  await new Promise((resolve) => server.listen(3398, "127.0.0.1", resolve));
  const log = fs.openSync(path.join(output, "next.log"), "w");
  next = spawn(
    process.execPath,
    [
      path.join(root, "node_modules/next/dist/bin/next"),
      "dev",
      "--webpack",
      "-p",
      "3397",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: dbOrigin,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "local-service-key",
        NEXT_PUBLIC_SITE_URL: origin,
        NEXT_PUBLIC_MESSAGING_ENABLED: "false",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", log, log],
      windowsHide: true,
    },
  );
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(origin + "/icon-192.png");
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch();
  async function context(user, width = 1440) {
    const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
    ctx.on("console", message => {
      if (message.type() === "error" && /hydrat|didn't match/i.test(message.text())) failures.push(message.text());
    });
    await ctx.route("**/*", (route) => {
      const u = new URL(route.request().url());
      return ["127.0.0.1", "localhost"].includes(u.hostname)
        ? route.continue()
        : route.abort();
    });
    if (user) {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const token =
        Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
          "base64url",
        ) +
        "." +
        Buffer.from(
          JSON.stringify({
            sub: user,
            exp,
            aud: "authenticated",
            role: "authenticated",
          }),
        ).toString("base64url") +
        ".localfixture";
      const session = {
        access_token: token,
        refresh_token: user,
        expires_in: 3600,
        expires_at: exp,
        token_type: "bearer",
        user: {
          id: user,
          aud: "authenticated",
          role: "authenticated",
          app_metadata: {},
          user_metadata: {},
        },
      };
      await ctx.addCookies([
        {
          name: "sb-127-auth-token",
          value:
            "base64-" +
            Buffer.from(JSON.stringify(session)).toString("base64url"),
          url: origin,
        },
      ]);
    }
    return ctx;
  }
  const admin = await context(ids.admin),
    page = await admin.newPage();
  page.on("pageerror", (e) => failures.push(e.message));
  await page.goto(`${origin}/tools/campaigns/${ids.project}?tab=submissions`, {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await page.getByRole("heading", { name: "제출 현황", exact: true }).waitFor();
  assert.match(await page.locator("body").innerText(), /확정 참여 2명/);
  await page.screenshot({
    path: path.join(output, "admin-desktop.png"),
    fullPage: true, caret: "initial",
  });
  await page.getByRole("button", { name: "미제출 1", exact: true }).click();
  assert.equal(await page.getByRole("table").getByRole("row").count(), 2);
  await page.getByRole("button", { name: "대신 등록", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Instagram 게시물 링크")
    .fill("https://www.instagram.com/reel/Dc-VMVeyzqt/");
  await dialog.getByRole("button", { name: "링크 제출", exact: true }).click();
  await dialog.locator("p").filter({ hasText: "관리자 등록" }).waitFor();
  await dialog.getByRole("button", { name: "확인 완료", exact: true }).click();
  await dialog
    .getByText("공개 접근, 참여 계정, 제작 조건을 확인해 주세요.")
    .waitFor();
  await dialog.getByLabel("공개 상태와 게시물 접근을 확인했습니다.").check();
  await dialog
    .getByLabel("본인 계정 또는 공동작업 참여를 확인했습니다.")
    .check();
  await dialog
    .getByLabel("음원·태그 등 전달한 제작 조건을 확인했습니다.")
    .check();
  await dialog.getByRole("button", { name: "확인 완료", exact: true }).click();
  await dialog.getByText("저장했습니다.", { exact: true }).waitFor();
  assert.equal(
    (
      await pg.query(
        "select status from campaign_submissions where participant_id=$1",
        [external.id],
      )
    ).rows[0].status,
    "approved",
  );
  await page.screenshot({
    path: path.join(output, "admin-review.png"),
    fullPage: true, caret: "initial",
  });
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "전체 2", exact: true }).click();
  await page.getByRole("button", { name: "리우", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("참여자에게 보이는 수정 사유")
    .fill("캡션에 필수 태그를 추가해 주세요.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "수정 요청", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByText("저장했습니다.", { exact: true })
    .waitFor();
  const member = await context(ids.member, 390),
    mine = await member.newPage();
  mine.on("pageerror", (e) => failures.push(e.message));
  await mine.goto(`${origin}/campaigns/${ids.project}/submit`, {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await mine
    .getByRole("heading", { name: "게시물 링크 제출", exact: true })
    .waitFor();
  assert.match(await mine.locator("body").innerText(), /캡션에 필수 태그/);
  assert.ok(
    !(await mine.locator("body").innerText()).includes("external_creator"),
  );
  await mine.screenshot({
    path: path.join(output, "member-mobile-correction.png"),
    fullPage: true, caret: "initial",
  });
  await mine
    .getByRole("button", { name: "수정·재검토 요청", exact: true })
    .click();
  await mine.getByText("링크가 제출되었습니다.", { exact: false }).waitFor();
  assert.equal(
    (
      await pg.query(
        "select status from campaign_submissions where participant_id=$1 and replaced_at is null",
        [riwoo.id],
      )
    ).rows[0].status,
    "pending_review",
  );
  await mine.waitForLoadState("networkidle");
  await mine.getByText("리우 · 검토 대기", { exact: true }).waitFor();
  await mine.getByRole("button", { name: "저장 중…", exact: true }).waitFor({ state: "hidden" });
  await mine.getByRole("status").filter({ hasText: "링크가 제출되었습니다." }).waitFor();
  await mine.screenshot({
    path: path.join(output, "member-mobile-submitted.png"),
    fullPage: true, caret: "initial",
  });
  assert.equal(
    await mine.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  const stranger = await context(ids.other),
    denied = await stranger.newPage();
  const deniedResponse = await denied.goto(
    `${origin}/campaigns/${ids.project}/submit`,
    { waitUntil: "networkidle" },
  );
  assert.equal(deniedResponse.status(), 404);
  const anon = await context(null),
    login = await anon.newPage();
  await login.goto(`${origin}/campaigns/${ids.project}/submit`, {
    waitUntil: "networkidle",
  });
  assert.ok(login.url().includes("/login?next="));
  const progressPage = await admin.newPage();
  progressPage.on("pageerror", e => failures.push(e.message));
  await progressPage.goto(`${origin}/tools/campaigns/${ids.project}?tab=submissions`, { waitUntil: "networkidle" });
  await progressPage
    .getByRole("button", { name: "클라이언트 보기 미리보기", exact: true })
    .click();
  const preview = progressPage.getByRole("region", { name: "업로드 현황" });
  await preview.waitFor();
  assert.equal(await preview.getByRole("link").count(), 1);
  await progressPage.screenshot({
    path: path.join(output, "client-progress-preview.png"),
    fullPage: true, caret: "initial",
  });
  await progressPage.setViewportSize({ width: 390, height: 844 });
  await progressPage.screenshot({
    path: path.join(output, "admin-mobile.png"),
    fullPage: true, caret: "initial",
  });
  assert.equal(
    await progressPage.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  const cfg = (await pg.query("select * from campaign_submission_settings where project_id=$1", [ids.project])).rows[0];
  await mutate(pg, ids.admin, "configure", { ...cfg, client_visible: true });
  const shared = await anon.newPage();
  shared.on("pageerror", e => failures.push(e.message));
  await shared.goto(`${origin}/cast/fixture`, { waitUntil: "networkidle", timeout: 120000 });
  await shared.getByRole("button", { name: "업로드 현황 1/2", exact: true }).click();
  const sharedUploads = shared.getByRole("region", { name: "업로드 현황" });
  await sharedUploads.waitFor();
  assert.equal(await sharedUploads.getByRole("link").count(), 1);
  assert.ok(!(await shared.content()).includes("Dc-2MpLTvXV"));
  assert.ok(!(await shared.content()).includes("캡션에 필수 태그"));
  await shared.screenshot({ path: path.join(output, "client-board-uploads.png"), fullPage: true, caret: "initial" });
  await mutate(pg, ids.admin, "configure", { ...cfg, version: cfg.version + 1, client_visible: false });
  await shared.reload({ waitUntil: "networkidle" });
  assert.equal(await shared.getByRole("button", { name: /업로드 현황/ }).count(), 0);
  assert.ok(!(await shared.content()).includes("QA 예산 근거"));
  const budgetPage=await admin.newPage();
  budgetPage.on("pageerror",e=>failures.push(e.message));
  await budgetPage.goto(`${origin}/tools/campaigns/${ids.project}?tab=budget`,{waitUntil:"networkidle"});
  await budgetPage.getByRole("heading",{name:"예산 소요 현황",exact:true}).waitFor();
  const feeRow=budgetPage.getByRole("row").filter({hasText:"리우"});
  await feeRow.getByRole("button",{name:"금액 입력",exact:true}).click();
  const feeDialog=budgetPage.getByRole("dialog");
  await feeDialog.getByLabel("예상 총지출 (원)").fill("200000");
  await feeDialog.getByLabel("금액 상태").selectOption("agreed");
  await feeDialog.getByLabel("확인 근거·변경 사유").fill("QA 테스트 합의");
  await feeDialog.getByRole("button",{name:"금액 저장",exact:true}).click();
  await feeRow.getByText("합의 완료",{exact:true}).waitFor();
  assert.equal((await pg.query("select amount from campaign_budget_fees where participant_id=$1",[riwoo.id])).rows[0].amount,200000);
  await budgetPage.screenshot({path:path.join(output,"budget-desktop.png"),fullPage:true,caret:"initial"});
  await budgetPage.setViewportSize({width:390,height:844});
  assert.equal(await budgetPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await budgetPage.screenshot({path:path.join(output,"budget-mobile.png"),fullPage:true,caret:"initial"});
  const managerContext=await context(ids.manager),managerPage=await managerContext.newPage();
  await managerPage.goto(`${origin}/tools/campaigns/${ids.project}?tab=submissions`,{waitUntil:"networkidle"});
  assert.equal(await managerPage.getByRole("link",{name:"예산",exact:true}).count(),0);
  assert.ok(!(await managerPage.content()).includes("QA 예산 근거"));
  const deniedBudget=await managerPage.goto(`${origin}/tools/campaigns/${ids.project}?tab=budget`,{waitUntil:"networkidle"});
  // Next's loading boundary can stream HTTP 200 before rendering notFound().
  assert.ok([200,404].includes(deniedBudget.status()));
  await managerPage.getByRole("heading",{name:"404",exact:true}).waitFor();
  assert.equal(await managerPage.getByRole("heading",{name:"예산 소요 현황",exact:true}).count(),0);
  assert.ok(!(await managerPage.content()).includes("QA 예산 근거"));
  assert.deepEqual(failures, []);
  fs.writeFileSync(
    path.join(output, "browser-result.json"),
    JSON.stringify(
      {
        passed: true,
        checks: [
          "roster includes missing",
          "status filter",
          "admin proxy registration",
          "approval checklist gate",
          "approval saved",
          "correction request",
          "own mobile proxy record",
          "resubmit saved",
          "completion feedback survives refreshed state",
          "own privacy",
          "foreign user denied",
          "anonymous login return",
          "public preview approved only",
          "shared board approved only and publication gate",
          "mobile no overflow",
          "super admin budget edit and mobile layout",
          "manager submission access and budget denial",
          "public board excludes budget data",
        ],
        pageErrors: failures,
      },
      null,
      2,
    ),
  );
  console.log("BROWSER PASS:", output);
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (next) next.kill();
    if (server) await new Promise((r) => server.close(r));
    if (pg) await pg.close();
  });
