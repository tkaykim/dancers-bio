import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { DancerProfileForm } from "@/components/portfolio/DancerProfileForm";

export default async function MyPortfolioPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: dancer } = await supabase
    .from("dancers")
    .select(
      "id, profile_id, stage_name, korean_name, slug, gender, bio, location, specialties, genres, profile_img, social_links, approval_status, approval_reject_reason",
    )
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!dancer) {
    redirect("/onboarding/create");
  }

  const social = (dancer.social_links ?? {}) as Record<string, string>;
  const publicHref = `/d/${dancer.slug ?? dancer.id}`;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-8 px-6 py-8">
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

      {dancer.profile_img ? (
        <Image
          src={dancer.profile_img}
          alt={dancer.stage_name}
          width={120}
          height={120}
          className="h-30 w-30 self-start rounded-2xl object-cover"
        />
      ) : null}

      <DancerProfileForm
        userId={user.id}
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
          social_instagram: social.instagram ?? "",
          social_youtube: social.youtube ?? "",
          social_tiktok: social.tiktok ?? "",
        }}
      />

      <Link
        href="/me/portfolio/careers"
        className="group flex flex-col gap-1.5 rounded-xl border border-border bg-card p-5 transition-colors hover:bg-secondary"
      >
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            ↳ 경력 관리
          </p>
          <span className="text-ink-3 transition-transform group-hover:translate-x-1">
            →
          </span>
        </div>
        <p className="text-lg font-bold leading-tight">
          안무·출연·수상·공연.
        </p>
        <p className="text-sm text-ink-2">
          카테고리별로 경력을 추가하고 영상 링크를 첨부합니다.
        </p>
      </Link>
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
