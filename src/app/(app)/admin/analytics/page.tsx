import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import {
  AnalyticsDashboard,
  type AnalyticsData,
  type ActivityData,
} from "@/components/admin/AnalyticsDashboard";
import { serverNowMs } from "@/lib/server-time";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const profile = await requireProfile();
  if (!profile.is_admin) notFound();

  const supabase = await createClient();
  const [
    { data: pRows },
    { data: aRows },
    { data: dRows },
    { data: chRows },
    { data: projRows },
    { data: actSummary },
    { data: dauRows },
    { data: mauRows },
  ] = await Promise.all([
    supabase.from("profiles").select("id, created_at"),
    supabase
      .from("applications")
      .select("applicant_id, created_at, status, recruitment_channel_id"),
    supabase.from("dancers").select("profile_id, created_at"),
    supabase.from("recruitment_channels").select("id, name"),
    supabase.from("projects").select("status").is("deleted_at", null),
    supabase.rpc("admin_activity_summary"),
    supabase.rpc("admin_dau_series", { _days: 60 }),
    supabase.rpc("admin_mau_monthly", { _months: 12 }),
  ]);

  const num = (v: string | null) => (v ? new Date(v).getTime() : NaN);

  const data: AnalyticsData = {
    signups: ((pRows ?? []) as { id: string; created_at: string }[])
      .map((r) => ({ id: r.id, t: num(r.created_at) }))
      .filter((x) => !Number.isNaN(x.t)),
    apps: (
      (aRows ?? []) as {
        applicant_id: string | null;
        created_at: string;
        status: string;
        recruitment_channel_id: string | null;
      }[]
    )
      .map((r) => ({
        uid: r.applicant_id,
        t: num(r.created_at),
        status: r.status,
        ch: r.recruitment_channel_id,
      }))
      .filter((x) => !Number.isNaN(x.t)),
    dancers: (
      (dRows ?? []) as { profile_id: string | null; created_at: string | null }[]
    ).map((r) => ({
      claimed: !!r.profile_id,
      t: r.created_at ? num(r.created_at) : null,
    })),
    channels: (chRows ?? []) as { id: string; name: string }[],
    projects: (projRows ?? []) as { status: string }[],
  };

  const summaryRow = (
    (actSummary ?? []) as {
      dau: number;
      wau: number;
      mau: number;
      tracked_since: string | null;
      total_events: number;
    }[]
  )[0];
  const activity: ActivityData = {
    dau: summaryRow?.dau ?? 0,
    wau: summaryRow?.wau ?? 0,
    mau: summaryRow?.mau ?? 0,
    trackedSince: summaryRow?.tracked_since ?? null,
    totalEvents: summaryRow?.total_events ?? 0,
    series: ((dauRows ?? []) as { day: string; dau: number }[]).map((r) => ({
      label: r.day.slice(5).replace("-", "/"),
      value: r.dau,
    })),
    mauSeries: ((mauRows ?? []) as { month: string; mau: number }[]).map((r) => {
      const [y, m] = r.month.split("-");
      return { label: `${y.slice(2)}.${Number(m)}`, value: r.mau };
    }),
  };

  return (
    <AnalyticsDashboard data={data} activity={activity} now={serverNowMs()} />
  );
}
