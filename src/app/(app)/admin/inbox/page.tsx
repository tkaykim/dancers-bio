import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { messagingEnabled } from "@/lib/messaging/flags";
import { slaTier } from "@/lib/messaging/types";

export const metadata: Metadata = { title: "전역 미답변 인박스 | deetz" };
export const dynamic = "force-dynamic";

// 전 프로젝트의 미답변 대화를 한 화면에 — 8월 "회신 나흘 미확인" 사고의 재발 방지 장치.
// 미답변이 존재하는 한 이 화면에서 사라지지 않는다.
export default async function AdminInboxPage() {
  await requireAdmin();

  if (!messagingEnabled()) {
    return <div className="p-8 text-sm text-ink-3">메시지 기능이 아직 열리지 않았습니다.</div>;
  }

  const admin = createAdminClient();
  const { data: rooms } = await admin
    .from("chat_rooms")
    .select(
      "id, project_id, awaiting_staff_since, last_message_at, project:projects(title), dancer:dancers!chat_rooms_direct_dancer_id_fkey(stage_name)",
    )
    .not("awaiting_staff_since", "is", null)
    .is("archived_at", null)
    .is("closed_at", null)
    .order("awaiting_staff_since", { ascending: true })
    .limit(200);

  type Row = {
    id: string;
    project_id: string;
    awaiting_staff_since: string;
    last_message_at: string | null;
    project: { title: string | null } | Array<{ title: string | null }> | null;
    dancer: { stage_name: string | null } | Array<{ stage_name: string | null }> | null;
  };
  const list = ((rooms ?? []) as unknown as Row[]).map((r) => ({
    ...r,
    projectTitle:
      (Array.isArray(r.project) ? r.project[0]?.title : r.project?.title) ?? "프로젝트",
    dancerName:
      (Array.isArray(r.dancer) ? r.dancer[0]?.stage_name : r.dancer?.stage_name) ?? "(이름 없음)",
  }));

  const tierStyle: Record<string, string> = {
    ok: "bg-zinc-400",
    warn: "bg-amber-500",
    late: "bg-red-500",
    none: "bg-transparent",
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">미답변 인박스</h1>
      <p className="mt-1 text-[13px] text-ink-3">
        전 프로젝트에서 지원자 메시지에 아직 답하지 않은 대화입니다. 4시간(주황)·24시간(빨강)
        경과 시 내부 알림이 나갑니다.
      </p>

      {list.length === 0 ? (
        <div className="mt-10 rounded-md border border-border px-4 py-12 text-center">
          <p className="text-sm font-semibold">미답변 대화가 없습니다 👍</p>
          <p className="mt-1 text-[12px] text-ink-3">지원자 메시지가 오면 여기에 표시됩니다.</p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-md border border-border">
          {list.map((r) => {
            // 서버 컴포넌트 — 요청마다 새로 렌더되는 경과 시간 표시라 현재 시각 사용이 의도다.
            const tier = slaTier(r.awaiting_staff_since);
            const hours = Math.floor((Date.now() - new Date(r.awaiting_staff_since).getTime()) / 3_600_000); // eslint-disable-line react-hooks/purity
            return (
              <li key={r.id}>
                <Link
                  href={`/projects/${r.project_id}/messages?room=${r.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/60"
                >
                  <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${tierStyle[tier]}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">
                      {r.dancerName}
                      <span className="ml-2 font-normal text-ink-3">{r.projectTitle}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-ink-3">
                    {hours < 1 ? "1시간 미만" : `${hours}시간 경과`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
