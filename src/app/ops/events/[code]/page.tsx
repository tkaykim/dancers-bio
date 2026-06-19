import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

type EventRow = {
  id: string;
  project_id: string;
  name: string;
  event_type: string;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  status: string;
  public_pass_code: string;
};

type ParticipantRow = {
  id: string;
  bib_code: string | null;
  attendance_status: string;
  onsite_status: string;
  checked_in_at: string | null;
  settlement_eligible: boolean;
  note: string;
  dancer:
    | {
        id: string;
        stage_name: string;
        korean_name: string | null;
        slug: string | null;
        profile_img: string | null;
      }
    | null;
  channel:
    | {
        name: string;
      }
    | null;
};

const ATTENDANCE_LABELS: Record<string, string> = {
  not_arrived: "미도착",
  checked_in: "출석",
  no_show: "노쇼",
  self_withdrawn: "자체포기",
};

const ONSITE_LABELS: Record<string, string> = {
  waiting: "대기",
  watching: "진행중",
  hold: "보류",
  eliminated: "탈락",
  finalist: "최종",
  self_withdrawn: "자체포기",
};

function formatWhen(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return "일정 미정";
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return "일정 미정";
  const dateText = new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(start);
  const startText = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(start);
  if (!endsAt) return `${dateText} ${startText}`;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return `${dateText} ${startText}`;
  const endText = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(end);
  return `${dateText} ${startText}~${endText}`;
}

export default async function ProjectEventOpsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const opsCode = (code ?? "").trim();
  if (!opsCode) notFound();

  const admin = createAdminClient();
  const { data: eventData } = await admin
    .from("project_events")
    .select("id, project_id, name, event_type, starts_at, ends_at, location, status, public_pass_code")
    .eq("ops_code", opsCode)
    .maybeSingle();
  if (!eventData) notFound();
  const event = eventData as EventRow;

  const [{ data: project }, { data: participantRows }] = await Promise.all([
    admin
      .from("projects")
      .select("title, short_code")
      .eq("id", event.project_id)
      .maybeSingle(),
    admin
      .from("event_participants")
      .select(
        `id, bib_code, attendance_status, onsite_status, checked_in_at, settlement_eligible, note,
         dancer:dancers!event_participants_dancer_id_fkey ( id, stage_name, korean_name, slug, profile_img ),
         channel:recruitment_channels!event_participants_recruitment_channel_id_fkey ( name )`,
      )
      .eq("event_id", event.id)
      .order("bib_code", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
  ]);
  const participants = (participantRows ?? []) as unknown as ParticipantRow[];
  const checkedIn = participants.filter(
    (row) => row.attendance_status === "checked_in",
  ).length;
  const finalist = participants.filter(
    (row) => row.onsite_status === "finalist" || row.onsite_status === "hold",
  ).length;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 px-5 py-8">
      <Link
        href={project?.short_code ? `/projects/${project.short_code}/applicants` : "/feed"}
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← 프로젝트 관리
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-primary">
          운영판
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{event.name}</h1>
        <p className="text-sm text-ink-2">
          {project?.title ?? "프로젝트"} · {formatWhen(event.starts_at, event.ends_at)}
          {event.location ? ` · ${event.location}` : ""}
        </p>
      </header>

      <section className="grid gap-2 sm:grid-cols-4">
        <Stat label="참가자" value={participants.length} />
        <Stat label="출석" value={checkedIn} />
        <Stat label="최종/보류" value={finalist} />
        <Stat label="정산대상" value={participants.filter((row) => row.settlement_eligible).length} />
      </section>

      {participants.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-hairline-2 p-8 text-center text-sm text-ink-3">
          아직 참가자가 없습니다. 프로젝트 지원자 화면에서 이 운영일정에 수락자를 반영해 주세요.
        </p>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="grid grid-cols-[80px_1fr_120px_120px] border-b border-border px-4 py-2 text-xs font-semibold text-ink-3">
            <span>번호</span>
            <span>참가자</span>
            <span>출석</span>
            <span>현장</span>
          </div>
          <ul className="divide-y divide-border">
            {participants.map((row) => {
              const name = row.dancer?.stage_name ?? "(이름 없음)";
              return (
                <li
                  key={row.id}
                  className="grid grid-cols-[80px_1fr_120px_120px] items-center gap-3 px-4 py-3 text-sm"
                >
                  <span className="font-mono font-semibold">
                    {row.bib_code ?? "-"}
                  </span>
                  <div className="flex min-w-0 items-center gap-3">
                    {row.dancer?.profile_img ? (
                      <Image
                        src={row.dancer.profile_img}
                        alt={name}
                        width={36}
                        height={36}
                        className="size-9 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                        {name[0] ?? "?"}
                      </div>
                    )}
                    <div className="min-w-0">
                      {row.dancer?.slug || row.dancer?.id ? (
                        <Link
                          href={`/d/${row.dancer.slug ?? row.dancer.id}`}
                          className="truncate font-semibold hover:underline"
                        >
                          {name}
                        </Link>
                      ) : (
                        <p className="truncate font-semibold">{name}</p>
                      )}
                      <p className="truncate text-xs text-ink-3">
                        {row.dancer?.korean_name ?? ""}
                        {row.channel?.name ? ` · ${row.channel.name}` : ""}
                      </p>
                    </div>
                  </div>
                  <StatusPill>{ATTENDANCE_LABELS[row.attendance_status] ?? row.attendance_status}</StatusPill>
                  <StatusPill>{ONSITE_LABELS[row.onsite_status] ?? row.onsite_status}</StatusPill>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function StatusPill({ children }: { children: string }) {
  return (
    <span className="w-fit rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-ink-2">
      {children}
    </span>
  );
}
