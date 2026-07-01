import { notFound } from "next/navigation";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyHeightToken } from "@/lib/quick-token";
import { QuickFitForm } from "@/components/portfolio/QuickFitForm";

// 로그인 없이 상·하의 사이즈만 빠르게 받는 공개 페이지. /fit/<token>
// 토큰 = /h 와 동일 서명(payload=dancer_id).
export default async function QuickFitPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const dancerId = verifyHeightToken(token);
  if (!dancerId) notFound();

  const admin = createAdminClient();
  const { data: d } = await admin
    .from("dancers")
    .select("stage_name")
    .eq("id", dancerId)
    .maybeSingle();
  if (!d) notFound();
  const { data: priv } = await admin
    .from("dancer_private_info")
    .select("top_size, bottom_size")
    .eq("dancer_id", dancerId)
    .maybeSingle();

  const name = (d.stage_name as string) ?? "댄서";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <DeetzLogo className="h-8 w-auto" priority />
        <h1 className="text-xl font-bold leading-tight">
          {name}님, 상·하의 사이즈를 입력해 주세요
        </h1>
        <p className="text-sm text-ink-2 leading-relaxed">
          남자아이돌 뮤직비디오 의상 준비를 위한 사이즈 조사입니다.
          <br />
          신발은 검정색으로 준비해 본인이 직접 신고 오시면 됩니다.
        </p>
      </div>

      <QuickFitForm
        token={token}
        name={name}
        top={(priv?.top_size as string | null) ?? null}
        bottom={(priv?.bottom_size as string | null) ?? null}
      />
    </div>
  );
}
