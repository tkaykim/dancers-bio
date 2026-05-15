"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProjectAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SESSION_TYPE_LABELS,
  STATUS_LABELS,
} from "@/lib/validation/projects";

type Lookup = { id: string; label_ko: string }[];

type SessionRow = {
  type: keyof typeof SESSION_TYPE_LABELS;
  starts_at: string;
  location_name: string;
  role_notes: string;
};

export type ProjectEditInitial = {
  id: string;
  title: string;
  description: string;
  visibility: "public" | "private";
  status: keyof typeof STATUS_LABELS;
  genre_id: string | null;
  region_text: string | null;
  pay_amount: number | null;
  pay_type: "per_session" | "total" | "negotiable" | null;
  recruitment_count: number;
  allow_team_apply: boolean;
  application_deadline: string | null;
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ProjectEditForm({
  initial,
  initialSessions,
  genres,
}: {
  initial: ProjectEditInitial;
  initialSessions: Array<{
    session_type: keyof typeof SESSION_TYPE_LABELS;
    starts_at: string;
    location_name: string | null;
    role_notes: string | null;
  }>;
  genres: Lookup;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [sessions, setSessions] = useState<SessionRow[]>(
    initialSessions.length > 0
      ? initialSessions.map((s) => ({
          type: s.session_type,
          starts_at: toLocalInput(s.starts_at),
          location_name: s.location_name ?? "",
          role_notes: s.role_notes ?? "",
        }))
      : [
          {
            type: "main",
            starts_at: "",
            location_name: "",
            role_notes: "",
          },
        ],
  );
  const [payDisplay, setPayDisplay] = useState<string>(
    initial.pay_amount !== null ? initial.pay_amount.toLocaleString("ko-KR") : "",
  );

  function onPayChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/[^\d]/g, "");
    if (!digits) {
      setPayDisplay("");
      return;
    }
    const trimmed = digits.slice(0, 10);
    setPayDisplay(Number(trimmed).toLocaleString("ko-KR"));
  }

  function updateSession(i: number, patch: Partial<SessionRow>) {
    setSessions((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function addSession() {
    setSessions((prev) => [
      ...prev,
      { type: "main", starts_at: "", location_name: "", role_notes: "" },
    ]);
  }

  function removeSession(i: number) {
    setSessions((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <form
      action={(formData) => {
        setError(null);
        const payRaw = (formData.get("pay_amount") ?? "").toString();
        formData.set("pay_amount", payRaw.replace(/[^\d]/g, ""));
        formData.set(
          "allow_team_apply",
          formData.get("allow_team_apply") === "on" ? "true" : "false",
        );
        formData.set("sessions_count", String(sessions.length));
        sessions.forEach((s, i) => {
          formData.set(`sessions[${i}][type]`, s.type);
          formData.set(`sessions[${i}][starts_at]`, s.starts_at);
          formData.set(`sessions[${i}][location_name]`, s.location_name);
          formData.set(`sessions[${i}][role_notes]`, s.role_notes);
        });
        startTransition(async () => {
          const result = await updateProjectAction(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push(`/projects/${result.data!.id}`);
          router.refresh();
        });
      }}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="id" value={initial.id} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="title">제목</Label>
        <Input
          id="title"
          name="title"
          required
          maxLength={120}
          defaultValue={initial.title}
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
          defaultValue={initial.description}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="genre_id">장르</Label>
          <select
            id="genre_id"
            name="genre_id"
            defaultValue={initial.genre_id ?? ""}
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
            defaultValue={initial.region_text ?? ""}
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
            defaultValue={initial.pay_type ?? ""}
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
            defaultValue={initial.recruitment_count}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="application_deadline">지원 마감 (선택)</Label>
          <Input
            id="application_deadline"
            name="application_deadline"
            type="datetime-local"
            defaultValue={toLocalInput(initial.application_deadline)}
          />
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-md border border-border bg-card p-3 text-sm">
        <input
          type="checkbox"
          name="allow_team_apply"
          defaultChecked={initial.allow_team_apply}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          <span className="font-semibold">팀 지원 허용</span>
          <span className="block text-xs text-muted-foreground">
            체크 시 댄스팀이 팀 명의로 지원하거나 제안받을 수 있습니다.
          </span>
        </span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="visibility">공개 범위</Label>
          <select
            id="visibility"
            name="visibility"
            defaultValue={initial.visibility}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="public">공개</option>
            <option value="private">비공개</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="status">상태</Label>
          <select
            id="status"
            name="status"
            defaultValue={initial.status}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
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

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="flex-1"
          onClick={() => router.push(`/projects/${initial.id}`)}
        >
          취소
        </Button>
        <Button type="submit" disabled={pending} size="lg" className="flex-1">
          {pending ? "저장 중..." : "저장"}
        </Button>
      </div>
    </form>
  );
}
