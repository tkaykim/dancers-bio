"use client";
/* eslint-disable @next/next/no-img-element -- Private signed preview images. */
import { useState, useEffect, useTransition, useRef } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase/browser";
import type { IntakeJob } from "@/lib/project-intake/db";
import { LANGUAGES, type ProjectDraft } from "@/lib/project-intake/schema";
import {
  prepareIntakeUpload,
  submitProjectIntake,
  listProjectIntakes,
  reviseProjectIntake,
  registerProjectIntake,
} from "@/app/actions/project-intake";
const labels: Record<string, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  zh: "中文",
  th: "ไทย",
  id: "Indonesia",
};
const statuses: Record<string, string> = {
  queued: "처리 대기",
  processing: "공고·카드 생성 중",
  review: "검토 대기",
  failed: "확인 필요",
  registered: "등록 완료",
};
const field =
  "w-full rounded-md border border-border bg-background p-3 text-sm";
const button =
  "rounded-md bg-foreground px-4 py-2 text-sm text-background disabled:opacity-40";
export function IntakeConsole({
  initialJobs,
  initialError,
}: {
  initialJobs: IntakeJob[];
  initialError: string;
}) {
  const [jobs, setJobs] = useState(initialJobs),
    [error, setError] = useState(initialError),
    [pending, start] = useTransition();
  const [raw, setRaw] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [terms, setTerms] = useState(""),
    [hide, setHide] = useState(true);
  const [instructions, setInstructions] = useState("");
  const [languages, setLanguages] = useState<string[]>(["ko"]);
  const [requestId, setRequestId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const refresh = async () => {
    const r = await listProjectIntakes();
    if (r.ok) setJobs(r.jobs);
    else setError(r.error);
  };
  useEffect(() => {
    const t = setInterval(() => {
      void listProjectIntakes().then((r) => {
        if (r.ok) setJobs(r.jobs);
      });
    }, 10000);
    return () => clearInterval(t);
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
    <div className="space-y-8">
      <form
        className="space-y-4 rounded-xl border border-border p-4"
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
          공고·카드 초안 준비
        </button>
        <p className="text-xs text-ink-3">
          로컬 처리기가 실행 중일 때 순서대로 처리합니다.
          <br />
          원문과 캡처는 관리자만 열람하며, 소셜 게시물은 검토 후 별도로
          발행합니다.
        </p>
      </form>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      <div className="flex justify-between">
        <h2 className="font-bold">준비함</h2>
        <button onClick={() => run(refresh)} className="text-sm underline">
          새로고침
        </button>
      </div>
      {!jobs.length && (
        <p className="text-ink-3">아직 준비 중인 공고가 없습니다.</p>
      )}
      {jobs.map((job) => (
        <Review key={`${job.id}:${job.revision}`} job={job} refresh={refresh} />
      ))}
    </div>
  );
}
function Review({
  job,
  refresh,
}: {
  job: IntakeJob;
  refresh: () => Promise<void>;
}) {
  const [project, setProject] = useState<ProjectDraft | null>(
      job.result?.project || null,
    ),
    [notes, setNotes] = useState(""),
    [dirty, setDirty] = useState(false),
    [pending, start] = useTransition(),
    [error, setError] = useState("");
  // Mount the editor only when the worker has returned its immutable revision.
  const draft = project || job.result?.project;
  const change = (key: keyof ProjectDraft, value: unknown) => {
    if (draft) {
      setProject({ ...draft, [key]: value });
      setDirty(true);
    }
  };
  return (
    <article className="space-y-4 rounded-xl border border-border p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="font-semibold">
          {job.result?.project.title || "새 공고 준비"}
        </h3>
        <span className="text-sm">
          {statuses[job.status]} · v{job.revision}
        </span>
      </div>
      <p className="text-xs text-ink-3">
        {new Date(job.created_at).toLocaleString("ko-KR")} ·{" "}
        {job.languages.map((l) => labels[l]).join(" → ")}
      </p>
      {job.error && (
        <p role="alert" className="text-red-600">
          {job.error}
        </p>
      )}
      {job.status === "queued" && (
        <p className="text-sm text-ink-3">
          대기가 길어지면 로컬 공고 처리기의 실행 상태를 확인해 주세요.
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-sm">
          원문·추출 근거 보기
        </summary>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {job.source_urls?.map(
            (s, i) =>
              s.url && (
                <a key={s.path} href={s.url} target="_blank" rel="noreferrer">
                  <img
                    src={s.url}
                    alt={`원본 캡처 ${i + 1}`}
                    className="w-full rounded-md"
                  />
                </a>
              ),
          )}
        </div>
        <pre className="mt-2 whitespace-pre-wrap break-words text-sm">
          {job.source_raw}
          {"\n"}
          {job.result?.source_transcript}
        </pre>
        {job.result?.evidence.map((e, i) => (
          <p key={i} className="text-xs mt-2">
            {e.field}: {e.quote}
          </p>
        ))}
      </details>
      {job.result?.missing.length ? (
        <div className="rounded-md bg-secondary p-3 text-sm">
          확인할 내용
          <ul className="list-disc pl-5">
            {job.result.missing.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {draft && (
        <fieldset
          disabled={job.status !== "review" || pending}
          className="space-y-3"
        >
          <label className="block">
            제목
            <input
              className={field}
              value={draft.title}
              maxLength={120}
              onChange={(e) => change("title", e.target.value)}
            />
          </label>
          <label className="block">
            공고 본문
            <textarea
              className={field}
              rows={12}
              maxLength={2000}
              value={draft.description}
              onChange={(e) => change("description", e.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              카테고리
              <select
                className={field}
                value={draft.category}
                onChange={(e) => change("category", e.target.value)}
              >
                {Object.entries({
                  performance: "공연",
                  choreography: "안무제작",
                  instructor: "강사",
                  broadcast: "방송",
                  advertisement: "광고",
                  event: "행사",
                  video: "영상촬영",
                  other: "기타",
                }).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              지역
              <input
                className={field}
                value={draft.region_text || ""}
                onChange={(e) => change("region_text", e.target.value || null)}
              />
            </label>
            <label>
              페이 단위
              <select
                className={field}
                value={draft.pay_type || ""}
                onChange={(e) => change("pay_type", e.target.value || null)}
              >
                <option value="">미정</option>
                <option value="negotiable">협의</option>
                <option value="total">총액</option>
                <option value="per_session">회차당</option>
              </select>
            </label>
            <label>
              금액
              <input
                type="number"
                min={0}
                max={1000000000}
                className={field}
                value={draft.pay_amount ?? ""}
                onChange={(e) =>
                  change(
                    "pay_amount",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              />
            </label>
            <label>
              모집 인원
              <input
                type="number"
                min={1}
                max={999}
                className={field}
                value={draft.recruitment_count}
                onChange={(e) =>
                  change("recruitment_count", Number(e.target.value))
                }
              />
            </label>
            <label>
              공개 범위
              <select
                className={field}
                value={draft.visibility}
                onChange={(e) => change("visibility", e.target.value)}
              >
                <option value="public">공개</option>
                <option value="private">링크로만 접근</option>
              </select>
            </label>
          </div>
          <p className="text-sm">
            마감:{" "}
            {draft.application_deadline
              ? new Date(draft.application_deadline).toLocaleString("ko-KR")
              : "미정"}{" "}
            · 장르: {draft.genre_slug || "미정"}
          </p>
          {(
            [
              ["recruitment_unlimited", "모집 인원 제한 없음"],
              ["collect_applicant_fee", "희망 단가 제출 받기"],
              ["collect_casting_details", "캐스팅 상세정보 받기"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="mr-4 inline-block text-sm">
              <input
                type="checkbox"
                checked={draft[key]}
                onChange={(e) => change(key, e.target.checked)}
              />{" "}
              {label}
            </label>
          ))}
        </fieldset>
      )}
      {job.result?.decks.map((deck) => (
        <section key={deck.language} className="space-y-2">
          <h4 className="font-semibold">{labels[deck.language]} · 카드 2장</h4>
          <div className="grid grid-cols-2 gap-3">
            {job.assets
              .filter((a) => a.language === deck.language)
              .map((a) => (
                <a key={a.path} href={a.url} target="_blank" rel="noreferrer">
                  <img
                    src={a.url}
                    alt={`${labels[deck.language]} 카드 ${a.index + 1}`}
                    className="w-full rounded-md border border-border"
                  />
                </a>
              ))}
          </div>
          <pre className="whitespace-pre-wrap break-words rounded-md bg-secondary p-3 text-sm">
            {deck.caption}
          </pre>
          <button
            className="text-sm underline"
            onClick={() => void navigator.clipboard.writeText(deck.caption)}
          >
            캡션 복사
          </button>
        </section>
      ))}
      {["review", "failed"].includes(job.status) && (
        <div className="space-y-3">
          <label className="block">
            수정 요청
            <textarea
              className={field}
              value={notes}
              maxLength={3000}
              onChange={(e) => {
                setNotes(e.target.value);
                setDirty(true);
              }}
              placeholder="추가로 확인된 일정, 마감, 표현 수정 등을 적어 주세요."
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              className={button}
              disabled={pending}
              onClick={() => {
                setError("");
                start(async () => {
                  const r = await reviseProjectIntake({
                    id: job.id,
                    revision: job.revision,
                    notes,
                    project: draft || null,
                  });
                  if (!r.ok) setError(r.error);
                  else await refresh();
                });
              }}
            >
              {job.status === "failed"
                ? "다시 시도"
                : "수정 반영 · 카드 다시 만들기"}
            </button>
            {job.status === "review" && (
              <button
                className={button}
                disabled={dirty || pending}
                onClick={() => {
                  setError("");
                  start(async () => {
                    const r = await registerProjectIntake({
                      id: job.id,
                      revision: job.revision,
                    });
                    if (!r.ok) setError(r.error);
                    else await refresh();
                  });
                }}
              >
                검토 완료 · 공고 임시저장 등록
              </button>
            )}
          </div>
          {dirty && (
            <p className="text-sm text-ink-3">
              변경 내용을 반영해 카드를 다시 만든 뒤 등록해 주세요.
            </p>
          )}
        </div>
      )}
      {job.project_code && (
        <Link className="underline" href={`/projects/${job.project_code}`}>
          등록된 공고 보기 →
        </Link>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
    </article>
  );
}
