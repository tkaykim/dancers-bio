import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyScheduleToken } from "@/lib/quick-token";
import { formatWhen } from "@/lib/format-when";
import { ScheduleResponseForm } from "@/components/project/ScheduleResponseForm";

// 로그인 없이 일정 가능여부 응답. /s/<token>
export default async function ScheduleResponsePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const v = verifyScheduleToken(token);
  if (!v) notFound();

  const admin = createAdminClient();
  const [{ data: sch }, { data: d }, { data: existing }] = await Promise.all([
    admin
      .from("project_schedules")
      .select("id, label, starts_at, ends_at, location, note")
      .eq("id", v.scheduleId)
      .maybeSingle(),
    admin.from("dancers").select("stage_name").eq("id", v.dancerId).maybeSingle(),
    admin
      .from("project_schedule_responses")
      .select("status, time_slots")
      .eq("schedule_id", v.scheduleId)
      .eq("dancer_id", v.dancerId)
      .maybeSingle(),
  ]);
  if (!sch || !d) notFound();

  const name = (d.stage_name as string) ?? "댄서";
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
          {name}님, 참석 가능하세요?
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

      <ScheduleResponseForm
        token={token}
        current={(existing?.status as "available" | "partial" | "unavailable" | null) ?? null}
        currentSlots={
          (existing?.time_slots as
            | { start: string; end: string; kind: "available" | "unavailable" }[]
            | null) ?? null
        }
      />

      <p className="text-center text-[11px] text-ink-3">
        로그인 없이 저장됩니다. 응답은 캐스팅 관리자에게만 보입니다.
      </p>
    </div>
  );
}
