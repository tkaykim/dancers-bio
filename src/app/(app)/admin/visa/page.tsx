import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { visaLabel } from "@/lib/data/korea-visas";
import { VisaAdminList, type VisaAdminRow } from "@/components/admin/VisaAdminList";

export const metadata = { title: "비자 신청 관리 | deetz admin" };

type AppRow = {
  id: string;
  created_at: string;
  status: string;
  memo: string | null;
  skill_level: number | null;
  korean_level: string | null;
  dance_video_url: string | null;
  currently_in_korea: boolean | null;
  has_residence_in_korea: boolean | null;
  residence_region: string | null;
  available_entry_date: string | null;
  email: string;
  contacts: { type: string; handle: string }[] | null;
  preferred_lang: string | null;
  dancer_id: string | null;
};

export default async function AdminVisaPage() {
  const profile = await requireProfile();
  if (!profile.is_admin) notFound();

  // 비자 신청은 RLS default deny — service-role로만 조회 가능.
  const admin = createAdminClient();
  const { data: appsRaw } = await admin
    .from("dancer_visa_applications")
    .select(
      "id, created_at, status, memo, skill_level, korean_level, dance_video_url, currently_in_korea, has_residence_in_korea, residence_region, available_entry_date, email, contacts, preferred_lang, dancer_id",
    )
    .order("created_at", { ascending: false })
    .limit(300);

  const apps = (appsRaw ?? []) as unknown as AppRow[];
  const dancerIds = Array.from(new Set(apps.map((a) => a.dancer_id).filter(Boolean))) as string[];

  const dancerMap = new Map<string, { stage_name: string | null; korean_name: string | null; slug: string | null }>();
  const privMap = new Map<string, { nationality: string | null; has_visa: boolean | null; visa_type: string | null }>();

  if (dancerIds.length > 0) {
    const [{ data: dancers }, { data: privs }] = await Promise.all([
      admin.from("dancers").select("id, stage_name, korean_name, slug").in("id", dancerIds),
      admin
        .from("dancer_private_info")
        .select("dancer_id, nationality, has_visa, visa_type")
        .in("dancer_id", dancerIds),
    ]);
    for (const d of (dancers ?? []) as unknown as Array<{
      id: string;
      stage_name: string | null;
      korean_name: string | null;
      slug: string | null;
    }>) {
      dancerMap.set(d.id, { stage_name: d.stage_name, korean_name: d.korean_name, slug: d.slug });
    }
    for (const p of (privs ?? []) as unknown as Array<{
      dancer_id: string;
      nationality: string | null;
      has_visa: boolean | null;
      visa_type: string | null;
    }>) {
      privMap.set(p.dancer_id, {
        nationality: p.nationality,
        has_visa: p.has_visa,
        visa_type: p.visa_type,
      });
    }
  }

  const rows: VisaAdminRow[] = apps.map((a) => {
    const d = a.dancer_id ? dancerMap.get(a.dancer_id) : undefined;
    const p = a.dancer_id ? privMap.get(a.dancer_id) : undefined;
    return {
      id: a.id,
      created_at: a.created_at,
      status: a.status,
      memo: a.memo,
      skill_level: a.skill_level,
      korean_level: a.korean_level,
      dance_video_url: a.dance_video_url,
      currently_in_korea: a.currently_in_korea,
      has_residence_in_korea: a.has_residence_in_korea,
      residence_region: a.residence_region,
      available_entry_date: a.available_entry_date,
      email: a.email,
      contacts: Array.isArray(a.contacts) ? a.contacts : [],
      preferred_lang: a.preferred_lang,
      dancer_id: a.dancer_id,
      stage_name: d?.stage_name ?? null,
      korean_name: d?.korean_name ?? null,
      slug: d?.slug ?? null,
      nationality: p?.nationality ?? null,
      has_visa: p?.has_visa ?? null,
      visa_label: p?.visa_type ? visaLabel(p.visa_type) : null,
    };
  });

  const newCount = rows.filter((r) => r.status === "new").length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 관리자 · 비자</p>
        <h1 className="text-2xl font-bold leading-tight tracking-tight">E-6-1 비자 신청</h1>
        <p className="text-sm text-ink-2">
          /visa 온보딩으로 들어온 해외 댄서 신청. 총 {rows.length}건
          {newCount > 0 ? ` · 신규 ${newCount}건` : ""}.
        </p>
      </header>

      <VisaAdminList rows={rows} />
    </div>
  );
}
