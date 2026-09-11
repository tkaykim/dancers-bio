import Link from "next/link";
import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { BRAND_META } from "@/lib/brand";
import { brandMetadata, getBrand } from "@/lib/brand-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClaimForm } from "@/components/auth/ClaimForm";
import { getLocale, serverT } from "@/lib/i18n/server";
import { tCount } from "@/lib/i18n/t";
import auth from "@/lib/i18n/messages/auth";

interface SearchParams {
  email?: string;
  dancer?: string;
}

// 초대받은(비로그인) 댄서에게 보여주는 큐레이션 프로필 프리뷰.
// 큐레이션 댄서는 아직 미승인(pending)일 수 있어 RLS 공개 정책으로는 안 보인다.
// slug 단건 read-only 이므로 service-role(admin) 클라이언트로 조회한다.
async function fetchDancerPreview(slug: string | undefined) {
  if (!slug) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("dancers")
    .select("id, stage_name, korean_name, profile_img, slug, location, genres, specialties")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return null;
  const { count } = await admin
    .from("careers")
    .select("id", { count: "exact", head: true })
    .eq("dancer_id", data.id);
  return { ...data, career_count: count ?? 0 };
}

// GRIGO 화이트라벨 호스트에서만 탭 제목을 덮어 deetz 표기가 새지 않게 한다.
export async function generateMetadata(): Promise<Metadata> {
  const t = await serverT(auth);
  return brandMetadata(t("meta.claim_grigo"));
}

export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { email = "", dancer } = await searchParams;
  const dancerPreview = await fetchDancerPreview(dancer);
  const brand = await getBrand();
  // GRIGO 호스트에서는 co-branding(× deetz) 없이 GRIGO 단독 안내로 보인다.
  const isGrigo = brand === "grigo";
  const brandName = BRAND_META[brand].name;
  const t = await serverT(auth);
  const locale = await getLocale();

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col lg:justify-center gap-6 px-6 pb-12 pt-10">
      {/* GRIGO 호스트의 루트는 외부 리다이렉트라 로고를 링크로 감싸지 않는다. */}
      {isGrigo ? (
        <BrandLogo brand={brand} className="h-8 w-auto" priority />
      ) : (
        <Link href="/" className="inline-flex self-start">
          <BrandLogo brand={brand} className="h-8 w-auto" priority />
        </Link>
      )}

      <div className="flex flex-col gap-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          {isGrigo ? BRAND_META.grigo.orgName : t("claim.eyebrow")}
        </p>
        {/* 활동명이 들어가는 문장이라 언어 스윕에서 제외한다. */}
        <h1
          className="whitespace-pre-line text-[28px] font-extrabold tracking-tight leading-[1.2]"
          data-ugc={dancerPreview?.stage_name ? "" : undefined}
        >
          {dancerPreview?.stage_name
            ? t("claim.title_named", { name: dancerPreview.stage_name })
            : t("claim.title")}
        </h1>
        <p className="whitespace-pre-line text-sm text-ink-2 leading-relaxed">
          {isGrigo ? t("claim.lede_grigo") : t("claim.lede_deetz")}
        </p>
      </div>

      {dancerPreview ? (
        <Link
          href={`/d/${dancerPreview.slug}`}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40"
        >
          {dancerPreview.profile_img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dancerPreview.profile_img}
              alt={dancerPreview.stage_name}
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-muted" />
          )}
          <div className="flex-1 min-w-0">
            <p className="truncate text-base font-semibold">{dancerPreview.stage_name}</p>
            {dancerPreview.korean_name ? (
              <p className="truncate text-sm text-ink-2">{dancerPreview.korean_name}</p>
            ) : null}
            <p className="mt-0.5 text-xs text-ink-3" data-ugc>
              {dancerPreview.location
                ? tCount(t, "claim.career_count_location", locale, dancerPreview.career_count, {
                    location: dancerPreview.location,
                  })
                : tCount(t, "claim.career_count", locale, dancerPreview.career_count)}
            </p>
          </div>
          <span className="text-xs font-medium text-primary whitespace-nowrap">
            {t("claim.new_tab")}
          </span>
        </Link>
      ) : null}

      <ClaimForm initialEmail={email} dancerSlug={dancer} brandName={brandName} />

      <div className="rounded-xl bg-muted/50 p-4 text-xs leading-relaxed text-ink-2">
        <p className="font-semibold text-ink-2 mb-1.5">{t("claim.why_title")}</p>
        {t("claim.why_body", { brand: brandName })}
      </div>

      <p className="text-center text-xs text-ink-3">
        {t("claim.already_set")}{" "}
        <Link href="/login" className="font-medium text-foreground underline-offset-2 hover:underline">
          {t("claim.login_link")}
        </Link>
      </p>
    </div>
  );
}
