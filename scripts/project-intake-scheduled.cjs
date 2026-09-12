/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS Windows scheduler entry point. */
// Explicit installation only; no scheduling or registration on module import.
const { readFileSync, mkdirSync, appendFileSync } = require("node:fs");
const { parseEnv } = require("node:util");
const { spawn } = require("node:child_process");
const path = require("node:path");
const os = require("node:os");
const { createClient } = require("@supabase/supabase-js");
const repo = path.resolve(__dirname, "..");
const hubRoot =
  process.env.DEETZ_HUB_WORKER_DIR ||
  path.join(os.homedir(), "Desktop", "tkay_personal", "worker");
const env = parseEnv(readFileSync(path.join(hubRoot, ".env"), "utf8"));
const hub = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const key = "deetz:project-intake-studio";
const logDir = path.join(repo, "scripts", "out", "intake-runtime");
mkdirSync(logDir, { recursive: true });
const log = path.join(logDir, new Date().toISOString().slice(0, 10) + ".log");
const check = (r) => {
  if (r.error) throw new Error("Automation registry unavailable");
  return r.data;
};
(async () => {
  if (process.argv.includes("--register")) {
    check(
      await hub
        .from("automations")
        .upsert(
          {
            key,
            bu: "dancersbio",
            title: "deetz 공고·카드 준비",
            kind: "poll",
            runtime: "local-script",
            trigger_desc:
              "Windows 2분 주기. 텍스트·캡처 → 구독 OAuth → 공고·언어별 카드 2장 → 관리자 검토. 자동 발행 없음.",
            source: __filename,
            llm: "claude-max-oauth",
            enabled: process.argv.includes("--enable"),
            max_silence_minutes: 30,
            status: "idle",
          },
          { onConflict: "key" },
        ),
    );
    console.log("Automation registry updated.");
    return;
  }
  const automation = check(
    await hub
      .from("automations")
      .select("enabled")
      .eq("key", key)
      .maybeSingle(),
  );
  if (!automation?.enabled) return;
  const beat = () =>
    hub
      .from("automations")
      .update({
        last_heartbeat_at: new Date().toISOString(),
        status: "running",
        updated_at: new Date().toISOString(),
      })
      .eq("key", key);
  check(await beat());
  const timer = setInterval(() => {
    void beat().then((r) => {
      if (r.error) appendFileSync(log, "heartbeat unavailable\n");
    });
  }, 60000);
  let code;
  try {
    code = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--env-file=" + path.join(repo, ".env.local"),
          path.join(__dirname, "project-intake-worker.mjs"),
        ],
        { cwd: repo, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
      );
      for (const stream of [child.stdout, child.stderr])
        stream.on("data", (b) => appendFileSync(log, b));
      child.on("error", reject);
      child.on("close", resolve);
    });
  } finally {
    clearInterval(timer);
  }
  const now = new Date().toISOString();
  check(
    await hub
      .from("automations")
      .update({
        last_heartbeat_at: now,
        last_run_at: now,
        last_run_result: code === 0 ? "ok" : "error",
        last_run_detail: { exit_code: code },
        status: code === 0 ? "idle" : "error",
        updated_at: now,
      })
      .eq("key", key),
  );
  process.exitCode = code === 0 ? 0 : 1;
})().catch(() => {
  appendFileSync(log, new Date().toISOString() + " intake runtime failed\n");
  process.exitCode = 1;
});
