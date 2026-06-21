import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const tokenFile = "C:\\Users\\tkay\\Desktop\\ndol-ops-rotated-token-20260619.txt";
const outDir = path.join(process.cwd(), ".codex-logs", "ndol-e2e-dump-20260619");
const baseUrl = "https://www.deetz.kr";
const tokenPattern = /20260618-ndol-[A-Za-z0-9_-]+/g;

fs.mkdirSync(outDir, { recursive: true });

function readOpsUrl() {
  const url = fs.readFileSync(tokenFile, "utf8")
    .split(/\r?\n/)
    .find((line) => line.startsWith(`${baseUrl}/ops/ndol-20260618/`));
  if (!url) throw new Error("ops URL not found in private token file");
  return url.trim();
}

function redact(value) {
  return String(value ?? "").replace(tokenPattern, "20260618-ndol-<redacted>");
}

function render(name, url, options = {}) {
  const screenshotPath = path.join(outDir, `${name}.png`);
  const userDataDir = path.join(outDir, `profile-${name}-${Date.now()}`);
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-dev-shm-usage",
    `--user-data-dir=${userDataDir}`,
    `--window-size=${options.windowSize ?? "1440,1050"}`,
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=10000",
    `--screenshot=${screenshotPath}`,
    "--dump-dom",
    url,
  ];
  const result = spawnSync(chromePath, args, {
    encoding: "utf8",
    maxBuffer: 12 * 1024 * 1024,
  });
  const dom = result.stdout ?? "";
  const text = dom.replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    name,
    url: redact(url),
    status: result.status,
    stderr: redact((result.stderr ?? "").slice(0, 1000)),
    screenshot: path.relative(process.cwd(), screenshotPath),
    domLength: dom.length,
    text,
    checks: {},
  };
}

function check(item, checks) {
  item.checks = checks;
  item.ok = Object.values(checks).every(Boolean) && item.status === 0;
  item.failures = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([label]) => label);
  delete item.text;
  return item;
}

async function httpCheck(url, options = {}) {
  const response = await fetch(url, { redirect: options.redirect ?? "follow" });
  return {
    url: redact(url),
    status: response.status,
    redirected: response.redirected,
    finalUrl: redact(response.url),
    ok: response.ok,
  };
}

const opsUrl = readOpsUrl();
const rawPages = [
  render("01-project-ndol26", `${baseUrl}/projects/ndol26`),
  render("02-channel-shortlink", `${baseUrl}/c/jFMixy`),
  render("03-channel-applicants", `${baseUrl}/channels/jFMixy/applicants`),
  render("04-ops-contact", opsUrl),
  render("05-ops-onsite", `${opsUrl}?mode=onsite`),
  render("06-labels", `${opsUrl}/labels`),
  render("07-passes", `${opsUrl}/passes`),
  render("08-poster", `${baseUrl}/ndol/20260618/pass/poster`),
  render("09-self-pass-mobile", `${baseUrl}/ndol/20260618/pass`, { windowSize: "390,844" }),
];

for (const item of rawPages) {
  const domPath = path.join(outDir, `${item.name}.dom.txt`);
  fs.writeFileSync(domPath, redact(item.text ?? ""), "utf8");
}

function loadText(name) {
  return fs.readFileSync(path.join(outDir, `${name}.dom.txt`), "utf8");
}

const pageResults = rawPages.map((item) => {
  const text = loadText(item.name);
  const hasAppError = text.includes("Application error") || text.includes("Unhandled Runtime Error");
  if (item.name === "04-ops-contact") {
    return check(item, {
      "연락 운영판 표시": text.includes("연락 운영판"),
      "담당자 표기 표시": text.includes("BAW(김주성)") && text.includes("HS(정현수)"),
      "현장 운영 전환 버튼 표시": text.includes("현장 운영"),
      "운영판 로딩 오류 없음": !text.includes("운영판을 불러오지 못했습니다") && !text.includes("링크가 잘못되었거나 데이터가 없습니다"),
      "앱 에러 없음": !hasAppError,
    });
  }
  if (item.name === "05-ops-onsite") {
    return check(item, {
      "현장 운영판 표시": text.includes("현장 운영판"),
      "QR 체크인 표시": text.includes("QR 체크인"),
      "스캔 시작 표시": text.includes("스캔 시작"),
      "번호표 설명 표시": text.includes("번호표·출석·탈락 관리"),
      "앱 에러 없음": !hasAppError,
    });
  }
  if (item.name === "06-labels") {
    return check(item, {
      "번호표 출력용 표시": text.includes("번호표 출력용"),
      "dee'tz 워드마크 표시": text.includes("dee'tz"),
      "인쇄 버튼 표시": text.includes("인쇄"),
      "앱 에러 없음": !hasAppError,
    });
  }
  if (item.name === "07-passes") {
    return check(item, {
      "QR 출입증 표시": text.includes("QR 출입증"),
      "운영진 안내 문구 표시": text.includes("현장 접수 시 운영진에게 QR을 보여주세요"),
      "앱 에러 없음": !hasAppError,
    });
  }
  if (item.name === "08-poster") {
    return check(item, {
      "입구 QR 포스터 표시": text.includes("현장 접수 QR"),
      "개인 QR 안내 표시": text.includes("개인 QR"),
      "앱 에러 없음": !hasAppError,
    });
  }
  if (item.name === "09-self-pass-mobile") {
    return check(item, {
      "모바일 QR 페이지 표시": text.includes("현장 접수 QR"),
      "로그인 버튼 표시": text.includes("로그인해서 내 QR 보기"),
      "수동 조회 표시": text.includes("이름/전화번호로 QR 보기"),
      "전화번호 없는 경우 안내 표시": text.includes("전화번호가 없고 로그인이 어려우면"),
      "앱 에러 없음": !hasAppError,
    });
  }
  if (item.name === "03-channel-applicants") {
    return check(item, {
      "채널 담당자 조회 경로 존재": text.includes("로그인") || text.includes("모집채널"),
      "앱 에러 없음": !hasAppError,
    });
  }
  return check(item, {
    "페이지 렌더링": item.domLength > 1000,
    "앱 에러 없음": !hasAppError,
  });
});

const httpResults = [
  await httpCheck(`${baseUrl}/projects/ndol26`),
  await httpCheck(`${baseUrl}/projects/ndol02`, { redirect: "follow" }),
  await httpCheck(`${baseUrl}/c/jFMixy`, { redirect: "follow" }),
  await httpCheck(`${baseUrl}/api/ops/ndol-20260618/self-pass`, { redirect: "manual" }),
];

const invalidSelfPass = await fetch(`${baseUrl}/api/ops/ndol-20260618/self-pass`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "없는테스트", phoneLast4: "0000" }),
});
const invalidSelfPassJson = await invalidSelfPass.json().catch(() => ({}));

const report = {
  ok:
    pageResults.every((item) => item.ok) &&
    httpResults[0].ok &&
    httpResults[1].finalUrl.includes("/projects/ndol26") &&
    httpResults[2].finalUrl.includes("/projects/ndol26") &&
    invalidSelfPass.status === 404,
  checkedAt: new Date().toISOString(),
  deployment: baseUrl,
  screenshotsDir: path.relative(process.cwd(), outDir),
  httpResults,
  invalidSelfPass: {
    status: invalidSelfPass.status,
    ok: invalidSelfPass.status === 404,
    error: invalidSelfPassJson.error ?? null,
  },
  pageResults,
};

fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
