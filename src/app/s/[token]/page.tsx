import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyProjectSurveyToken } from "@/lib/quick-token";
import { formatWhen } from "@/lib/format-when";
import {
  ProjectScheduleSurveyForm,
  type SurveyItem,
} from "@/components/project/ProjectScheduleSurveyForm";

type Slot = { start: string; end: string; kind: "available" | "unavailable" };

// 메일 개인 매직링크용 일정 설문 (로그인 생략 — 토큰으로 본인 식별). /s/<token>
// 단톡방 설문(/sr)과 동일 UI지만, 토큰에 dancer가 박혀 있어 로그인이 필요 없음.
export default async function ScheduleResponsePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const v = verifyProjectSurveyToken(token);
  if (!v) notFound();

  const admin = createAdminClient();
  const [{ data: project }, { data: dancer }, { data: schedRows }] =
    await Promise.all([
      admin
        .from("projects")
        .select("title")
        .eq("id", v.projectId)
        .is("deleted_at", null)
        .maybeSingle(),
      admin.from("dancers").select("stage_name").eq("id", v.dancerId).maybeSingle(),
      admin
        .from("project_schedules")
        .select("id, label, starts_at, ends_at, location, note")
        .eq("project_id", v.projectId)
        .order("starts_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }),
    ]);
  if (!project || !dancer) notFound();

  const schedules = (schedRows ?? []) as Array<{
    id: string;
    label: string;
    starts_at: string | null;
    ends_at: string | null;
    location: string | null;
    note: string | null;
  }>;

  // 기존 응답 프리필
  const prior: Record<
    string,
    { status: SurveyItem["status"]; timeSlots: Slot[] | null; note: string | null }
  > = {};
  if (schedules.length > 0) {
    const { data: resp } = await admin
      .from("project_schedule_responses")
      .select("schedule_id, status, time_slots, note")
      .eq("dancer_id", v.dancerId)
      .in(
        "schedule_id",
        schedules.map((s) => s.id),
      );
    for (const r of (resp ?? []) as Array<{
      schedule_id: string;
      status: SurveyItem["status"];
      time_slots: Slot[] | null;
      note: string | null;
    }>) {
      prior[r.schedule_id] = {
        status: r.status,
        timeSlots: r.time_slots,
        note: r.note,
      };
    }
  }

  const items: SurveyItem[] = schedules.map((s) => ({
    id: s.id,
    label: s.label,
    whenText: formatWhen(s.starts_at, s.ends_at),
    location: s.location ?? null,
    note: s.note ?? null,
    status: prior[s.id]?.status ?? null,
    timeSlots: prior[s.id]?.timeSlots ?? null,
    responseNote: prior[s.id]?.note ?? null,
  }));

  const name = (dancer.stage_name as string | null) ?? null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <div className="text-2xl font-extrabold tracking-tight">
          deetz<span className="text-primary">.</span>
        </div>
        <h1 className="text-xl font-bold leading-tight">
          일정 참석 가능 여부를 알려주세요
        </h1>
        <p className="text-sm text-ink-2">{project.title as string}</p>
      </div>

      {schedules.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-5 text-center text-sm text-ink-2">
          아직 등록된 후보 일정이 없습니다.
        </p>
      ) : (
        <ProjectScheduleSurveyForm
          token={token}
          responderName={name}
          items={items}
        />
      )}

      <p className="text-center text-[11px] text-ink-3">
        로그인 없이 저장됩니다. 응답은 캐스팅 관리자에게만 보입니다.
      </p>
    </div>
  );
}
