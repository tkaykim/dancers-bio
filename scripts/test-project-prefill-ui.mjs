// Real existing ProjectForm; only networking/server actions are mocked.
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const defaults = {
  title: "채워진 강사 모집",
  description: "연습생 단기 레슨을 담당할 강사를 찾습니다.",
  category: "instructor",
  genre_id: "11111111-1111-4111-8111-111111111111",
  region_text: "서울",
  pay_amount: 150000,
  pay_type: "per_session",
  recruitment_count: 3,
  application_deadline: "2026-09-14T14:00:00Z",
  collect_applicant_fee: true,
  posted_by_label: "deetz",
  schedules: [
    {
      label: "촬영",
      date: "2026-10-03",
      start: "17:30",
      end: "18:00",
      location: "서울",
    },
  ],
};
const bundled = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {ProjectForm} from './src/components/project/ProjectForm.tsx';import {ProjectRegistrationModes} from './src/components/project/ProjectRegistrationModes.tsx';window.__submissions=[];createRoot(document.getElementById('root')).render(<ProjectRegistrationModes automatic={<textarea aria-label="원문" />} manual={<ProjectForm genres={[{id:'11111111-1111-4111-8111-111111111111',label_ko:'힙합'}]} initialValues={${JSON.stringify(defaults)}} intake={{id:'22222222-2222-4222-8222-222222222222',revision:3}} />} />);`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  plugins: [
    {
      name: "form-network-boundary",
      setup(b) {
        b.onResolve({ filter: /^@\/app\/actions\/projects$/ }, () => ({
          path: "action",
          namespace: "mock",
        }));
        b.onResolve({ filter: /^next\/navigation$/ }, () => ({
          path: "router",
          namespace: "mock",
        }));
        b.onResolve(
          { filter: /^@\/lib\/storage\/upload-project-file$/ },
          () => ({ path: "upload", namespace: "mock" }),
        );
        b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({
          contents:
            a.path === "action"
              ? `export async function createProjectAction(fd){window.__submissions.push(Object.fromEntries(fd));return {ok:false,error:'검증 기록 완료'};}`
              : a.path === "router"
                ? `export const useRouter=()=>({push(){},refresh(){}});`
                : `export async function deleteUploadedProjectFileFromBrowser(){};export async function uploadProjectFileFromBrowser(){throw Error('unused');}`,
          loader: "js",
        }));
      },
    },
  ],
});
let css = "";
try {
  for (const f of await readdir(".next/static/css"))
    if (f.endsWith(".css"))
      css += await readFile(".next/static/css/" + f, "utf8");
} catch {}
const server = createServer((req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(
    `<!doctype html><html><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><body><main style="max-width:448px;margin:auto;padding:24px"><div id="root"></div></main><script>${bundled.outputFiles[0].text}</script></body></html>`,
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
      viewport: { width: 1280, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  assert.equal(
    await page.getByLabel("제목", { exact: true }).inputValue(),
    defaults.title,
  );
  assert.equal(
    await page.getByLabel("지원 마감 (선택)", { exact: true }).inputValue(),
    "2026-09-14T23:00",
  );
  assert.equal(await page.getByLabel("지급 단위").inputValue(), "per_session");
  assert.equal(await page.getByLabel("페이 (KRW)").inputValue(), "150,000");
  assert.equal(
    await page.getByLabel("장르", { exact: true }).inputValue(),
    defaults.genre_id,
  );
  await page.getByLabel("제목", { exact: true }).fill("수정된 공고 제목");
  await page.getByRole('button', {name:'텍스트·캡처로 자동 입력', exact:true}).click();
  assert.equal(await page.getByLabel('제목', {exact:true}).isVisible(), false);
  await page.getByLabel('원문', {exact:true}).fill('보존할 원문');
  await page.getByRole('button', {name:'직접 입력', exact:true}).click();
  assert.equal(await page.getByLabel('제목', {exact:true}).inputValue(), '수정된 공고 제목');
  await page.getByRole('button', {name:'텍스트·캡처로 자동 입력', exact:true}).click();
  assert.equal(await page.getByLabel('원문', {exact:true}).inputValue(), '보존할 원문');
  await page.getByRole('button', {name:'직접 입력', exact:true}).click();
  await page.getByLabel("페이 (KRW)").fill("170000");
  await page
    .getByLabel("지원 마감 (선택)", { exact: true })
    .fill("2026-09-15T22:30");
  await page.getByLabel("모집 인원", { exact: true }).fill("5");
  await page.getByRole("button", { name: "공고 발행", exact: true }).click();
  await page.waitForFunction(() => window.__submissions.length === 1);
  const payload = await page.evaluate(() => window.__submissions[0]);
  assert.equal(
    await page.getByLabel("제목", { exact: true }).inputValue(),
    "수정된 공고 제목",
    "rejected submission must retain edits",
  );
  assert.equal(payload.title, "수정된 공고 제목");
  assert.equal(payload.pay_amount, "170000");
  assert.equal(payload.recruitment_count, "5");
  assert.equal(payload.application_deadline, "2026-09-15T22:30:00+09:00");
  assert.equal(payload.intake_revision, "3");
  assert.equal(payload.publish_now, "on");
  assert.equal(payload["schedules[0][starts_at]"], "2026-10-03T17:30:00+09:00");
  await page.getByLabel("지금 바로 공개하기 (체크 해제 시 임시저장)").uncheck();
  await page.getByRole("button", { name: "임시저장", exact: true }).click();
  await page.waitForFunction(() => window.__submissions.length === 2);
  assert.equal(
    await page.evaluate(() => window.__submissions[1].publish_now),
    undefined,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await mkdir("scripts/out/intake-form", { recursive: true });
  await page.screenshot({
    path: "scripts/out/intake-form/mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "scripts/out/intake-form/result.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "prefill",
          "mode switching preserves both panels",
          "edited values",
          "KST deadline",
          "schedule",
          "manual publish",
          "draft",
          "390px layout",
          "page errors",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: existing ProjectForm prefill/edit/publish and draft controls",
  );
} finally {
  await browser.close();
  server.close();
}
