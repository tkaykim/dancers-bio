import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDancerIdForUserInProject } from "@/lib/schedule/resolve";
import { formatWhen } from "@/lib/format-when";
import { GroupScheduleResponseForm } from "@/components/project/GroupScheduleResponseForm";

// 단톡방 공유용 일정 응답 페이지. /sr/<share_code> (짧은 공유 코드)
// 신원확인 = 로그인 세션. 코드는 "어느 일정인지"만 지정.
export default async function GroupScheduleResponsePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!code) notFound();

  const admin = createAdminClient();
  const { data: sch } = await admin
    .from("project_schedules")
    .select("id, project_id, label, starts_at, ends_at, location, note")
    .eq("share_code", code)
    .maybeSingle();
  if (!sch) notFound();

  const whenText = formatWhen(
    sch.starts_at as string | null,
    sch.ends_at as string | null,
  );

  const user = await getUser();
  let dancerId: string | null = null;
  let responderName: string | null = null;
  if (user) {
    dancerId = await resolveDancerIdForUserInProject(
      sch.project_id as string,
      user.id,
    );
    if (dancerId) {
      const { data: d } = await admin
        .from("dancers")
        .select("stage_name")
        .eq("id", dancerId)
        .maybeSingle();
      responderName = (d?.stage_name as string | null) ?? null;
    }
  }

  const loginHref = `/login?next=${encodeURIComponent(`/sr/${code}`)}`;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <div className="text-2xl font-extrabold tracking-tight">
          deetz<span className="text-primary">.</span>
        </div>
        <h1 className="text-xl font-bold leading-tight">
          일정 참석 가능 여부를 알려주세요
        </h1>
      </div>

      <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-bold">{sch.label as string}</p>
        <p className="text-sm text-ink-2">{whenText}</p>
        {sch.location ? (
          <p className="text-sm text-ink-2">📍 {sch.location as string}</p>
        ) : null}
        {sch.note ? (
          <p className="mt-1 whitespace-pre-wrap text-xs text-ink-3">
            {sch.note as string}
          </p>
        ) : null}
      </div>

      {!user ? (
        // 비로그인 → 로그인 유도 (로그인 후 이 페이지로 복귀)
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-2">
            응답하려면 deetz 로그인이 필요합니다.
            <br />
            지원하신 계정으로 로그인하시면 자동으로 본인 확인됩니다.
          </p>
          <Link
            href={loginHref}
            className="flex h-12 items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground"
          >
            로그인하고 응답하기
          </Link>
        </div>
      ) : dancerId ? (
        <GroupScheduleResponseForm code={code} responderName={responderName} />
      ) : (
        // 로그인했지만 이 프로젝트 지원자가 아님
        <div className="flex flex-col gap-3 rounded-2xl border border-warn/30 bg-warn/10 p-5 text-center">
          <p className="text-sm font-semibold">
            이 프로젝트에 지원한 기록이 없어요.
          </p>
          <p className="text-xs text-ink-2">
            다른 계정으로 지원하셨다면 그 계정으로 다시 로그인해 주세요.
          </p>
          <Link href={loginHref} className="text-xs font-semibold text-primary underline">
            다른 계정으로 로그인
          </Link>
        </div>
      )}

      <p className="text-center text-[11px] text-ink-3">
        이 프로젝트에 지원하신 분만 응답할 수 있어요.
      </p>
    </div>
  );
}
