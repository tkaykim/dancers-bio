import { notFound } from "next/navigation";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyHeightToken } from "@/lib/quick-token";
import { QuickHeightForm } from "@/components/portfolio/QuickHeightForm";

// 로그인 없이 키·신발만 빠르게 받는 공개 페이지. /h/<token>
export default async function QuickHeightPage({
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
    .select("height_cm, shoe_size_mm")
    .eq("dancer_id", dancerId)
    .maybeSingle();

  const name = (d.stage_name as string) ?? "댄서";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <DeetzLogo className="h-8 w-auto" priority />
        <h1 className="text-xl font-bold leading-tight">
          {name}님, 키만 빠르게 입력해 주세요
        </h1>
        <p className="text-sm text-ink-2 leading-relaxed">
          로그인 없이 바로 저장됩니다.
          <br />
          입력해 두시면 캐스팅 매칭·섭외 확률이 올라가요.
        </p>
      </div>

      <QuickHeightForm
        token={token}
        name={name}
        height={(priv?.height_cm as number | null) ?? null}
        shoe={(priv?.shoe_size_mm as number | null) ?? null}
      />
    </div>
  );
}
