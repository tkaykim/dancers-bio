import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
const exec = promisify(execFile);
// Existing Social Creative Studio is the only card renderer used by intake.
export async function studioRequest(
  route,
  body,
  base = "http://127.0.0.1:7795",
) {
  const url = new URL(base);
  if (!["127.0.0.1", "localhost"].includes(url.hostname))
    throw new Error("Studio must run locally");
  const response = await fetch(new URL(route, base), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  const result = await response.json();
  if (!response.ok || !result.ok || !result.job)
    throw new Error(
      `소재 스튜디오 처리 실패: ${String(result.error || response.status).slice(0, 600)}`,
    );
  return result.job;
}

export async function renderDeck(deck, jobId, base) {
  if (deck.slides.length !== 2)
    throw new Error("언어별 카드 수는 2장이어야 합니다.");
  let job = jobId
    ? { id: jobId }
    : await studioRequest(
        "/api/create",
        {
          brand: "deetz",
          topic: deck.title,
          category: "recruiting",
          noAi: true,
          render: false,
          platform: "instagram,threads",
          theme: "light",
        },
        base,
      );
  job = await studioRequest(
    "/api/save-copy",
    {
      job: job.id,
      title: deck.title,
      description: "deetz 공고 기반 카드뉴스 · 게시 검토 대기",
      caption: deck.caption,
      slides: deck.slides.map((s) => ({
        copy: "",
        chip: "",
        items: [],
        steps: [],
        ...s,
      })),
      render: false,
      theme: "light",
    },
    base,
  );
  const root =
    process.env.DEETZ_STUDIO_ROOT ||
    path.join(os.homedir(), "Desktop", "orchestrator-integrations");
  const require = createRequire(path.join(root, "package.json"));
  await exec(
    process.execPath,
    [
      "-r",
      require.resolve("ts-node/register"),
      path.join(root, "social-creative.ts"),
      "render",
      "--job",
      job.id,
      "--theme",
      "light",
    ],
    {
      cwd: root,
      timeout: 180_000,
      windowsHide: true,
      maxBuffer: 2_000_000,
      env: {
        ...process.env,
        TS_NODE_TRANSPILE_ONLY: "true",
        NODE_PATH:
          process.env.NODE_PATH ||
          path.join(os.homedir(), "AppData", "Roaming", "npm", "node_modules"),
      },
    },
  );
  job = JSON.parse(
    await readFile(
      path.join(root, "output", "social-creative", "deetz", job.id, "job.json"),
      "utf8",
    ),
  );
  if (job.renderedImages?.light?.length !== 2)
    throw new Error("카드 렌더 결과가 2장이 아닙니다.");
  await verifyDeckLayout(root, job.id, deck);
  // Never call enqueue/upload: preparation is independent of public publication.
  return job;
}

export async function verifyDeckLayout(root, id, deck) {
  const require = createRequire(path.join(root, "package.json"));
  const { chromium } = require(
    require.resolve("playwright", {
      paths: [
        root,
        process.env.NODE_PATH ||
          path.join(os.homedir(), "AppData", "Roaming", "npm", "node_modules"),
      ],
    }),
  );
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1080, height: 1350 },
    });
    for (let i = 0; i < 2; i++) {
      await page.goto(
        `${pathToFileURL(path.join(root, "templates", "social", "cardnews.html")).href}?set=${encodeURIComponent(id)}&slide=${i}&theme=light`,
      );
      await page.waitForFunction(
        () => window.__DEETZ_CARD_READY === true,
        null,
        { timeout: 15000 },
      );
      const issues = await page.evaluate((expected) => {
        const content = document.querySelector("#content");
        const text = (content?.textContent || "").replace(/\s/g, "");
        const problems = [];
        if (!expected.every((t) => text.includes(t.replace(/\s/g, ""))))
          problems.push("missing title");
        for (const e of document.querySelectorAll(
          "#content .title-line,#content .copy,#content .item-title,#content .item-copy",
        )) {
          const r = document.createRange();
          r.selectNodeContents(e);
          const b = r.getBoundingClientRect();
          if (b.left < 35 || b.right > 1045 || b.bottom > 1230 || b.top < 160)
            problems.push("text outside safe area");
        }
        return problems;
      }, deck.slides[i].title);
      if (issues.length)
        throw new Error(
          "카드 문구가 잘리거나 누락되었습니다. 문구를 줄여 다시 생성해 주세요.",
        );
    }
  } finally {
    await browser.close();
  }
}
