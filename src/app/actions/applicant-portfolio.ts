"use server";

import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeNationalityOptions,
  type NationalityOption,
} from "@/lib/nationality";
import {
  resolveApplicantNationalityAccess,
  type ApplicantNationalityAccess,
} from "@/lib/applicant-nationality-visibility";
import type { ActionResult } from "./auth";

export type PortfolioCareer = {
  id: number;
  type: string | null;
  title: string | null;
  date: string | null;
  link: string | null;
  is_representative: boolean;
};

export type ApplicantPortfolio = {
  dancer: {
    id: string;
    stage_name: string;
    korean_name: string | null;
    slug: string | null;
    profile_img: string | null;
    bio: string | null;
    location: string | null;
    gender: string | null;
    genres: string[] | null;
    specialties: string[] | null;
    portfolio_file_url: string | null;
    portfolio_file_name: string | null;
    social_links: Record<string, string> | null;
  } | null;
  careers: PortfolioCareer[];
  // 민감정보(dancer_private_info/계정) — 매니저(admin·소유자·공동관리자)에게만 노출.
  birth_year: number | null;
  height_cm: number | null;
  shoe_size_mm: number | null;
  contactEmail: string | null;
  contactPhone: string | null;
  /** 동의 스냅샷 또는 플랫폼 슈퍼관리자 전용 현재 국적을 반환한다. */
  disclosedNationalities: NationalityOption[];
  /** 동의 스냅샷·플랫폼 관리자 전용 현재값·미공개를 UI에서 구분한다. */
  nationalityAccess: ApplicantNationalityAccess;
  // 정산 — 이 프로젝트×댄서의 확정 금액/상태 (없으면 null)
  settlement: { gross_amount: number; status: string } | null;
};

