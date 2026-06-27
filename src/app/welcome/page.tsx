import Link from "next/link";
import Image from "next/image";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { createAdminClient } from "@/lib/supabase/admin";
import { OnboardingLoginModal } from "@/components/auth/OnboardingLoginModal";

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
      <Link href="/" className="mb-7 inline-flex">
        <DeetzLogo className="h-8 w-auto" priority />
      </Link>

      <p className="text-xs font-semibold uppercase tracking-wider text-primary">
        그리고엔터테인먼트 × deetz
      </p>
      <h1 className="mt-2 text-[28px] font-extrabold leading-[1.2] tracking-tight">
        {dancer ? (
          <>
            {dancer.stage_name}님,
            <br />
            프로필이 준비됐어요
          </>
        ) : (
          <>프로필이 준비됐어요</>
        )}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        에이전시 풀에 제출해주신 정보로 deetz 프로필을 미리 만들어 두었습니다.
        아래 프로필이 회원님 본인이 맞다면, 로그인하고 직접 관리해 보세요.
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
              <p className="mt-1 text-xs text-white/70">
                경력 {careerCount}건
                {dancer.location ? ` · ${dancer.location}` : ""}
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
                공개 프로필 전체 보기 ↗
              </Link>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-hairline-2 p-6 text-center text-sm text-ink-3">
          프로필 미리보기를 불러오지 못했어요. 메일의 로그인 정보로 로그인하면
          본인 프로필을 확인할 수 있습니다.
        </div>
      )}

      <p className="mt-6 text-center text-xs text-ink-3">
        아래로 스크롤하거나 버튼을 누르면 로그인 창이 열립니다.
      </p>

      <OnboardingLoginModal email={email} redirectTo={redirectTo} />
    </div>
  );
}
