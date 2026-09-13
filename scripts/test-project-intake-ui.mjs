// Isolated real-component browser test. No database, login bypass or app test route.
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const mock = `
const project={title:'단기 레슨 강사 모집',description:'연습생 단기 레슨 강사를 모집합니다.',category:'instructor',genre_slug:null,region_text:null,pay_type:'negotiable',pay_amount:null,recruitment_count:1,recruitment_unlimited:false,application_deadline:null,visibility:'public',collect_applicant_fee:true,collect_casting_details:false};
const initial={id:'11111111-1111-4111-8111-111111111111',revision:1,status:'review',created_at:'2026-09-12T10:00:00Z',languages:['ko'],source_raw:'테스트용 원문입니다.',assets:[],result:{project,missing:['장소 확인 필요'],source_transcript:'검증용 원문',evidence:[],decks:[{language:'ko',caption:'지원은 @deetz.kr link in bio에서 공고를 확인하세요.',slides:[]}]}};
let jobs=[initial];window.__intakeCalls=[];window.__initialJobs=structuredClone(jobs);
export const listProjectIntakes=async()=>({ok:true,jobs:structuredClone(jobs)});
export const prepareIntakeUpload=async v=>({ok:true,data:{path:'test/'+v.request_id+'.png',token:'local-test'}});
export const submitProjectIntake=async v=>{window.__intakeCalls.push({action:'submit',...v});jobs=[{...initial,id:v.request_id,source_raw:v.source_raw,languages:v.languages,status:'queued',result:null},...jobs];return {ok:true,id:v.request_id};};
export const reviseProjectIntake=async v=>{window.__intakeCalls.push({action:'revise',...v});jobs=jobs.map(j=>j.id===v.id?({...j,revision:j.revision+1,result:{...j.result,project:v.project}}):j);return {ok:true};};
export const registerProjectIntake=async v=>{window.__intakeCalls.push({action:'register',...v});jobs=jobs.map(j=>({...j,status:'registered',project_code:'test123'}));return {ok:true};};
`;
const bundled = await build({
  stdin: {
    contents: `import React from 'react';import{createRoot}from'react-dom/client';import './src/app/actions/project-intake.ts';import{IntakeConsole}from'./src/app/(app)/admin/projects/intake/IntakeConsole.tsx';createRoot(document.getElementById('root')).render(<IntakeConsole initialJobs={window.__initialJobs} initialError=""/>);`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  plugins: [
    {
      name: "isolated-actions",
      setup(b) {
        b.onResolve({ filter: /project-intake(?:\.ts)?$/ }, (a) =>
          a.path.includes("actions/")
            ? { path: "actions", namespace: "test-mock" }
            : undefined,
        );
        b.onResolve({ filter: /^@\/lib\/supabase\/browser$/ }, () => ({
          path: "browser",
          namespace: "test-mock",
        }));
        b.onResolve({ filter: /^next\/link$/ }, () => ({
          path: "link",
          namespace: "test-mock",
        }));
        b.onLoad({ filter: /.*/, namespace: "test-mock" }, (a) => ({
          contents:
            a.path === "actions"
              ? mock
              : a.path === "browser"
                ? `export const getBrowserClient=()=>({storage:{from:()=>({uploadToSignedUrl:async()=>({error:null})})}});`
                : `import React from 'react';export default function Link(p){return React.createElement('a',p);}`,
          resolveDir: process.cwd(),
          loader: "js",
        }));
      },
    },
  ],
});
// Use the actual compiled application CSS so layout evidence reflects our UI.
const { readdir, readFile } = await import("node:fs/promises");
let css = "";
try {
  for (const f of await readdir(".next/static/css"))
    if (f.endsWith(".css"))
      css += await readFile(".next/static/css/" + f, "utf8");
} catch {
  /* Functional assertions still run without a build. */
}
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><style>${css}</style><body><main style="max-width:1000px;margin:auto;padding:24px"><h1>텍스트·캡처로 공고 만들기</h1><div id="root"></div></main><script>${bundled.outputFiles[0].text}</script></body></html>`;
const server = createServer((req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch();
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  const url = `http://127.0.0.1:${server.address().port}`;
  await page.goto(url);
  await page
    .getByLabel("원문", { exact: true })
    .fill("캡처와 텍스트에서 공고를 만드는 테스트입니다.");
  await page.getByText("언어·비공개 설정·작성 지침", { exact: true }).click();
  await page.getByLabel("English", { exact: true }).check();
  await page.getByRole("button", { name: "공고·카드 초안 준비" }).click();
  await page.waitForFunction(() =>
    window.__intakeCalls.some((x) => x.action === "submit"),
  );
  assert.deepEqual(
    await page.evaluate(() => window.__intakeCalls[0].languages),
    ["ko", "en"],
  );
  assert.equal(await page.getByLabel("원문", { exact: true }).inputValue(), "");
  await page
    .getByRole("status")
    .getByText("처리기는 약 2분", { exact: false })
    .waitFor();
  assert.equal(await page.locator('article [aria-expanded="true"]').count(), 1);
  await page.getByLabel("준비함 검색").fill("단기 레슨");
  assert.equal(await page.locator("article").count(), 1);
  await page.getByRole("button", { name: /단기 레슨 강사 모집/ }).click();
  assert.equal(
    await page
      .getByRole("link", { name: "공고등록 양식에서 수정·발행 →" })
      .getAttribute("href"),
    "/projects/new?intake=11111111-1111-4111-8111-111111111111",
  );
  await page.getByText("수정 지침으로 다시 준비", { exact: true }).click();
  await page
    .getByLabel("수정 요청", { exact: true })
    .fill("마감 조건을 확인해 주세요.");
  await page
    .getByRole("button", { name: "수정 반영 · 카드 다시 만들기" })
    .click();
  await page.waitForFunction(() =>
    window.__intakeCalls.some((c) => c.action === "revise"),
  );
  await page.getByLabel("준비함 검색").fill("");
  await page.getByLabel("상태 필터").selectOption("busy");
  assert.equal(await page.locator("article").count(), 1);
  await page.reload();
  await page.getByLabel("원문", { exact: true }).evaluate((el) => {
    const dt = new DataTransfer();
    dt.items.add(
      new File([new Uint8Array([137, 80, 78, 71])], "clipboard.png", {
        type: "image/png",
      }),
    );
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await page.getByText("clipboard.png", { exact: true }).waitFor();
  await page.getByRole("button", { name: "공고·카드 초안 준비" }).click();
  await page.waitForFunction(() =>
    window.__intakeCalls.some((x) => x.action === "submit"),
  );
  assert.equal(
    await page.evaluate(() => window.__intakeCalls[0].source_paths.length),
    1,
  );
  await mkdir("scripts/out/intake-ui", { recursive: true });
  await page.screenshot({
    path: "scripts/out/intake-ui/desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: "scripts/out/intake-ui/mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    "scripts/out/intake-ui/result.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "text submission",
          "language order",
          "compact list and expanded progress",
          "revision regeneration",
          "existing registration form link",
          "clipboard image upload",
          "390px no overflow",
          "no page errors",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: intake UI — 8 checks (mocked server actions, real React component)",
  );
} finally {
  await browser.close();
  server.close();
}
