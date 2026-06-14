import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { getUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDancerIdForUserInProject } from "@/lib/schedule/resolve";
import { formatWhen } from "@/lib/format-when";
import {
  ProjectScheduleSurveyForm,
  type SurveyItem,
} from "@/components/project/ProjectScheduleSurveyForm";

type Slot = { start: string; end: string; kind: "available" | "unavailable" };

// 단톡방 공유용 일정 가능여부 설문. /sr/<schedule_survey_code> (프로젝트 단위)
// 신원확인 = 로그인 세션. 코드는 "어느 프로젝트 설문인지"만 지정.
export default async function ScheduleSurveyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!code) notFound();

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, title")
    .eq("schedule_survey_code", code)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) notFound();
  const projectId = project.id as string;

  const { data: schedRows } = await admin
    .from("project_schedules")
    .select("id, label, starts_at, ends_at, location, note")
    .eq("project_id", projectId)
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  const schedules = (schedRows ?? []) as Array<{
    id: string;
    label: string;
    starts_at: string | null;
    ends_at: string | null;
    location: string | null;
    note: string | null;
  }>;

  const user = await getUser();
  let dancerId: string | null = null;
  let responderName: string | null = null;
  if (user) {
    dancerId = await resolveDancerIdForUserInProject(projectId, user.id);
    if (dancerId) {
      const { data: d } = await admin
        .from("dancers")
        .select("stage_name")
        .eq("id", dancerId)
        .maybeSingle();
      responderName = (d?.stage_name as string | null) ?? null;
    }
  }

  // 기존 응답 프리필 (있으면)
  const prior: Record<
    string,
    { status: SurveyItem["status"]; timeSlots: Slot[] | null; note: string | null }
  > = {};
  if (dancerId && schedules.length > 0) {
    const { data: resp } = await admin
      .from("project_schedule_responses")
      .select("schedule_id, status, time_slots, note")
      .eq("dancer_id", dancerId)
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

  const loginHref = `/login?next=${encodeURIComponent(`/sr/${code}`)}`;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
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
      ) : !user ? (
        <>
          <ul className="flex flex-col gap-2">
            {items.map((it) => (
              <li
                key={it.id}
                className="flex flex-col gap-0.5 rounded-2xl border border-border bg-card p-4"
              >
                <p className="text-sm font-bold">{it.label}</p>
                <p className="text-xs text-ink-2">{it.whenText}</p>
                {it.location ? (
                  <p className="flex items-center gap-1 text-xs text-ink-3">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {it.location}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
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
        </>
      ) : dancerId ? (
        <ProjectScheduleSurveyForm
          code={code}
          responderName={responderName}
          items={items}
        />
      ) : (
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
