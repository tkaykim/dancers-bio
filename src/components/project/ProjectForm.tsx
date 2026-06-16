"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProjectAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PROJECT_CATEGORY_LABELS,
  PROJECT_CATEGORY_ORDER,
  type ProjectCategory,
} from "@/lib/validation/projects";
import {
  uploadProjectFileFromBrowser,
  type UploadedProjectFile,
} from "@/lib/storage/upload-project-file";
import { formatBytes } from "@/lib/storage/dancer-portfolio-file";

type Lookup = { id: string; label_ko: string }[];

// 일정 (project_schedules). 모든 일정이 가능여부 조사 대상.
type ScheduleDraft = {
  label: string;
  date: string;
  start: string;
  end: string;
  location: string;
};

const emptyScheduleDraft: ScheduleDraft = {
  label: "",
  date: "",
  start: "",
  end: "",
  location: "",
};

export function ProjectForm({
  genres,
}: {
  genres: Lookup;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [schedules, setSchedules] = useState<ScheduleDraft[]>([]);
  const [payDisplay, setPayDisplay] = useState<string>("");
  const [category, setCategory] = useState<ProjectCategory | "">("");
  const [isStandingPool, setIsStandingPool] = useState(false);
  const [attachments, setAttachments] = useState<UploadedProjectFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setAttachError(null);
    setUploading(true);
    for (const file of files) {
      if (attachments.length >= 10) {
        setAttachError("첨부는 최대 10개까지 가능합니다.");
        break;
      }
      const res = await uploadProjectFileFromBrowser(file);
      if (!res.ok) {
        setAttachError(res.error);
        continue;
      }
      setAttachments((prev) => [...prev, res.file]);
    }
    setUploading(false);
  }

  function removeAttachment(i: number) {
    setAttachments((prev) => prev.filter((_, idx) => idx !== i));
  }

  function onPayChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/[^\d]/g, "");
    if (!digits) {
      setPayDisplay("");
      return;
    }
    // Cap at 1,000,000,000 to match validation
    const trimmed = digits.slice(0, 10);
    const num = Number(trimmed);
    setPayDisplay(num.toLocaleString("ko-KR"));
  }

  function updateSchedule(i: number, patch: Partial<ScheduleDraft>) {
    setSchedules((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function addSchedule() {
    setSchedules((prev) => [...prev, { ...emptyScheduleDraft }]);
  }

  function removeSchedule(i: number) {
    setSchedules((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <form
      action={(formData) => {
        setError(null);
        // strip thousand separators from pay before submit
        const payRaw = (formData.get("pay_amount") ?? "").toString();
        formData.set("pay_amount", payRaw.replace(/[^\d]/g, ""));
        // attach category (chip-based state, not a native input)
        formData.set("category", category);
        // attach uploaded reference files (metadata JSON)
        formData.set("attachments", JSON.stringify(attachments));
        // attach schedules (모든 일정 = 가능여부 조사 대상). 시간 비우면 time_tbd(날짜만).
        const validSchedules = schedules.filter((s) => s.label.trim() && s.date);
        formData.set("schedules_count", String(validSchedules.length));
        validSchedules.forEach((s, i) => {
          const tbd = !s.start;
          formData.set(`schedules[${i}][label]`, s.label.trim());
          formData.set(
            `schedules[${i}][starts_at]`,
            `${s.date}T${s.start || "00:00"}:00+09:00`,
          );
          formData.set(
            `schedules[${i}][ends_at]`,
            !tbd && s.end ? `${s.date}T${s.end}:00+09:00` : "",
          );
          formData.set(`schedules[${i}][time_tbd]`, tbd ? "true" : "false");
          formData.set(`schedules[${i}][location]`, s.location.trim());
        });
        startTransition(async () => {
          const result = await createProjectAction(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push(`/projects/${result.data!.short_code}`);
          router.refresh();
        });
      }}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">제목</Label>
        <Input
          id="title"
          name="title"
          required
          maxLength={120}
          placeholder="예: NewJeans Hyein 솔로 무대 댄서 4인 구인"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">상세 설명</Label>
        <textarea
          id="description"
          name="description"
          rows={5}
          required
          minLength={10}
          maxLength={2000}
          placeholder="역할, 컨셉, 의상, 자격 요건 등을 자세히 적어주세요. (10자 이상)"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="project-files">참고자료 첨부 (선택)</Label>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background px-4 py-6 text-sm text-ink-2 hover:border-foreground/40">
          <input
            id="project-files"
            type="file"
            multiple
            accept=".pdf,image/*,video/mp4"
            onChange={onPickFiles}
            disabled={uploading}
            className="hidden"
          />
          {uploading ? "업로드 중..." : "+ 파일 선택 (PDF·이미지·영상 · 최대 50MB)"}
        </label>
        {attachments.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {attachments.map((a, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm"
              >
                <span className="leading-none">📄</span>
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <span className="shrink-0 text-[11px] text-ink-3">
                  {formatBytes(a.size)}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="shrink-0 text-xs text-destructive hover:underline"
                >
                  제거
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {attachError ? (
          <p className="text-xs text-destructive">{attachError}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          기획안·구성안 등 참고자료를 첨부하면 공고 상세에서 바로 열람·다운로드됩니다.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label>프로젝트 종류</Label>
        <div className="flex flex-wrap gap-1.5">
          {PROJECT_CATEGORY_ORDER.map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(active ? "" : c)}
                aria-pressed={active}
                className={
                  active
                    ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                    : "rounded-full border border-border bg-background px-3 py-1 text-xs text-ink-2 hover:border-foreground/40 hover:text-foreground"
                }
              >
                {PROJECT_CATEGORY_LABELS[c]}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">하나만 선택 (다시 누르면 해제)</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="genre_id">장르</Label>
          <select
            id="genre_id"
            name="genre_id"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">선택 안 함</option>
            {genres.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label_ko}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="region_text">지역</Label>
          <Input
            id="region_text"
            name="region_text"
            type="text"
            maxLength={100}
            placeholder="예: 서울 강남구"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="pay_amount">페이 (KRW)</Label>
          <Input
            id="pay_amount"
            name="pay_amount"
            type="text"
            inputMode="numeric"
            value={payDisplay}
            onChange={onPayChange}
            placeholder="예: 1,800,000"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pay_type">지급 단위</Label>
          <select
            id="pay_type"
            name="pay_type"
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
            name="recruitment_count"
            type="number"
            min={1}
            max={999}
            defaultValue={1}
            required
          />
          <p className="text-xs text-muted-foreground">
            인원이 모두 수락되면 마감 여부를 묻는 안내가 뜹니다.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="application_deadline">지원 마감 (선택)</Label>
          <Input
            id="application_deadline"
            name="application_deadline"
            type="datetime-local"
            disabled={isStandingPool}
            className={isStandingPool ? "opacity-50" : undefined}
          />
          {isStandingPool ? (
            <p className="text-xs text-muted-foreground">
              상시 섭외풀은 마감일이 없습니다.
            </p>
          ) : null}
        </div>
      </div>

      <label className="flex flex-col gap-1 rounded-xl border border-border p-4">
        <span className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="is_standing_pool"
            checked={isStandingPool}
            onChange={(e) => setIsStandingPool(e.target.checked)}
            className="h-4 w-4"
          />
          상시 섭외풀로 등록 (마감 없음 · 지원자는 풀에 적재)
        </span>
        <span className="ml-6 text-xs text-muted-foreground">
          특정 일정 없이 상시로 지원을 받아 인재 풀을 쌓습니다. 마감일은 무시됩니다.
        </span>
      </label>

      <div className="flex flex-col gap-2">
        <Label htmlFor="posted_by_label">등록자 표시명 (선택)</Label>
        <Input
          id="posted_by_label"
          name="posted_by_label"
          type="text"
          maxLength={80}
          placeholder="예: ABC 엔터테인먼트 / 김OO 안무가"
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          공고 카드·상세에 노출되는 등록자 이름입니다. 비워두면 관리자 표시명으로 노출됩니다.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="visibility">공개 범위</Label>
        <select
          id="visibility"
          name="visibility"
          defaultValue="public"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="public">공개 — 누구나 지원 가능</option>
          <option value="private">비공개 — 다이렉트 제안받은 사람만</option>
        </select>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <div className="flex items-center justify-between">
          <legend className="text-sm font-semibold">일정 (선택)</legend>
          <button
            type="button"
            onClick={addSchedule}
            className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
          >
            + 추가
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          연습·촬영 등 일정을 넣어두면 개설 후 지원자(대기·수락)에게 가능여부를
          물어볼 수 있어요. 시간을 비우면 &apos;시간 미정&apos;(날짜만)으로
          등록되고, 장소는 지원자에게 비공개입니다.
        </p>
        {schedules.length === 0 ? null : (
          schedules.map((s, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-md border border-border bg-secondary/40 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-2">#{i + 1}</span>
                <button
                  type="button"
                  onClick={() => removeSchedule(i)}
                  className="text-xs text-destructive hover:underline"
                >
                  제거
                </button>
              </div>
              <Input
                placeholder="일정 제목 (예: 1차 오디션 겸 연습)"
                value={s.label}
                onChange={(e) => updateSchedule(i, { label: e.target.value })}
                maxLength={120}
              />
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={s.date}
                  onChange={(e) => updateSchedule(i, { date: e.target.value })}
                  className="flex-1"
                />
                <Input
                  type="time"
                  value={s.start}
                  onChange={(e) => updateSchedule(i, { start: e.target.value })}
                  className="w-24"
                />
                <span className="self-center text-ink-3">~</span>
                <Input
                  type="time"
                  value={s.end}
                  onChange={(e) => updateSchedule(i, { end: e.target.value })}
                  className="w-24"
                />
              </div>
              <Input
                placeholder="장소 (선택)"
                value={s.location}
                onChange={(e) => updateSchedule(i, { location: e.target.value })}
                maxLength={120}
              />
            </div>
          ))
        )}
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="publish_now"
          defaultChecked
          className="h-4 w-4"
        />
        지금 바로 공개하기 (체크 해제 시 임시저장)
      </label>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} size="lg">
        {pending ? "개설 중..." : "프로젝트 개설하기"}
      </Button>
    </form>
  );
}
