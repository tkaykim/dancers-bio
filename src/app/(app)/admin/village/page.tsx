import { createAdminClient } from "@/lib/supabase/admin";
import { VillageWaitlistList, type VillageRow } from "@/components/admin/VillageWaitlistList";
import { isVillageTestRow } from "@/lib/village/test-row";

export const metadata = { title: "deetz Village 수요조사 | deetz admin" };

const DECLINE_LABEL: Record<string, string> = {
  price: "비용이 비쌈",
  roommate: "함께 사는 게 부담",
  already_housed: "이미 거처 있음",
  facility: "시설이 아쉬움",
  location: "위치가 안 맞음",
  timing: "시기가 안 맞음",
  other: "기타",
};

export default async function AdminVillagePage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("village_waitlist")
    .select(
      "id, created_at, interested, name, nationality, nationality_code, contact_type, contact, preferred_option, room_preference, move_in_month, message, decline_reasons, decline_reason_detail, lang, status, memo",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  const allRows = (data ?? []) as VillageRow[];
  // 수요조사 숫자는 실제 응답만으로 세야 의미가 있다 — E2E 테스트 행은 목록엔 남기고 집계에서만 뺀다.
  const rows = allRows.filter((r) => !isVillageTestRow(r));
  const testCount = allRows.length - rows.length;
  const yes = rows.filter((r) => r.interested);
  const no = rows.filter((r) => !r.interested);

  // 미진행 사유 집계 — 무엇을 바꿔야 하는지가 이 화면의 핵심 정보다.
  const reasonCounts = new Map<string, number>();
  for (const r of no) {
    for (const reason of r.decline_reasons ?? []) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }
  const reasonRanking = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]);

  const optionCounts = new Map<string, number>();
  for (const r of yes) {
    const key = r.preferred_option ?? "undecided";
    optionCounts.set(key, (optionCounts.get(key) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">deetz Village 수요조사</h1>
        <p className="mt-1 text-sm text-ink-3">
          공개 페이지 <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">/village</code> 접수 내역.
          아직 결제는 받지 않는 사전 수요조사 단계입니다.
          {testCount > 0 ? ` 테스트 행 ${testCount}건은 집계에서 제외했습니다.` : ""}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="전체 응답" value={rows.length} />
        <StatCard label="진행 희망 (대기등록)" value={yes.length} tone="primary" />
        <StatCard label="진행 안 함" value={no.length} />
      </div>

      {yes.length > 0 ? (
        <div className="rounded-xl border border-hairline-2 bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-4">희망 옵션 분포</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {[
              ["a", "옵션 A (월 50만)"],
              ["b", "옵션 B (월 60만)"],
              ["either", "둘 다 괜찮음"],
              ["undecided", "미정"],
            ].map(([key, label]) => (
              <span
                key={key}
                className="rounded-full border border-hairline-2 px-3 py-1.5 text-[13px] text-ink-2"
              >
                {label} <b className="text-foreground">{optionCounts.get(key) ?? 0}</b>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {reasonRanking.length > 0 ? (
        <div className="rounded-xl border border-hairline-2 bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-4">미진행 사유 순위</p>
          <div className="mt-2.5 flex flex-col gap-1.5">
            {reasonRanking.map(([reason, count]) => (
              <div key={reason} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-[13px] text-ink-2">
                  {DECLINE_LABEL[reason] ?? reason}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.round((count / no.length) * 100)}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-[13px] font-semibold text-foreground">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <VillageWaitlistList rows={allRows} />
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "primary";
}) {
  return (
    <div
      className={
        "rounded-xl border p-5 " +
        (tone === "primary" ? "border-primary/40 bg-primary/5" : "border-hairline-2 bg-card")
      }
    >
      <p className="text-xs font-medium text-ink-3">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{value}</p>
    </div>
  );
}
