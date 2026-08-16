"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";

import { updateVillageWaitlistAction } from "@/app/actions/village";
import { isVillageTestRow } from "@/lib/village/test-row";
import { cn } from "@/lib/utils";

export type VillageRow = {
  id: string;
  created_at: string;
  interested: boolean;
  name: string | null;
  nationality: string | null;
  nationality_code: string | null;
  contact_type: string | null;
  contact: string | null;
  preferred_option: string | null;
  room_preference: string | null;
  move_in_month: string | null;
  message: string | null;
  decline_reasons: string[] | null;
  decline_reason_detail: string | null;
  lang: string;
  status: string;
  memo: string | null;
  deposit_status: string | null;
  deposit_amount_krw: number | null;
  deposit_paid_at: string | null;
  visa_application_id: string | null;
};

const STATUSES = ["new", "contacted", "converted", "closed"] as const;

const STATUS_LABEL: Record<string, string> = {
  new: "신규",
  contacted: "연락함",
  converted: "입주 확정",
  closed: "종료",
};

const OPTION_LABEL: Record<string, string> = {
  a: "옵션 A (월 50만)",
  b: "옵션 B (월 60만)",
  either: "둘 다 괜찮음",
  undecided: "미정",
};

const ROOM_LABEL: Record<string, string> = {
  single: "1인실",
  double: "2인실",
  quad: "4인실",
  six: "6인실",
  any: "상관없음",
};

const DECLINE_LABEL: Record<string, string> = {
  price: "비용이 비쌈",
  roommate: "함께 사는 게 부담",
  already_housed: "이미 거처 있음",
  facility: "시설이 아쉬움",
  location: "위치가 안 맞음",
  timing: "시기가 안 맞음",
  other: "기타",
};

const LANG_LABEL: Record<string, string> = { en: "EN", ja: "JA", ko: "KO" };

type Filter = "all" | "yes" | "no";

export function VillageWaitlistList({ rows }: { rows: VillageRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const real = rows.filter((r) => !isVillageTestRow(r));
  const visible = rows
    .filter((r) => (filter === "all" ? true : filter === "yes" ? r.interested : !r.interested))
    // 테스트 행은 지우지 않고 맨 아래로 내려 실제 응답을 먼저 보게 한다.
    .sort((a, b) => Number(isVillageTestRow(a)) - Number(isVillageTestRow(b)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        {(
          [
            ["all", `전체 ${real.length}`],
            ["yes", `진행 희망 ${real.filter((r) => r.interested).length}`],
            ["no", `진행 안 함 ${real.filter((r) => !r.interested).length}`],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
              filter === key
                ? "bg-primary text-primary-foreground"
                : "border border-hairline-2 text-ink-2 hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline-2 px-5 py-10 text-center text-sm text-ink-3">
          아직 접수된 응답이 없습니다.
        </p>
      ) : (
        visible.map((row) => <RowCard key={row.id} row={row} />)
      )}
    </div>
  );
}

function RowCard({ row }: { row: VillageRow }) {
  const [status, setStatus] = useState(row.status);
  const [memo, setMemo] = useState(row.memo ?? "");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const save = (nextStatus: string, nextMemo: string) => {
    setSaved(false);
    startTransition(async () => {
      const res = await updateVillageWaitlistAction({
        id: row.id,
        status: nextStatus as (typeof STATUSES)[number],
        memo: nextMemo,
      });
      if (res.ok) setSaved(true);
    });
  };

  const created = new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

  return (
    <div className="rounded-xl border border-hairline-2 bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-semibold",
            row.interested ? "bg-primary/10 text-primary" : "bg-secondary text-ink-3",
          )}
        >
          {row.interested ? "진행 희망" : "진행 안 함"}
        </span>
        {isVillageTestRow(row) ? (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-ink-4">
            테스트 · 집계 제외
          </span>
        ) : null}
        <span className="text-sm font-bold text-foreground">{row.name || "이름 미기재"}</span>
        {row.nationality ? <span className="text-[13px] text-ink-3">{row.nationality}</span> : null}
        <span className="rounded border border-hairline-2 px-1.5 py-0.5 text-[10px] text-ink-4">
          {LANG_LABEL[row.lang] ?? row.lang}
        </span>
        {row.deposit_status === "paid" ? (
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
            사전예약금 {(row.deposit_amount_krw ?? 0).toLocaleString("ko-KR")}원 결제
          </span>
        ) : row.deposit_status === "link_sent" ? (
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-ink-3">결제 링크 발급</span>
        ) : row.deposit_status === "refunded" ? (
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-ink-3">환불됨</span>
        ) : null}
        {row.visa_application_id ? (
          <span className="rounded-full border border-hairline-2 px-2 py-0.5 text-[10px] text-ink-4">비자 케이스</span>
        ) : null}
        <span className="ml-auto text-[11px] text-ink-4">{created}</span>
      </div>

      {row.contact ? (
        <p className="mt-2 text-[13px] text-ink-2">
          <span className="text-ink-4">{row.contact_type}</span> · {row.contact}
        </p>
      ) : null}

      {row.interested ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Tag>{OPTION_LABEL[row.preferred_option ?? "undecided"] ?? "-"}</Tag>
          {row.room_preference ? <Tag>{ROOM_LABEL[row.room_preference] ?? row.room_preference}</Tag> : null}
          {row.move_in_month ? <Tag>입주 희망 {row.move_in_month}</Tag> : null}
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(row.decline_reasons ?? []).map((r) => (
            <Tag key={r}>{DECLINE_LABEL[r] ?? r}</Tag>
          ))}
          {(row.decline_reasons ?? []).length === 0 ? <Tag>사유 미선택</Tag> : null}
        </div>
      )}

      {row.decline_reason_detail ? (
        <p className="mt-2.5 whitespace-pre-wrap rounded-lg bg-secondary/50 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-2">
          {row.decline_reason_detail}
        </p>
      ) : null}
      {row.message ? (
        <p className="mt-2.5 whitespace-pre-wrap rounded-lg bg-secondary/50 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-2">
          {row.message}
        </p>
      ) : null}

      <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-hairline-2 pt-3.5">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            save(e.target.value, memo);
          }}
          aria-label="상태"
          className="rounded-lg border border-hairline-2 bg-background px-3 py-2 text-[13px] text-foreground"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <input
          value={memo}
          onChange={(e) => {
            setMemo(e.target.value);
            setSaved(false);
          }}
          onBlur={() => {
            if (memo !== (row.memo ?? "")) save(status, memo);
          }}
          placeholder="운영 메모"
          className="min-w-0 flex-1 rounded-lg border border-hairline-2 bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-ink-4"
        />
        {pending ? <Loader2 className="size-4 animate-spin text-ink-3" /> : null}
        {saved && !pending ? <Check className="size-4 text-primary" /> : null}
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-hairline-2 px-2.5 py-1 text-[11px] text-ink-2">
      {children}
    </span>
  );
}
