"use client";
/* eslint-disable @next/next/no-img-element -- Private signed preview images. */
import { useState, useEffect, useTransition, useRef } from "react";
import Link from "next/link";
import { intakeProgress } from "@/lib/project-intake/progress";
import { formatIntakeDate } from "@/lib/project-intake/date";
import { getBrowserClient } from "@/lib/supabase/browser";
import type { IntakeJob } from "@/lib/project-intake/db";
import { LANGUAGES } from "@/lib/project-intake/schema";
import {
  prepareIntakeUpload,
  submitProjectIntake,
  listProjectIntakes,
  reviseProjectIntake,
} from "@/app/actions/project-intake";
const labels: Record<string, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  zh: "中文",
  th: "ไทย",
  id: "Indonesia",
};
const field =
  "w-full rounded-md border border-border bg-background p-3 text-sm";
const button =
  "rounded-md bg-foreground px-4 py-2 text-sm text-background disabled:opacity-40";
export function IntakeConsole({
  initialJobs,
  initialError,
  initialRaw = "",
  focusId,
}: {
  initialJobs: IntakeJob[];
  initialError: string;
  initialRaw?: string;
  focusId?: string;
}) {
  const [composerOpen, setComposerOpen] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(focusId ?? null);

  const [jobs, setJobs] = useState(initialJobs),
    [error, setError] = useState(initialError),
    [pending, start] = useTransition();
  const [hasMore, setHasMore] = useState(initialJobs.length === 30);
  const mergeLatest = (latest: IntakeJob[]) =>
    setJobs((old) => [
      ...latest,
      ...old.filter((j) => !latest.some((n) => n.id === j.id)),
    ]);
  const [raw, setRaw] = useState(initialRaw),
    [files, setFiles] = useState<File[]>([]),
    [terms, setTerms] = useState(""),
    [hide, setHide] = useState(true);
  const [instructions, setInstructions] = useState("");
  const [languages, setLanguages] = useState<string[]>(["ko"]);
  const [requestId, setRequestId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const refresh = async () => {
    const r = await listProjectIntakes();
    if (r.ok) mergeLatest(r.jobs);
    else setError(r.error);
  };
  useEffect(() => {
    const t = setInterval(() => {
      void listProjectIntakes()
        .then((r) => {
          if (r.ok) mergeLatest(r.jobs);
          else setError(r.error);
        })
        .catch(() =>
          setError(
            "상태 갱신이 지연되고 있습니다. 연결을 확인하거나 새로고침해 주세요.",
          ),
        );
    }, 10000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  function run(fn: () => Promise<void>) {
    setError("");
    start(async () => {
      try {
        await fn();
      } catch {
        setError("연결이 끊겼습니다. 입력은 유지되니 다시 시도해 주세요.");
      }
    });
  }
  return (
    <div className="space-y-5">
      <details
        open={composerOpen}
        onToggle={(e) => setComposerOpen(e.currentTarget.open)}
        className="rounded-xl border border-border"
      >
        <summary className="cursor-pointer p-4 font-semibold">
          + 새 공고 붙여넣기
        </summary>
        <form
          className="space-y-4 p-4 pt-0"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const id = requestId || crypto.randomUUID();
              setRequestId(id);
              const paths: string[] = [];
              if (files.length > 5) throw new Error("files");
              for (const f of files) {
                const r = await prepareIntakeUpload({
                  request_id: id,
                  mime: f.type,
                  size: f.size,
                });
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                const up = await getBrowserClient()
                  .storage.from("project-intake")
                  .uploadToSignedUrl(r.data.path, r.data.token, f, {
                    contentType: f.type,
                  });
                if (up.error) throw up.error;
                paths.push(r.data.path);
              }
              const r = await submitProjectIntake({
                request_id: id,
                source_raw: raw,
                source_paths: paths,
                languages,
                private_terms: terms
                  .split(/[,\n]/)
                  .map((s) => s.trim())
                  .filter(Boolean),
                hide_names: hide,
                operator_notes: instructions,
              });
              if (!r.ok) {
                setError(r.error);
                return;
              }
              setRaw("");
              setFiles([]);
              setInstructions("");
              setRequestId(null);
              setExpanded(r.id);
              setComposerOpen(false);
              if (fileInput.current) fileInput.current.value = "";
              await refresh();
            });
          }}
        >
          <label className="block">
            원문
            <textarea
              aria-label="원문"
              className={field}
              rows={7}
              maxLength={20000}
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                setRequestId(null);
              }}
              onPaste={(e) => {
                const pasted = Array.from(e.clipboardData.files).filter((f) =>
                  f.type.startsWith("image/"),
                );
                if (!pasted.length) return;
                e.preventDefault();
                if (files.length + pasted.length > 5) {
                  setError("최대 5장까지 첨부해 주세요.");
                  return;
                }
                setFiles([...files, ...pasted]);
                setRequestId(null);
              }}
              placeholder="카카오톡 대화나 모집 내용을 붙여넣으세요. 캡처 이미지도 Ctrl+V로 첨부할 수 있습니다."
            />
          </label>
          <label className="block">
            캡처 첨부{" "}
            <span className="text-xs text-ink-3">
              최대 5장 · 파일당 8MB · PNG/JPEG/WebP
            </span>
            <input
              ref={fileInput}
              className={field}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(e) => {
                const next = Array.from(e.target.files || []);
                if (next.length > 5) {
                  setError("최대 5장까지 선택해 주세요.");
                  e.target.value = "";
                  return;
                }
                setFiles(next);
                setRequestId(null);
              }}
            />
          </label>
          <p className="text-xs text-ink-3">
            {files.map((f) => f.name).join(" · ")}
          </p>
          <details className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-sm">
              언어·비공개 설정·작성 지침
            </summary>
            <div className="mt-3 space-y-3">
              <fieldset>
                <legend>공고·카드 언어 (선택 순서대로, 최대 4개)</legend>
                <div className="flex flex-wrap gap-3 mt-2">
                  {LANGUAGES.map((l) => (
                    <label key={l}>
                      <input
                        type="checkbox"
                        checked={languages.includes(l)}
                        onChange={(e) => {
                          setRequestId(null);
                          setLanguages((prev) =>
                            e.target.checked
                              ? [...prev, l].slice(0, 4)
                              : prev.filter((x) => x !== l),
                          );
                        }}
                      />{" "}
                      {labels[l]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block">
                <input
                  type="checkbox"
                  checked={hide}
                  onChange={(e) => {
                    setHide(e.target.checked);
                    setRequestId(null);
                  }}
                />{" "}
                회사·그룹·담당자 이름을 공개 문안에서 숨기기
              </label>
              <label className="block">
                추가로 숨길 명칭
                <input
                  className={field}
                  value={terms}
                  onChange={(e) => {
                    setTerms(e.target.value);
                    setRequestId(null);
                  }}
                  placeholder="쉼표로 구분해 입력"
                />
              </label>
              <label className="block">
                작성 지침 (선택)
                <textarea
                  className={field}
                  rows={3}
                  maxLength={3000}
                  value={instructions}
                  onChange={(e) => {
                    setInstructions(e.target.value);
                    setRequestId(null);
                  }}
                  placeholder="예: 회사명은 비공개로, 지원 한마디에 경력·포트폴리오·희망 레슨비와 단위를 받도록 안내해 주세요."
                />
              </label>
            </div>
          </details>
          <p className="text-xs text-ink-3">
            노출 순서:{" "}
            {languages.map((l, i) => `${i + 1}. ${labels[l]}`).join(" → ")} ·
            언어별 카드 2장
          </p>
          <button
            className={button}
            disabled={
              pending ||
              !languages.length ||
              (!files.length && raw.trim().length < 10)
            }
          >
            {pending ? "업로드·접수 중..." : "공고·카드 초안 준비"}
          </button>
          <p className="text-xs text-ink-3">
            내용을 정리하면 공고등록 양식에서 수정·발행할 수 있습니다.
            <br />
            원문과 캡처는 관리자만 열람하며, 소셜 게시물은 검토 후 별도로
            발행합니다.
          </p>
        </form>
      </details>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      <div className="flex justify-between">
        <h2 className="font-bold">
          준비함{" "}
          <span className="text-sm font-normal text-ink-3">
            · {jobs.length}건
          </span>
        </h2>
        <button onClick={() => run(refresh)} className="text-sm underline">
          새로고침
        </button>
      </div>
      {!jobs.length && (
        <p className="text-ink-3">아직 준비 중인 공고가 없습니다.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="준비함 검색"
          className={field + " min-w-0 flex-1"}
          placeholder="제목 또는 원문 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="상태 필터"
          className="rounded-md border border-border bg-background p-2 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">전체</option>
          <option value="busy">처리 중</option>
          <option value="review">검토 대기</option>
          <option value="registered">등록 완료</option>
          <option value="failed">확인 필요</option>
        </select>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {jobs
          .filter((job) => {
            const status = job.project_id ? "registered" : job.status;
            return (
              (filter === "all" ||
                (filter === "busy"
                  ? ["queued", "processing"].includes(job.status)
                  : status === filter)) &&
              (job.result?.project.title || job.source_raw)
                .toLowerCase()
                .includes(search.toLowerCase())
            );
          })
          .map((job) => (
            <li key={`${job.id}:${job.revision}`}>
              <Review
                job={job}
                refresh={refresh}
                now={now}
                expanded={expanded === job.id}
                toggle={() => setExpanded(expanded === job.id ? null : job.id)}
              />
            </li>
          ))}
      </ul>
      {hasMore && (
        <button
          type="button"
          className="w-full rounded-md border border-border p-3 text-sm"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const r = await listProjectIntakes(jobs.length);
              if (!r.ok) {
                setError(r.error);
                return;
              }
              setJobs((old) => [
                ...old,
                ...r.jobs.filter((j) => !old.some((o) => o.id === j.id)),
              ]);
              setHasMore(r.jobs.length === 30);
            })
          }
        >
          이전 공고 더 보기
        </button>
      )}
    </div>
  );
}
function Review({
  job,
  refresh,
  now,
  expanded,
  toggle,
}: {
  job: IntakeJob;
  refresh: () => Promise<void>;
  now: number;
  expanded: boolean;
  toggle: () => void;
}) {
  const [notes, setNotes] = useState(""),
    [pending, start] = useTransition(),
    [error, setError] = useState("");
  const progress = intakeProgress(job);
  const elapsed = now
    ? Math.max(0, Math.floor((now - Date.parse(job.created_at)) / 1000))
    : 0;
  const elapsedText =
    elapsed < 60
      ? `${elapsed}초`
      : `${Math.floor(elapsed / 60)}분 ${elapsed % 60}초`;
  const formUrl = job.project_id
    ? `/projects/${job.project_id}/edit`
    : `/projects/new?intake=${job.id}`;
  return (
    <article className="min-w-0">
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`details-${job.id}`}
          onClick={toggle}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span aria-hidden="true" className="text-ink-3">
            {expanded ? "▾" : "▸"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {job.result?.project.title ||
                job.source_raw.slice(0, 65) ||
                "새 공고 준비"}
            </span>
            <span className="mt-1 block text-xs text-ink-3">
              {formatIntakeDate(job.created_at)} ·{" "}
              {job.languages.map((l) => labels[l]).join(" / ")}
            </span>
          </span>
          <span
            className={`flex shrink-0 items-center gap-1 text-xs ${progress.failed ? "text-red-600" : "text-ink-2"}`}
          >
            {progress.busy && (
              <span
                className="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {progress.label}
          </span>
        </button>
      </div>
      {expanded && (
        <div
          id={`details-${job.id}`}
          className="space-y-4 border-t border-border bg-secondary/20 p-4"
        >
          <section
            aria-label="공고 준비 진행 상태"
            aria-busy={progress.busy}
            className="space-y-2 rounded-lg border border-border bg-background p-3"
          >
            <ol className="grid grid-cols-4 gap-2 text-[11px]">
              {progress.labels.map((label, i) => (
                <li
                  key={label}
                  aria-current={i === progress.stage ? "step" : undefined}
                >
                  <div
                    className={`mb-2 h-1.5 rounded-full ${i <= progress.stage ? "bg-foreground" : "bg-border"} ${progress.busy && i === progress.stage ? "animate-pulse motion-reduce:animate-none" : ""}`}
                  />
                  {i < progress.stage ? "✓ " : ""}
                  {label}
                </li>
              ))}
            </ol>
            <p role="status" aria-live="polite" className="text-sm">
              {progress.detail}
            </p>
            {progress.busy && (
              <p className="text-xs text-ink-3">
                접수 후 {now ? elapsedText : "확인 중"} · 캡처와 언어 수에 따라
                처리 시간이 달라집니다. 화면을 나가도 계속 처리합니다.
              </p>
            )}
            {job.status === "queued" && elapsed > 180 && (
              <p className="text-xs text-amber-700">
                접수 대기가 길어지고 있습니다. PC와 공고 처리기가 실행 중인지
                확인해 주세요.
              </p>
            )}
          </section>
          {job.error && (
            <p role="alert" className="text-sm text-red-600">
              {job.error}
            </p>
          )}
          {job.result?.project && (
            <Link className={button + " inline-block"} href={formUrl}>
              {job.project_id
                ? "등록한 공고 수정 →"
                : "공고등록 양식에서 수정·발행 →"}
            </Link>
          )}
          {job.result?.missing.length ? (
            <details className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-sm">
                확인할 내용 · {job.result.missing.length}개
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {job.result.missing.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <details className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-sm">원문·추출 근거</summary>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {job.source_urls?.map(
                (s, i) =>
                  s.url && (
                    <a
                      key={s.path}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={s.url}
                        alt={`원본 캡처 ${i + 1}`}
                        className="max-h-64 w-full rounded-md object-contain"
                      />
                    </a>
                  ),
              )}
            </div>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm">
              {job.source_raw}
              {"\n"}
              {job.result?.source_transcript}
            </pre>
            {job.result?.evidence.map((e, i) => (
              <p key={i} className="mt-2 text-xs">
                {e.field}: {e.quote}
              </p>
            ))}
          </details>
          {!!job.result?.decks.length && job.result.pay_policy !== "omit" && (
            <p className="rounded-lg border border-amber-300 p-3 text-sm">
              이전에 만든 카드에는 페이가 포함될 수 있어 미리보기·복사를
              숨겼습니다. 아래 수정 지침에 ‘페이 제외’를 입력해 다시 준비해
              주세요.
            </p>
          )}
          {!!job.result?.decks.length && job.result.pay_policy === "omit" && (
            <details className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-sm">
                카드·게시글 초안 · {job.assets.length}장
              </summary>
              <p className="mt-2 text-xs text-ink-3">
                추출 시점의 초안입니다. 등록 양식에서 내용을 바꿨다면 게시 전에
                카드와 캡션도 확인해 주세요.
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {job.result.decks.map((deck) => (
                  <section key={deck.language} className="min-w-0 space-y-2">
                    <h4 className="text-sm font-semibold">
                      {labels[deck.language]} · 카드 2장
                    </h4>
                    <div className="grid max-w-sm grid-cols-2 gap-2">
                      {job.assets
                        .filter((a) => a.language === deck.language)
                        .map((a) => (
                          <a
                            key={a.path}
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <img
                              src={a.url}
                              alt={`${labels[deck.language]} 카드 ${a.index + 1}`}
                              className="w-full rounded-md border border-border"
                            />
                          </a>
                        ))}
                    </div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-secondary p-3 text-xs">
                      {deck.caption}
                    </pre>
                    <button
                      type="button"
                      className="text-xs underline"
                      onClick={() =>
                        void navigator.clipboard.writeText(deck.caption)
                      }
                    >
                      캡션 복사
                    </button>
                  </section>
                ))}
              </div>
            </details>
          )}
          {["review", "failed"].includes(job.status) && !job.project_id && (
            <details
              className="rounded-lg border border-border p-3"
              open={job.status === "failed"}
            >
              <summary className="cursor-pointer text-sm">
                수정 지침으로 다시 준비
              </summary>
              <label className="mt-3 block text-sm">
                수정 요청
                <textarea
                  className={field}
                  value={notes}
                  maxLength={3000}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="확인한 조건이나 표현 수정 내용을 적어 주세요."
                />
              </label>
              <button
                type="button"
                className={button + " mt-2"}
                disabled={pending}
                onClick={() => {
                  setError("");
                  start(async () => {
                    try {
                      const r = await reviseProjectIntake({
                        id: job.id,
                        revision: job.revision,
                        notes,
                        project: job.result?.project || null,
                      });
                      if (!r.ok) setError(r.error);
                      else await refresh();
                    } catch {
                      setError("연결을 확인하고 다시 시도해 주세요.");
                    }
                  });
                }}
              >
                {pending
                  ? "요청 중..."
                  : job.status === "failed"
                    ? "다시 시도"
                    : "수정 반영 · 카드 다시 만들기"}
              </button>
            </details>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
