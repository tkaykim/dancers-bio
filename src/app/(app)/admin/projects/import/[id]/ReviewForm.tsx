"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  publishIngestionAction,
  dismissIngestionAction,
  mergeIngestionAction,
  reparseIngestionAction,
} from "@/app/actions/ingestions";
import type { ProjectIngestionData } from "@/lib/llm/schema";
import type { LlmProvider } from "@/lib/llm";

type DuplicateCandidate = {
  id: string;
  short_code: string;
  title: string;
  status: string;
  created_at: string;
  similarity: number;
  match_kind: "source_url" | "title";
};

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function ReviewForm({
  ingestionId,
  parsed,
  duplicateCandidates,
  parseError,
  sourceRaw,
  sourceUrl,
  llmProvider,
  llmModel,
  anthropicAvailable,
  geminiAvailable,
}: {
  ingestionId: string;
  parsed: ProjectIngestionData | null;
  duplicateCandidates: DuplicateCandidate[];
  parseError: string | null;
  sourceRaw: string;
  sourceUrl: string | null;
  llmProvider: string | null;
  llmModel: string | null;
  anthropicAvailable: boolean;
  geminiAvailable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // editable form state (pre-filled from parsed)
  const [title, setTitle] = useState(parsed?.title ?? "");
  const [description, setDescription] = useState(parsed?.description ?? "");
  const [postedBy, setPostedBy] = useState(parsed?.posted_by_label ?? "");
  const [regionText, setRegionText] = useState(parsed?.region_text ?? "");
  const [payDisplay, setPayDisplay] = useState<string>(
    parsed?.pay_amount != null
      ? Number(parsed.pay_amount).toLocaleString("ko-KR")
      : "",
  );
  const [payType, setPayType] = useState<string>(parsed?.pay_type ?? "");
  const [recruitmentCount, setRecruitmentCount] = useState<number>(
    parsed?.recruitment_count ?? 1,
  );
  const [deadline, setDeadline] = useState<string>(
    toLocalInput(parsed?.application_deadline_iso ?? null),
  );
  const [visibility, setVisibility] = useState<string>(
    parsed?.visibility_hint ?? "public",
  );

  function onPayChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/[^\d]/g, "");
    if (!digits) {
      setPayDisplay("");
      return;
    }
    setPayDisplay(Number(digits.slice(0, 10)).toLocaleString("ko-KR"));
  }

  function reparse(provider: LlmProvider) {
    setError(null);
    const fd = new FormData();
    fd.set("id", ingestionId);
    fd.set("provider", provider);
    startTransition(async () => {
      const r = await reparseIngestionAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function publish() {
    setError(null);
    const fd = new FormData();
    fd.set("id", ingestionId);
    fd.set("title", title);
    fd.set("description", description);
    fd.set("posted_by_label", postedBy);
    fd.set("region_text", regionText);
    fd.set("pay_amount", payDisplay.replace(/[^\d]/g, ""));
    fd.set("pay_type", payType);
    fd.set("recruitment_count", String(recruitmentCount));
    fd.set(
      "application_deadline_iso",
      fromLocalToIso(deadline) ?? "",
    );
    fd.set("visibility", visibility);
    startTransition(async () => {
      const r = await publishIngestionAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/projects/${r.data!.short_code}`);
    });
  }

  function merge(projectId: string) {
    setError(null);
    const fd = new FormData();
    fd.set("id", ingestionId);
    fd.set("merge_into_project_id", projectId);
    startTransition(async () => {
      const r = await mergeIngestionAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push("/admin/projects/import");
    });
  }

  function dismiss() {
    setError(null);
    if (!confirm("이 수집 항목을 무시하시겠어요?")) return;
    const fd = new FormData();
    fd.set("id", ingestionId);
    startTransition(async () => {
      const r = await dismissIngestionAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push("/admin/projects/import");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 중복 후보 */}
      {duplicateCandidates.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-ink-2">
            중복 후보 ({duplicateCandidates.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {duplicateCandidates.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-2 rounded-md border border-border bg-card p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <p className="line-clamp-2 text-sm font-medium">{c.title}</p>
                    <p className="font-mono text-[11px] text-ink-3">
                      {c.match_kind === "source_url"
                        ? "출처 URL 일치"
                        : `제목 유사 (~${Math.round(c.similarity * 100)}%)`}{" "}
                      · {c.status}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`/projects/${c.short_code}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1"
                  >
                    <Button variant="outline" size="sm" className="w-full">
                      보기
                    </Button>
                  </a>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => merge(c.id)}
                    className="flex-1"
                  >
                    이것과 동일 → 병합
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 파싱 메타 */}
      <section className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary/40 p-3 text-xs text-ink-3">
        <span>LLM:</span>
        <span className="font-mono">
          {llmProvider ?? "?"} {llmModel ? `(${llmModel})` : ""}
        </span>
        <span className="ml-auto flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending || !anthropicAvailable}
            onClick={() => reparse("anthropic")}
          >
            Anthropic로 재파싱
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending || !geminiAvailable}
            onClick={() => reparse("gemini")}
          >
            Gemini로 재파싱
          </Button>
        </span>
      </section>

      {parseError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          파싱 실패: {parseError}
        </div>
      ) : null}

      {parsed?.fit_warning ? (
        <div className="rounded-md border border-warn/30 bg-warn/5 p-3 text-sm text-warn">
          ⚠ {parsed.fit_warning}
        </div>
      ) : null}

      {parsed ? (
        <>
          {/* 편집 가능한 필드 */}
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-bold text-ink-2">
              발행할 공고 (수정 가능)
            </h2>

            <div className="flex flex-col gap-2">
              <Label htmlFor="title">제목</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="description">상세 설명</Label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={8}
                maxLength={2000}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="posted_by_label">등록자 표시</Label>
                <Input
                  id="posted_by_label"
                  value={postedBy}
                  onChange={(e) => setPostedBy(e.target.value)}
                  maxLength={80}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="region_text">지역</Label>
                <Input
                  id="region_text"
                  value={regionText}
                  onChange={(e) => setRegionText(e.target.value)}
                  maxLength={100}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="pay_amount">페이 (KRW)</Label>
                <Input
                  id="pay_amount"
                  type="text"
                  inputMode="numeric"
                  value={payDisplay}
                  onChange={onPayChange}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pay_type">지급 단위</Label>
                <select
                  id="pay_type"
                  value={payType}
                  onChange={(e) => setPayType(e.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">선택 안 함</option>
                  <option value="total">총액</option>
                  <option value="per_session">회차당</option>
                  <option value="negotiable">협의</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="recruitment_count">모집 인원</Label>
                <Input
                  id="recruitment_count"
                  type="number"
                  min={1}
                  max={999}
                  value={recruitmentCount}
                  onChange={(e) =>
                    setRecruitmentCount(Number(e.target.value) || 1)
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="application_deadline_iso">지원 마감</Label>
                <Input
                  id="application_deadline_iso"
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="visibility">공개 범위</Label>
              <select
                id="visibility"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="public">공개</option>
                <option value="private">비공개</option>
              </select>
            </div>

            {parsed.sessions.length > 0 ? (
              <div className="flex flex-col gap-2">
                <Label>일정 ({parsed.sessions.length})</Label>
                <ul className="flex flex-col gap-1 rounded-md border border-border bg-secondary/40 p-3">
                  {parsed.sessions.map((s, i) => (
                    <li
                      key={i}
                      className="flex justify-between font-mono text-[11px] text-ink-2"
                    >
                      <span>{s.session_type}</span>
                      <span>{toLocalInput(s.starts_at_iso)}</span>
                      {s.location_name ? <span>· {s.location_name}</span> : null}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-ink-3">
                  일정은 LLM이 추출한 값을 그대로 사용해 발행합니다. 세션 수정이
                  필요하면 발행 후 /projects/[id]/edit 에서 수정해 주세요.
                </p>
              </div>
            ) : null}

            {parsed.contact ? (
              <p className="text-xs text-ink-3">
                추출된 연락처:{" "}
                <span className="font-mono">{parsed.contact}</span>
              </p>
            ) : null}
          </section>
        </>
      ) : null}

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {/* 액션 */}
      <section className="sticky bottom-4 flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={pending}
          onClick={dismiss}
          className="flex-1"
        >
          무시
        </Button>
        <Button
          type="button"
          size="lg"
          disabled={pending || !parsed || !title.trim()}
          onClick={publish}
          className="flex-1"
        >
          {pending ? "처리 중..." : "새 공고로 발행"}
        </Button>
      </section>

      {/* 원본 보존 */}
      <details className="rounded-md border border-border bg-card p-3">
        <summary className="cursor-pointer text-xs uppercase tracking-[0.14em] text-ink-3">
          원본 텍스트 보기
        </summary>
        {sourceUrl ? (
          <p className="mt-2 break-all text-xs text-ink-3">
            출처:{" "}
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {sourceUrl}
            </a>
          </p>
        ) : null}
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] text-ink-2">
          {sourceRaw}
        </pre>
      </details>
    </div>
  );
}
