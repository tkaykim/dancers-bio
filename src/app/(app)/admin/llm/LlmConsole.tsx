"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  llmStatusAction,
  llmTestParseAction,
  setDefaultLlmProviderAction,
} from "@/app/actions/ingestions";
import type { LlmProvider } from "@/lib/llm";

type Status = {
  anthropic: {
    configured: boolean;
    model: string;
    health: { ok: boolean; error?: string; latency_ms?: number };
  };
  gemini: {
    configured: boolean;
    model: string;
    health: { ok: boolean; error?: string; latency_ms?: number };
  };
  default_provider: LlmProvider;
};

const LABELS: Record<LlmProvider, string> = {
  anthropic: "Anthropic Claude Haiku 4.5",
  gemini: "Google Gemini 2.5 Flash",
};

export function LlmConsole() {
  const [status, setStatus] = useState<Status | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [savingDefault, startDefault] = useTransition();
  const [defaultMsg, setDefaultMsg] = useState<string | null>(null);

  const [testText, setTestText] = useState("");
  const [testProvider, setTestProvider] = useState<LlmProvider>("gemini");
  const [testRunning, startTest] = useTransition();
  const [testResult, setTestResult] = useState<
    | {
        provider: LlmProvider;
        model: string;
        latency_ms: number;
        error?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
        data?: unknown;
      }
    | null
  >(null);

  async function reloadStatus() {
    setStatusLoading(true);
    setStatusErr(null);
    const r = await llmStatusAction();
    setStatusLoading(false);
    if (!r.ok) setStatusErr(r.error);
    else {
      setStatus(r.data!);
      setTestProvider(r.data!.default_provider);
    }
  }

  useEffect(() => {
    void reloadStatus();
  }, []);

  function changeDefault(p: LlmProvider) {
    setDefaultMsg(null);
    const fd = new FormData();
    fd.set("provider", p);
    startDefault(async () => {
      const r = await setDefaultLlmProviderAction(fd);
      if (!r.ok) setDefaultMsg(`실패: ${r.error}`);
      else {
        setDefaultMsg("기본 provider 변경됨.");
        await reloadStatus();
      }
    });
  }

  function runTest() {
    setTestResult(null);
    const fd = new FormData();
    fd.set("source_raw", testText);
    fd.set("provider", testProvider);
    startTest(async () => {
      const r = await llmTestParseAction(fd);
      if (!r.ok) setTestResult({
        provider: testProvider,
        model: "",
        latency_ms: 0,
        error: r.error,
      });
      else setTestResult(r.data!);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-2">기본 Provider</h2>
        {statusLoading ? (
          <p className="text-sm text-ink-3">불러오는 중...</p>
        ) : status ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
            {(["anthropic", "gemini"] as LlmProvider[]).map((p) => {
              const info = status[p];
              const isDefault = status.default_provider === p;
              const disabled = !info.configured || savingDefault;
              return (
                <label
                  key={p}
                  className={`flex items-start gap-3 rounded-md border p-3 ${
                    isDefault
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-background"
                  } ${disabled ? "opacity-60" : ""}`}
                >
                  <input
                    type="radio"
                    name="default_provider"
                    checked={isDefault}
                    disabled={disabled}
                    onChange={() => changeDefault(p)}
                    className="mt-1"
                  />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold">{LABELS[p]}</span>
                    <span className="font-mono text-[11px] text-ink-3">
                      {info.model}
                    </span>
                    {!info.configured ? (
                      <span className="text-xs text-warn">
                        API 키 미설정 — 환경변수{" "}
                        {p === "anthropic"
                          ? "ANTHROPIC_API_KEY"
                          : "GEMINI_API_KEY"}{" "}
                        등록 필요
                      </span>
                    ) : null}
                  </div>
                </label>
              );
            })}
            {defaultMsg ? (
              <p className="text-xs text-ink-3">{defaultMsg}</p>
            ) : null}
          </div>
        ) : statusErr ? (
          <p className="text-sm text-destructive">{statusErr}</p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink-2">연결 상태</h2>
          <button
            type="button"
            onClick={() => void reloadStatus()}
            className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
          >
            새로고침
          </button>
        </div>
        {status ? (
          <ul className="flex flex-col gap-2">
            {(["anthropic", "gemini"] as LlmProvider[]).map((p) => {
              const info = status[p];
              const dot = !info.configured
                ? "bg-ink-3"
                : info.health.ok
                ? "bg-primary"
                : "bg-destructive";
              const label = !info.configured
                ? "미설정"
                : info.health.ok
                ? `연결됨 · ${info.health.latency_ms ?? "?"}ms`
                : `오류: ${info.health.error ?? "?"}`;
              return (
                <li
                  key={p}
                  className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${dot}`}
                      aria-hidden
                    />
                    <span className="text-sm font-medium">{LABELS[p]}</span>
                  </div>
                  <span className="text-xs text-ink-3">{label}</span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-2">테스트 파싱</h2>
        <p className="text-xs text-ink-3">
          외부 공고 텍스트를 붙여넣고 한 번 추출해 봅니다. 결과는 저장되지
          않습니다.
        </p>
        <textarea
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
          rows={8}
          placeholder="여기에 공고 텍스트를 붙여넣으세요..."
          className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-ink-3">Provider</label>
          <select
            value={testProvider}
            onChange={(e) => setTestProvider(e.target.value as LlmProvider)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option
              value="anthropic"
              disabled={!status?.anthropic.configured}
            >
              Anthropic
            </option>
            <option value="gemini" disabled={!status?.gemini.configured}>
              Gemini
            </option>
          </select>
          <Button
            type="button"
            size="sm"
            disabled={testRunning || testText.trim().length < 10}
            onClick={runTest}
          >
            {testRunning ? "실행 중..." : "실행"}
          </Button>
        </div>
        {testResult ? (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
            <p className="font-mono text-xs text-ink-3">
              {testResult.model} · {testResult.latency_ms}ms
              {testResult.usage
                ? ` · in ${testResult.usage.input_tokens ?? "?"} / out ${testResult.usage.output_tokens ?? "?"}`
                : ""}
            </p>
            {testResult.error ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {testResult.error}
              </p>
            ) : (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-secondary p-2 text-[11px]">
                {JSON.stringify(testResult.data, null, 2)}
              </pre>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
