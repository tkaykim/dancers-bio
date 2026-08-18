import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { DancerProfileForm } from "@/components/portfolio/DancerProfileForm";
import { CareersNavLink } from "@/components/portfolio/CareersNavLink";
import { PortfolioFileUploader } from "@/components/portfolio/PortfolioFileUploader";
import { extractSocialHandle } from "@/lib/utils/social";
import type { NationalityOption } from "@/lib/nationality";

export default async function MyPortfolioEditPage({
  params,
}: {
  params: Promise<{ dancerId: string }>;
}) {
  const { dancerId } = await params;
  const user = await requireUser();
  const supabase = await createClient();
  const { data: dancer } = await supabase
    .from("dancers")
    .select(
      "id, profile_id, stage_name, korean_name, slug, gender, bio, location, specialties, genres, profile_img, social_links, approval_status, approval_reject_reason, portfolio_file_url, portfolio_file_name, portfolio_file_size_bytes, portfolio_file_mime, portfolio_file_uploaded_at",
    )
    .eq("id", dancerId)
    .maybeSingle();

  if (!dancer) notFound();

  // 키·신발 사이즈 + 국적·비자(민감정보) — 본인/관리자만 RLS로 조회됨.
  const { data: priv } = await supabase
    .from("dancer_private_info")
    .select(
      "height_cm, shoe_size_mm, nationalities, nationality_code, nationality, is_korean_national, has_visa, visa_type, visa_type_other, visa_expiry",
    )
    .eq("dancer_id", dancer.id)
    .maybeSingle();

  // Authorization: owner OR manager OR admin
  const isOwner = dancer.profile_id === user.id;
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = Boolean(profile?.is_admin);
  let isManager = false;
  if (!isOwner && !isAdmin) {
    const { data: mgr } = await supabase
      .from("dancer_managers")
      .select("dancer_id")
      .eq("dancer_id", dancer.id)
      .eq("manager_id", user.id)
      .maybeSingle();
    isManager = Boolean(mgr);
  }
  if (!isOwner && !isManager && !isAdmin) notFound();

  const social = (dancer.social_links ?? {}) as Record<string, string>;
  const publicHref = `/d/${dancer.slug ?? dancer.id}`;

  return (
    <div className="mx-auto flex max-w-md flex-col lg:max-w-2xl gap-8 px-6 py-8 pb-40">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            ↳ 댄서 포트폴리오
          </p>
          <h1 className="text-2xl font-bold tracking-tight leading-tight">
            프로필 편집
          </h1>
          <p className="text-sm text-ink-2">
            공개 페이지에 노출되는 정보를 편집합니다.
          </p>
        </div>
        <Link
          href={publicHref}
          className="shrink-0 rounded-full border border-hairline-2 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-ink-2 hover:text-foreground"
        >
          공개 보기 →
        </Link>
      </header>

      <ApprovalBanner dancer={dancer} />

      <DancerProfileForm
        userId={user.id}
        dancerId={dancer.id}
        currentProfileImg={dancer.profile_img ?? null}
        isCreate={false}
        defaultValues={{
          stage_name: dancer.stage_name ?? "",
          korean_name: dancer.korean_name ?? "",
          slug: dancer.slug ?? "",
          gender: dancer.gender ?? "",
          bio: dancer.bio ?? "",
          location: dancer.location ?? "",
          specialties: (dancer.specialties as string[] | null) ?? [],
          genres: (dancer.genres as string[] | null) ?? [],
          social_instagram: extractSocialHandle(social.instagram),
          social_youtube: extractSocialHandle(social.youtube),
          social_tiktok: extractSocialHandle(social.tiktok),
          height_cm: priv?.height_cm != null ? String(priv.height_cm) : "",
          shoe_size_mm: priv?.shoe_size_mm != null ? String(priv.shoe_size_mm) : "",
          nationalityVisa: {
            nationalities: Array.isArray(priv?.nationalities)
              ? (priv.nationalities as NationalityOption[])
              : undefined,
            nationality_code: (priv?.nationality_code as string | null) ?? undefined,
            nationality: (priv?.nationality as string | null) ?? undefined,
            is_korean_national:
              (priv?.is_korean_national as boolean | null) ?? undefined,
            has_visa: (priv?.has_visa as boolean | null) ?? undefined,
            visa_type: (priv?.visa_type as string | null) ?? undefined,
            visa_type_other: (priv?.visa_type_other as string | null) ?? undefined,
            visa_expiry: (priv?.visa_expiry as string | null) ?? undefined,
          },
        }}
      />

      {isOwner || isAdmin ? (
        <PortfolioFileUploader
          dancerId={dancer.id}
          initialFile={
            dancer.portfolio_file_url
              ? {
                  url: dancer.portfolio_file_url as string,
                  name: (dancer.portfolio_file_name as string | null) ?? null,
                  sizeBytes:
                    (dancer.portfolio_file_size_bytes as number | null) ?? null,
                  mime: (dancer.portfolio_file_mime as string | null) ?? null,
                  uploadedAt:
                    (dancer.portfolio_file_uploaded_at as string | null) ?? null,
                }
              : null
          }
        />
      ) : null}

      <CareersNavLink href={`/me/portfolio/${dancer.id}/careers`} />
    </div>
  );
}

function ApprovalBanner({
  dancer,
}: {
  dancer: {
    approval_status: "pending" | "approved" | "rejected" | null;
    approval_reject_reason: string | null;
  };
}) {
  const status = dancer.approval_status ?? "pending";
  if (status === "approved") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-ok/30 bg-ok/5 px-4 py-3 text-sm text-ok">
        <span className="text-base">●</span>
        <span>공개 중 — 디렉토리에 노출되고 있습니다.</span>
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <div className="flex flex-col gap-1 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        <p className="font-semibold">거부됨 — 디렉토리에 노출되지 않습니다.</p>
        {dancer.approval_reject_reason ? (
          <p className="text-xs text-destructive/80">
            사유: {dancer.approval_reject_reason}
          </p>
        ) : null}
        <p className="text-xs text-destructive/80">
          내용을 수정해도 재노출은 관리자가 다시 검토해야 합니다.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-warn">
      <p className="font-semibold">심사 중</p>
      <p className="text-xs text-warn/80">
        관리자 승인 후 공개 디렉토리에 노출됩니다.
      </p>
    </div>
  );
}
