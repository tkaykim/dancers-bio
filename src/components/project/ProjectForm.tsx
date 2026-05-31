"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProjectAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SESSION_TYPE_LABELS,
  PROJECT_CATEGORY_LABELS,
  PROJECT_CATEGORY_ORDER,
  type ProjectCategory,
} from "@/lib/validation/projects";

type Lookup = { id: string; label_ko: string }[];

type SessionRow = {
  type: keyof typeof SESSION_TYPE_LABELS;
  starts_at: string;
  location_name: string;
  role_notes: string;
};

const emptySession: SessionRow = {
  type: "main",
  starts_at: "",
  location_name: "",
  role_notes: "",
};

export function ProjectForm({
  genres,
}: {
  genres: Lookup;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [sessions, setSessions] = useState<SessionRow[]>([{ ...emptySession }]);
  const [payDisplay, setPayDisplay] = useState<string>("");
  const [category, setCategory] = useState<ProjectCategory | "">("");
  const [isStandingPool, setIsStandingPool] = useState(false);

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

  function updateSession(i: number, patch: Partial<SessionRow>) {
    setSessions((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function addSession() {
    setSessions((prev) => [...prev, { ...emptySession }]);
  }

  function removeSession(i: number) {
    setSessions((prev) => prev.filter((_, idx) => idx !== i));
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
        // attach sessions
        formData.set("sessions_count", String(sessions.length));
        sessions.forEach((s, i) => {
          formData.set(`sessions[${i}][type]`, s.type);
          formData.set(`sessions[${i}][starts_at]`, s.starts_at);
          formData.set(`sessions[${i}][location_name]`, s.location_name);
          formData.set(`sessions[${i}][role_notes]`, s.role_notes);
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
          <legend className="text-sm font-semibold">일정</legend>
          <button
            type="button"
            onClick={addSession}
            className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
          >
            + 추가
          </button>
        </div>
        {sessions.map((s, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-md border border-border bg-secondary/40 p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-2">#{i + 1}</span>
              {sessions.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeSession(i)}
                  className="text-xs text-destructive hover:underline"
                >
                  제거
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={s.type}
                onChange={(e) =>
                  updateSession(i, {
                    type: e.target.value as SessionRow["type"],
                  })
                }
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {Object.entries(SESSION_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <Input
                type="datetime-local"
                value={s.starts_at}
                onChange={(e) =>
                  updateSession(i, { starts_at: e.target.value })
                }
                required
              />
            </div>
            <Input
              placeholder="장소 (선택)"
              value={s.location_name}
              onChange={(e) =>
                updateSession(i, { location_name: e.target.value })
              }
              maxLength={120}
            />
            <Input
              placeholder="역할 메모 (선택)"
              value={s.role_notes}
              onChange={(e) => updateSession(i, { role_notes: e.target.value })}
              maxLength={500}
            />
          </div>
        ))}
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
