import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { APPLICATION_STATUS_LABELS } from "@/lib/validation/projects";

type ChannelRow = {
  id: string;
  project_id: string;
  name: string;
  share_code: string;
  status: string;
};

type ApplicationRow = {
  id: string;
  status: string;
  cover_message: string | null;
  created_at: string;
  dancer:
    | {
        id: string;
        stage_name: string;
        korean_name: string | null;
        slug: string | null;
        profile_img: string | null;
        genres: string[] | null;
        location: string | null;
      }
    | null;
  applicant: { display_name: string; avatar_url: string | null } | null;
};

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-secondary text-ink-2",
  accepted: "bg-ok/15 text-ok",
  rejected: "bg-destructive/10 text-destructive",
  withdrawn: "bg-secondary text-ink-3",
  declined: "bg-destructive/10 text-destructive",
};

export default async function ChannelApplicantsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await requireUser();
  const { code } = await params;
  const shareCode = (code ?? "").trim();
  if (!shareCode) notFound();

  const supabase = await createClient();
  const { data: channelData } = await supabase
    .from("recruitment_channels")
    .select("id, project_id, name, share_code, status")
    .eq("share_code", shareCode)
    .maybeSingle();
  if (!channelData) notFound();
  const channel = channelData as ChannelRow;

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("title, short_code")
    .eq("id", channel.project_id)
    .maybeSingle();

  const { data: rows } = await supabase
    .from("applications")
    .select(
      `id, status, cover_message, created_at,
       applicant:profiles!applications_applicant_id_fkey ( display_name, avatar_url ),
       dancer:dancers!applications_dancer_id_fkey ( id, stage_name, korean_name, slug, profile_img, genres, location )`,
    )
    .eq("recruitment_channel_id", channel.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  const applications = (rows ?? []) as unknown as ApplicationRow[];
  const counts = applications.reduce(
    (acc, row) => {
      acc.total++;
      if (row.status === "pending") acc.pending++;
      if (row.status === "accepted") acc.accepted++;
      if (row.status === "rejected" || row.status === "declined") acc.rejected++;
      return acc;
    },
    { total: 0, pending: 0, accepted: 0, rejected: 0 },
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-8">
      <Link
        href={`/c/${channel.share_code}`}
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← 모집 링크
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-primary">
          모집채널
        </p>
        <h1 className="text-xl font-bold leading-tight tracking-tight">
          {channel.name}
        </h1>
        <p className="text-sm text-ink-2">
          {project?.title ?? "프로젝트"} · 지원 {counts.total}명 · 수락{" "}
          {counts.accepted}명 · 대기 {counts.pending}명
        </p>
      </header>

      {channel.status !== "active" ? (
        <p className="rounded-xl border border-border bg-secondary/50 p-4 text-sm text-ink-2">
          이 채널은 현재 {channel.status} 상태입니다. 기존 지원자 조회는 가능합니다.
        </p>
      ) : null}

      {applications.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-hairline-2 p-8 text-center text-sm text-ink-3">
          아직 이 채널로 들어온 지원자가 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {applications.map((app) => {
            const name =
              app.dancer?.stage_name ?? app.applicant?.display_name ?? "(이름 없음)";
            const avatar = app.dancer?.profile_img ?? app.applicant?.avatar_url ?? null;
            const href = app.dancer
              ? `/d/${app.dancer.slug ?? app.dancer.id}`
              : null;
            return (
              <li
                key={app.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
              >
                {avatar ? (
                  <Image
                    src={avatar}
                    alt={name}
                    width={40}
                    height={40}
                    className="size-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex size-10 items-center justify-center rounded-full bg-secondary text-sm font-bold">
                    {name[0] ?? "?"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {href ? (
                    <Link href={href} className="truncate text-sm font-semibold hover:underline">
                      {name}
                      {app.dancer?.korean_name ? (
                        <span className="ml-1 text-ink-3">
                          {app.dancer.korean_name}
                        </span>
                      ) : null}
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-semibold">{name}</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {app.dancer?.location ? (
                      <span className="text-[11px] text-ink-3">
                        {app.dancer.location}
                      </span>
                    ) : null}
                    {(app.dancer?.genres ?? []).slice(0, 3).map((genre) => (
                      <span
                        key={genre}
                        className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-ink-2"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    STATUS_CLASS[app.status] ?? "bg-secondary text-ink-3"
                  }`}
                >
                  {APPLICATION_STATUS_LABELS[
                    app.status as keyof typeof APPLICATION_STATUS_LABELS
                  ] ?? app.status}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
