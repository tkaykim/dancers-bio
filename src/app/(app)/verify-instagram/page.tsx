import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { InstagramVerifyForm } from "@/components/verification/InstagramVerifyForm";

function pickActive<T extends { status: string; expires_at: string }>(rows: T[]): T | undefined {
  const now = Date.now();
  return rows.find((v) => v.status === "pending" && new Date(v.expires_at).getTime() > now);
}

export default async function VerifyInstagramPage() {
  const profile = await requireProfile();
  if (profile.can_create_project || profile.is_admin) {
    // 이미 권한 있음 → /me로
    redirect("/me");
  }

  const supabase = await createClient();
  const { data: pending } = await supabase
    .from("instagram_verifications")
    .select("id, code, instagram_handle, expires_at, status, reject_reason, reviewed_at")
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const active = pickActive(pending ?? []);
  const recentReject = (pending ?? []).find((v) => v.status === "rejected");

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 본인인증
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          인스타그램으로<br />
          본인 확인
        </h1>
        <p className="text-sm text-ink-2 leading-relaxed">
          프로젝트를 개설하고 다이렉트 제안을 보내려면 본인 인증이 필요합니다.
          인스타그램 DM 1회로 끝납니다.
        </p>
      </header>

      {recentReject?.reject_reason ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-semibold text-destructive">이전 요청 반려</p>
          <p className="mt-1 text-ink-2">{recentReject.reject_reason}</p>
        </div>
      ) : null}

      <InstagramVerifyForm
        initial={
          active
            ? {
                code: active.code,
                handle: active.instagram_handle,
                expires_at: active.expires_at,
              }
            : null
        }
      />

      <Link
        href="/me"
        className="text-xs uppercase tracking-[0.14em] text-ink-3 underline-offset-4 hover:underline"
      >
        ← 내 프로필로
      </Link>
    </div>
  );
}
