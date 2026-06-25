import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = {
  dancer_approved: "프로필 승인",
  profile_incomplete: "프로필 보완",
  casting_proposal: "캐스팅 제안",
  schedule_request: "일정 확인(요청)",
  schedule_change: "일정 추가/변경",
  schedule_cancel: "일정 취소",
  settlement_confirmed: "정산 완료",
  settlement_info_required: "정산정보 요청",
  settlement_paid: "입금 완료",
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  sent: { label: "발송완료", cls: "bg-ok/15 text-ok" },
  failed: { label: "실패", cls: "bg-destructive/10 text-destructive" },
  skipped: { label: "건너뜀", cls: "bg-secondary text-ink-3" },
  claimed: { label: "미완(중단)", cls: "bg-warn/15 text-warn" },
};

const STATUS_FILTERS = ["all", "sent", "failed", "skipped", "claimed"] as const;

function maskPhone(p: string | null): string {
  if (!p) return "-";
  const d = p.replace(/\D/g, "");
  if (d.length < 7) return p;
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
}

function fmtKst(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(d);
}

type LogRow = {
  id: string;
  event_type: string;
  dancer_id: string;
  phone: string | null;
  template_id: string | null;
  status: string;
  message_id: string | null;
  error: string | null;
  variables: Record<string, unknown> | null;
  created_at: string;
  sent_at: string | null;
};

export default async function AdminAlimtalkPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const profile = await requireProfile();
  if (!profile.is_admin) notFound();

  const { status } = await searchParams;
  const activeStatus =
    status && STATUS_FILTERS.includes(status as (typeof STATUS_FILTERS)[number])
      ? status
      : "all";

  const admin = createAdminClient();

  // 상태 카운트(최근 전체 집계)
  const { data: allStatuses } = await admin
    .from("alimtalk_log")
    .select("status");
  const counts: Record<string, number> = { all: 0 };
  for (const r of (allStatuses ?? []) as Array<{ status: string }>) {
    counts.all++;
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }

  let query = admin
    .from("alimtalk_log")
    .select(
      "id, event_type, dancer_id, phone, template_id, status, message_id, error, variables, created_at, sent_at",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (activeStatus !== "all") query = query.eq("status", activeStatus);
  const { data: rowsRaw } = await query;
  const rows = (rowsRaw ?? []) as LogRow[];

  // 수신자 이름 매핑
  const dancerIds = Array.from(new Set(rows.map((r) => r.dancer_id)));
  const nameById = new Map<string, string>();
  if (dancerIds.length > 0) {
    const { data: dancers } = await admin
      .from("dancers")
      .select("id, stage_name")
      .in("id", dancerIds);
    for (const d of (dancers ?? []) as Array<{ id: string; stage_name: string | null }>) {
      nameById.set(d.id, d.stage_name ?? "(이름 없음)");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/admin"
          className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
        >
          ← 관리자
        </Link>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          알림톡 발송내역
        </h1>
        <p className="text-xs text-ink-3">
          누구에게 · 어떤 알림 · 성공여부 · 내용 · 실패사유. 최근 300건 표시.
        </p>
      </header>

      <section className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => {
          const meta = STATUS_META[s];
          const on = activeStatus === s;
          return (
            <Link
              key={s}
              href={s === "all" ? "/admin/alimtalk" : `/admin/alimtalk?status=${s}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-ink-2 hover:bg-secondary"
              }`}
            >
              {s === "all" ? "전체" : meta?.label ?? s} ({counts[s] ?? 0})
            </Link>
          );
        })}
      </section>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-ink-3">
          발송내역이 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-secondary/40 text-left text-xs text-ink-3">
              <tr>
                <th className="px-3 py-2 font-medium">시각</th>
                <th className="px-3 py-2 font-medium">수신자</th>
                <th className="px-3 py-2 font-medium">알림 종류</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-3 py-2 font-medium">내용</th>
                <th className="px-3 py-2 font-medium">비고</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = STATUS_META[r.status] ?? {
                  label: r.status,
                  cls: "bg-secondary text-ink-3",
                };
                const vars = r.variables
                  ? Object.entries(r.variables)
                      .filter(([k]) => k !== "토큰")
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join(" · ")
                  : "-";
                return (
                  <tr key={r.id} className="border-t border-hairline-2 align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-2">
                      {fmtKst(r.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">
                        {nameById.get(r.dancer_id) ?? "(알 수 없음)"}
                      </div>
                      <div className="text-[11px] text-ink-3">
                        {maskPhone(r.phone)}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      {EVENT_LABEL[r.event_type] ?? r.event_type}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-2">{vars}</td>
                    <td className="px-3 py-2 text-[11px] text-ink-3">
                      {r.error ? (
                        <span className="text-destructive">{r.error}</span>
                      ) : r.sent_at ? (
                        `발송 ${fmtKst(r.sent_at)}`
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
