"use server";

import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
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
  } | null;
  careers: PortfolioCareer[];
};

// 지원자(댄서) 포트폴리오를 심사 시트에서 lazy-load.
// 매니저(소유자·슈퍼·공동)만 호출 가능 — canManageProject 게이트.
export async function getApplicantPortfolioAction(
  projectId: string,
  dancerId: string,
): Promise<ActionResult<ApplicantPortfolio>> {
  await requireUser();
  if (!projectId || !dancerId) return { ok: false, error: "잘못된 요청입니다." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  const supabase = await createClient();
  const [{ data: d }, { data: c }] = await Promise.all([
    supabase
      .from("dancers")
      .select(
        "id, stage_name, korean_name, slug, profile_img, bio, location, gender, genres, specialties, portfolio_file_url, portfolio_file_name",
      )
      .eq("id", dancerId)
      .maybeSingle(),
    supabase
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

  return {
    ok: true,
    data: {
      dancer: (d ?? null) as ApplicantPortfolio["dancer"],
      careers,
    },
  };
}
