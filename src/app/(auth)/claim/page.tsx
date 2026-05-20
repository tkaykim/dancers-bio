import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ClaimForm } from "@/components/auth/ClaimForm";

interface SearchParams {
  email?: string;
  dancer?: string;
}

async function fetchDancerPreview(slug: string | undefined) {
  if (!slug) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("dancers")
    .select("id, stage_name, korean_name, profile_img, slug, location, genres, specialties")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return null;
  const { count } = await supabase
    .from("careers")
    .select("id", { count: "exact", head: true })
    .eq("dancer_id", data.id);
  return { ...data, career_count: count ?? 0 };
}

export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { email = "", dancer } = await searchParams;
  const dancerPreview = await fetchDancerPreview(dancer);

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-6 px-6 pb-12 pt-10">
      <Link href="/" className="flex items-baseline gap-1.5 self-start">
        <span className="text-2xl font-extrabold tracking-tight leading-none">
          Cue
        </span>
        <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
      </Link>

      <div className="flex flex-col gap-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          그리고엔터테인먼트 × dancers.bio
        </p>
        <h1 className="text-[28px] font-extrabold tracking-tight leading-[1.2]">
          {dancerPreview?.stage_name ? (
            <>
              {dancerPreview.stage_name}님,<br />
              프로필이 준비됐어요
            </>
          ) : (
            <>프로필이<br />준비됐어요</>
          )}
        </h1>
        <p className="text-sm text-ink-2 leading-relaxed">
          그리고엔터 에이전시 풀에 지원해주신 정보로<br />
          dancers.bio 댄서 프로필을 미리 만들어두었습니다.
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
            <p className="mt-0.5 text-xs text-ink-3">
              경력 {dancerPreview.career_count}건
              {dancerPreview.location ? ` · ${dancerPreview.location}` : ""}
            </p>
          </div>
          <span className="text-xs font-medium text-primary">미리보기 →</span>
        </Link>
      ) : null}

      <ClaimForm initialEmail={email} dancerSlug={dancer} />

      <div className="rounded-xl bg-muted/50 p-4 text-xs leading-relaxed text-ink-2">
        <p className="font-semibold text-ink-2 mb-1.5">이 페이지가 보이는 이유</p>
        지원하실 때 입력하신 이메일로 dancers.bio 계정을 미리 만들어두었습니다.
        비밀번호만 새로 설정하시면 바로 로그인할 수 있고, 본인 프로필이 자동으로 연결됩니다.
      </div>

      <p className="text-center text-xs text-ink-3">
        이미 비밀번호를 설정하셨나요?{" "}
        <Link href="/login" className="font-medium text-foreground underline-offset-2 hover:underline">
          로그인
        </Link>
      </p>
    </div>
  );
}
