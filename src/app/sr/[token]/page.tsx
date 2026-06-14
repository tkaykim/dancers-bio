import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyScheduleGroupToken } from "@/lib/quick-token";
import { formatWhen } from "@/lib/format-when";
import { GroupScheduleResponseForm } from "@/components/project/GroupScheduleResponseForm";

// 단톡방 공유용 일정 응답 페이지 (이메일로 신원확인). /sr/<token>
export default async function GroupScheduleResponsePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const scheduleId = verifyScheduleGroupToken(token);
  if (!scheduleId) notFound();

  const admin = createAdminClient();
  const { data: sch } = await admin
    .from("project_schedules")
    .select("label, starts_at, ends_at, location, note")
    .eq("id", scheduleId)
    .maybeSingle();
  if (!sch) notFound();

  const whenText = formatWhen(
    sch.starts_at as string | null,
    sch.ends_at as string | null,
  );

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

      <GroupScheduleResponseForm token={token} />

      <p className="text-center text-[11px] text-ink-3">
        로그인 없이 저장됩니다. 이 프로젝트에 지원하신 분만 응답할 수 있어요.
      </p>
    </div>
  );
}
