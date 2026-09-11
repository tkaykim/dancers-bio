import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { BRAND_META } from "@/lib/brand";
import { brandMetadata, getBrand } from "@/lib/brand-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { OnboardingLoginModal } from "@/components/auth/OnboardingLoginModal";
import { getLocale, serverT } from "@/lib/i18n/server";
import { tCount } from "@/lib/i18n/t";
import auth from "@/lib/i18n/messages/auth";

type DancerRow = {
  id: string;
  stage_name: string;
  korean_name: string | null;
  profile_img: string | null;
  location: string | null;
  genres: string[] | null;
  slug: string | null;
  bio: string | null;
};

// GRIGO 화이트라벨 호스트에서만 탭 제목을 덮어 deetz 표기가 새지 않게 한다.
export async function generateMetadata(): Promise<Metadata> {
  const t = await serverT(auth);
  return brandMetadata(t("meta.welcome_grigo"));
}

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; email?: string; next?: string }>;
}) {
  const { d, email = "", next } = await searchParams;
  // 로그인·클레임 후 이동할 경로. 오픈리다이렉트 방지: 앱 내부 상대경로(/...)만 허용.
  const redirectTo =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/me/portfolio";
  // 초대 랜딩(비로그인) — 미승인 큐레이션 프로필도 보여줘야 하므로 admin read-only.
  const admin = createAdminClient();
  const brand = await getBrand();
  // GRIGO 호스트에서는 co-branding(× deetz) 없이 GRIGO 단독 안내로 보인다.
  const isGrigo = brand === "grigo";
  const brandName = BRAND_META[brand].name;
  const t = await serverT(auth);
  const locale = await getLocale();

  let dancer: DancerRow | null = null;
  let careerCount = 0;
  let highlights: { title: string; year: string | null }[] = [];

  if (d) {
    const { data } = await admin
      .from("dancers")
      .select("id, stage_name, korean_name, profile_img, location, genres, slug, bio")
      .eq("slug", d)
      .maybeSingle();
    dancer = (data as DancerRow | null) ?? null;
    if (dancer) {
      const { count } = await admin
        .from("careers")
        .select("id", { count: "exact", head: true })
        .eq("dancer_id", dancer.id);
      careerCount = count ?? 0;
      const { data: cs } = await admin
        .from("careers")
        .select("title, details, is_representative, sort_order")
        .eq("dancer_id", dancer.id)
        .order("is_representative", { ascending: false })
        .order("sort_order", { ascending: false })
        .limit(4);
      highlights = (cs ?? []).map((c) => ({
        title: (c.title as string) ?? "",
        year:
          ((c.details as Record<string, string> | null)?.year as string | null) ??
          null,
      }));
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-6 pb-28 pt-12">
      {/* GRIGO 호스트의 루트는 외부 리다이렉트라 로고를 링크로 감싸지 않는다. */}
      {isGrigo ? (
        <BrandLogo brand={brand} className="mb-7 h-8 w-auto" priority />
      ) : (
        <Link href="/" className="mb-7 inline-flex">
          <BrandLogo brand={brand} className="h-8 w-auto" priority />
        </Link>
      )}

      <p className="text-xs font-semibold uppercase tracking-wider text-primary">
        {isGrigo ? BRAND_META.grigo.orgName : t("welcome.eyebrow")}
      </p>
      {/* 활동명이 들어가는 문장이라 언어 스윕에서 제외한다. */}
      <h1
        className="mt-2 whitespace-pre-line text-[28px] font-extrabold leading-[1.2] tracking-tight"
        data-ugc={dancer ? "" : undefined}
      >
        {dancer ? t("welcome.title_named", { name: dancer.stage_name }) : t("welcome.title")}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        {t("welcome.lede", { brand: brandName })}
      </p>

      {/* 프로필 미리보기 */}
      {dancer ? (
        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="relative aspect-[4/5] w-full bg-secondary">
            {dancer.profile_img ? (
              <Image
                src={dancer.profile_img}
                alt={dancer.stage_name}
                fill
                sizes="(max-width:480px) 100vw, 480px"
                className="object-cover"
                priority
              />
            ) : null}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5">
              <p className="text-xl font-bold text-white">{dancer.stage_name}</p>
              {dancer.korean_name ? (
                <p className="text-sm text-white/80">{dancer.korean_name}</p>
              ) : null}
              <p className="mt-1 text-xs text-white/70" data-ugc>
                {dancer.location
                  ? tCount(t, "welcome.career_count_location", locale, careerCount, {
                      location: dancer.location,
                    })
                  : tCount(t, "welcome.career_count", locale, careerCount)}
              </p>
            </div>
          </div>

          {dancer.genres && dancer.genres.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 px-5 pt-4">
              {dancer.genres.slice(0, 6).map((g) => (
                <span
                  key={g}
                  className="rounded-full border border-hairline-2 px-2.5 py-0.5 text-[11px] text-ink-2"
                >
                  {g}
                </span>
              ))}
            </div>
          ) : null}

          {highlights.length > 0 ? (
            <ul className="flex flex-col gap-2 px-5 py-4">
              {highlights.map((h, i) => (
                <li key={i} className="flex gap-2 text-sm text-ink-2">
                  {h.year ? (
                    <span className="shrink-0 font-mono text-xs text-ink-3">
                      {h.year}
                    </span>
                  ) : null}
                  <span className="truncate">{h.title}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {dancer.slug ? (
            <div className="border-t border-hairline-2 px-5 py-3">
              <Link
                href={`/d/${dancer.slug}`}
                target="_blank"
                rel="noopener"
                className="text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                {t("welcome.view_public_profile")}
              </Link>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-hairline-2 p-6 text-center text-sm text-ink-3">
          {t("welcome.preview_failed")}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-ink-3">
        {t("welcome.scroll_hint")}
      </p>

      <OnboardingLoginModal email={email} redirectTo={redirectTo} />
    </div>
  );
}
