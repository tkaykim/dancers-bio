"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createIngestionAction } from "@/app/actions/ingestions";
import type { LlmProvider } from "@/lib/llm";

export function PasteForm({
  defaultProvider,
  anthropicAvailable,
  geminiAvailable,
}: {
  defaultProvider: LlmProvider;
  anthropicAvailable: boolean;
  geminiAvailable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<LlmProvider | "auto">("auto");
  const [textLen, setTextLen] = useState(0);

  return (
    <form
      action={(fd) => {
        setError(null);
        if (provider !== "auto") fd.set("provider", provider);
        startTransition(async () => {
          const r = await createIngestionAction(fd);
          if (!r.ok) {
            setError(r.error);
            return;
          }
          router.push(`/admin/projects/import/${r.data!.id}`);
        });
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="source_raw">공고 텍스트</Label>
        <textarea
          id="source_raw"
          name="source_raw"
          rows={14}
          required
          minLength={10}
          maxLength={20000}
          placeholder="인스타 캡션 / 카페 글 / 디시 / 카톡 공유 등에서 복사한 공고 원문을 그대로 붙여넣으세요."
          onChange={(e) => setTextLen(e.target.value.length)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
        />
        <p className="text-right font-mono text-[11px] text-ink-3">
          {textLen.toLocaleString()} / 20,000
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="source_url">출처 URL (선택)</Label>
        <Input
          id="source_url"
          name="source_url"
          type="url"
          placeholder="https://www.instagram.com/p/..."
          autoComplete="off"
        />
        <p className="text-[11px] text-ink-3">
          출처 URL 이 같으면 자동으로 중복 후보로 잡힙니다.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="provider">사용할 LLM</Label>
        <select
          id="provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value as LlmProvider | "auto")}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="auto">자동 (기본 = {defaultProvider})</option>
          <option value="anthropic" disabled={!anthropicAvailable}>
            Anthropic Claude Haiku 4.5
          </option>
          <option value="gemini" disabled={!geminiAvailable}>
            Google Gemini 2.5 Flash
          </option>
        </select>
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} size="lg">
        {pending ? "추출 중..." : "추출 → 검토"}
      </Button>
    </form>
  );
}