// 지원자(댄서) 포트폴리오를 심사 시트에서 lazy-load.
// 매니저(소유자·슈퍼·공동)만 호출 가능 — canManageProject 게이트.
export async function getApplicantPortfolioAction(
  projectId: string,
  dancerId: string,
  applicationId: string,
): Promise<ActionResult<ApplicantPortfolio>> {
  const user = await requireUser();
  if (!projectId || !dancerId || !applicationId)
    return { ok: false, error: "잘못된 요청입니다." };

  const supabase = await createClient();
  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const isPlatformAdmin = viewerProfile?.is_admin === true;
  const canManageWholeProject = await canManageProject(projectId);
  let canViewChannelApplicant = false;
  if (!canManageWholeProject) {
    const { data: visibleApp } = await supabase
      .from("applications")
      .select("id, project_id, recruitment_channel_id")
      .eq("id", applicationId)
      .eq("project_id", projectId)
      .eq("dancer_id", dancerId)
      .not("recruitment_channel_id", "is", null)
      .is("archived_at", null)
      .maybeSingle();
    const channelId =
      (visibleApp?.recruitment_channel_id as string | null) ?? null;
    if (channelId) {
      const { data: visibleChannels } = await supabase
        .from("recruitment_channels")
        .select("id")
        .eq("id", channelId)
        .eq("project_id", projectId)
        .limit(1);
      canViewChannelApplicant = (visibleChannels?.length ?? 0) > 0;
    }
  }

  if (!canManageWholeProject && !canViewChannelApplicant)
    return { ok: false, error: "권한이 없습니다." };

  // 게이트(canManageProject 또는 채널 가시성)를 이미 통과했으므로, 지원자 댄서의
  // 승인 여부(approval_status)와 무관하게 매니저(공동관리자 포함)가 전체 포트폴리오를
  // 볼 수 있어야 한다. RLS 클라이언트는 미승인(pending) 댄서를 공동관리자에게 숨기므로
  // (dancers_select_public: approved만 일반 노출) service-role로 읽는다.
  // careers는 is_public=true라 RLS로도 보이지만, 헤더·SNS 정보가 담긴 dancers 행이
  // 안 보이면 시트에 이름만 뜨는 문제가 생겨 함께 service-role로 통일한다.
  const admin = createAdminClient();
  const [{ data: d }, { data: c }] = await Promise.all([
    admin
      .from("dancers")
      .select(
        "id, stage_name, korean_name, slug, profile_img, bio, location, gender, genres, specialties, portfolio_file_url, portfolio_file_name, social_links",
      )
      .eq("id", dancerId)
      .maybeSingle(),
    admin
      .from("careers")
      .select("id, type, title, date, details, is_representative, sort_order")
      .eq("dancer_id", dancerId)
      .eq("is_public", true)
      .order("is_representative", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("date", { ascending: false })
      .limit(60),
  ]);

  const careers: PortfolioCareer[] = (
    (c ?? []) as unknown as Array<{
      id: number;
      type: string | null;
      title: string | null;
      date: string | null;
      details: { link?: string | null } | null;
      is_representative: boolean | null;
    }>
  ).map((r) => ({
    id: r.id,
    type: r.type ?? null,
    title: r.title ?? null,
    date: r.date ?? null,
    link: r.details?.link ?? null,
    is_representative: !!r.is_representative,
  }));

  // 출생연도·키·연락처는 매니저에게 노출한다. 국적은 지원서 동의 스냅샷을
  // 우선하고, 미동의·레거시 지원서는 플랫폼 슈퍼관리자에게만 현재값을 반환한다.
  let birth_year: number | null = null;
  let height_cm: number | null = null;
  let shoe_size_mm: number | null = null;
  let contactEmail: string | null = null;
  let contactPhone: string | null = null;
  let disclosedNationalities: NationalityOption[] = [];
  let nationalityAccess: ApplicantNationalityAccess = "not_disclosed";
  let settlement: { gross_amount: number; status: string } | null = null;
  try {
    const applicationQuery = admin
      .from("applications")
      .select("id, project_id, dancer_id, nationality_disclosure_consent, disclosed_nationalities")
      .eq("id", applicationId)
      .eq("project_id", projectId)
      .eq("dancer_id", dancerId)
      .is("archived_at", null)
      .limit(1);
    const { data: application } = await applicationQuery.maybeSingle();
    nationalityAccess = resolveApplicantNationalityAccess(
      application?.nationality_disclosure_consent === true,
      isPlatformAdmin,
    );
    if (nationalityAccess === "consented") {
      disclosedNationalities = normalizeNationalityOptions(
        application?.disclosed_nationalities,
      );
    }

    const { data: st } = await admin
      .from("settlements")
      .select("gross_amount, status")
      .eq("project_id", projectId)
      .eq("dancer_id", dancerId)
      .maybeSingle();
    settlement = st
      ? { gross_amount: st.gross_amount as number, status: st.status as string }
      : null;
    const { data: priv } = await admin
      .from("dancer_private_info")
      .select("birth_date, height_cm, shoe_size_mm, email, phone, nationalities")
      .eq("dancer_id", dancerId)
      .maybeSingle();
    birth_year = priv?.birth_date
      ? Number(String(priv.birth_date).slice(0, 4))
      : null;
    height_cm = (priv?.height_cm as number | null) ?? null;
    shoe_size_mm = (priv?.shoe_size_mm as number | null) ?? null;
    contactEmail = (priv?.email as string | null) ?? null;
    contactPhone = (priv?.phone as string | null) ?? null;
    if (nationalityAccess === "platform_admin") {
      disclosedNationalities = normalizeNationalityOptions(priv?.nationalities);
    }

    // 실제 지원 계정의 이메일·전화 (가장 정확) — 이 프로젝트에 지원한 행 기준
    const { data: app } = await admin
      .from("applications")
      .select("applicant_id")
      .eq("id", applicationId)
      .eq("project_id", projectId)
      .eq("dancer_id", dancerId)
      .limit(1)
      .maybeSingle();
    const acctId = (app?.applicant_id as string | null) ?? null;
    if (acctId) {
      const { data: u } = await admin.auth.admin.getUserById(acctId);
      if (u?.user?.email) contactEmail = u.user.email; // 계정 이메일 우선
      if (!contactPhone) {
        const { data: pf } = await admin
          .from("profiles")
          .select("phone")
          .eq("id", acctId)
          .maybeSingle();
        contactPhone = (pf?.phone as string | null) ?? null;
      }
    }
  } catch {
    // service key 미설정 등 — 비치명적
  }

  return {
    ok: true,
    data: {
      dancer: (d ?? null) as ApplicantPortfolio["dancer"],
      careers,
      birth_year,
      height_cm,
      shoe_size_mm,
      contactEmail,
      contactPhone,
      disclosedNationalities,
      nationalityAccess,
      settlement,
    },
  };
}
