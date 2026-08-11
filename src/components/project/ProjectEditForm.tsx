"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProjectAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  STATUS_LABELS,
  PROJECT_CATEGORY_LABELS,
  PROJECT_CATEGORY_ORDER,
  type ProjectCategory,
} from "@/lib/validation/projects";

type Lookup = { id: string; label_ko: string }[];

export type ProjectEditInitial = {
  id: string;
  short_code: string;
  title: string;
  description: string;
  visibility: "public" | "private";
  status: keyof typeof STATUS_LABELS;
  category: ProjectCategory | null;
  genre_id: string | null;
  region_text: string | null;
  pay_amount: number | null;
  pay_type: "per_session" | "total" | "negotiable" | null;
  recruitment_count: number;
  application_deadline: string | null;
  collect_applicant_fee: boolean;
  collect_casting_details: boolean;
  posted_by_label: string | null;
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
  genres,
}: {
  initial: ProjectEditInitial;
  genres: Lookup;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [payDisplay, setPayDisplay] = useState<string>(
    initial.pay_amount !== null ? initial.pay_amount.toLocaleString("ko-KR") : "",
  );
  const [category, setCategory] = useState<ProjectCategory | "">(
    initial.category ?? "",
  );
  const [collectFee, setCollectFee] = useState(initial.collect_applicant_fee);
  const [collectCastingDetails, setCollectCastingDetails] = useState(
    initial.collect_casting_details,
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

  return (
    <form
      action={(formData) => {
        setError(null);
        const payRaw = (formData.get("pay_amount") ?? "").toString();
        formData.set("pay_amount", payRaw.replace(/[^\d]/g, ""));
        formData.set("category", category);
        startTransition(async () => {
          const result = await updateProjectAction(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push(`/projects/${initial.short_code}`);
          router.refresh();
        });
      }}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="id" value={initial.id} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="title">제목</Label>
        <Input id="title" name="title" required maxLength={120} defaultValue={initial.title} />
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

      <label className="flex flex-col gap-1 rounded-xl border border-border p-4">
        <span className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="collect_applicant_fee"
            checked={collectFee}
            onChange={(e) => setCollectFee(e.target.checked)}
            className="h-4 w-4"
          />
          지원자에게 단가(견적) 제출 받기
        </span>
        <span className="ml-6 text-xs text-muted-foreground">
          {collectFee
            ? "지원 시 댄서가 본인 단가를 적어 제출합니다. 잘 모르면 '협의 희망'으로도 낼 수 있어요. 단가는 운영자만 봅니다."
            : "켜면 위 고정 페이 대신, 지원자가 각자 단가를 불러서 제출하는 공고가 됩니다."}
        </span>
      </label>

      <label className="flex flex-col gap-1 rounded-xl border border-border p-4">
        <span className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="collect_casting_details"
            checked={collectCastingDetails}
            onChange={(e) => setCollectCastingDetails(e.target.checked)}
            className="h-4 w-4"
          />
          상세 캐스팅 정보 필수로 받기
        </span>
        <span className="ml-6 text-xs text-muted-foreground">
          이름·출생연도·키·주 장르·춤 영상·백업댄서 이력을 필수로 받고,
          개인 프로필은 보유한 경우 함께 받습니다.
        </span>
      </label>

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

      <div className="flex flex-col gap-2">
        <Label htmlFor="posted_by_label">등록자 표시</Label>
        <Input
          id="posted_by_label"
          name="posted_by_label"
          type="text"
          maxLength={80}
          defaultValue={initial.posted_by_label ?? ""}
          placeholder="예: 본인 / 회사 / 의뢰인"
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          비워두면 관리자 계정의 표시 이름이 사용됩니다.
        </p>
      </div>

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

      <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-4 text-xs leading-relaxed text-ink-2">
        <p className="mb-1 text-sm font-semibold text-foreground">일정</p>
        일정 추가·삭제·시간 변경은 <b>지원자 콘솔의 「일정 가능여부」</b>에서
        관리합니다. (여기서 수정하지 않습니다 — 이미 받은 지원자 응답을 보호하기
        위함)
      </div>

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
          onClick={() => router.push(`/projects/${initial.short_code}`)}
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
