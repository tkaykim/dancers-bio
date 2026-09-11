import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { InstagramVerifyForm } from "@/components/verification/InstagramVerifyForm";
import { serverT } from "@/lib/i18n/server";
import applications from "@/lib/i18n/messages/applications";

function pickActive<T extends { status: string; expires_at: string }>(rows: T[]): T | undefined {
  const now = Date.now();
  return rows.find((v) => v.status === "pending" && new Date(v.expires_at).getTime() > now);
}

/** 문장 안의 이용자 작성 조각만 감싼다(언어마다 어순이 달라 문장을 쪼개지 않는다). */
function withUgc(text: string, part: string): ReactNode {
  const at = part ? text.indexOf(part) : -1;
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <span data-ugc="">{part}</span>
      {text.slice(at + part.length)}
    </>
  );
}

export default async function VerifyInstagramPage({
  searchParams,
}: {
  searchParams: Promise<{ claim?: string }>;
}) {
  const profile = await requireProfile();
  const { claim: claimParam } = await searchParams;
  const claimMode = !!claimParam;

  // claim 모드에서는 admin/can_create_project 와 무관하게 진입 허용 (본인 인증이 목적).
  if (!claimMode && (profile.can_create_project || profile.is_admin)) {
    redirect("/me");
  }

  const supabase = await createClient();
  const t = await serverT(applications);

  // claim 모드일 때 대상 dancer 정보 + claim 소유 검증.
  let claimContext: { dancer: { id: string; stage_name: string; slug: string | null; profile_img: string | null } } | null = null;
  if (claimMode) {
    const { data: claim } = await supabase
      .from("dancer_claim_requests")
      .select("id, dancer_id, requester_id, status")
      .eq("id", claimParam)
      .maybeSingle();
    if (!claim || claim.requester_id !== profile.id) notFound();
    if (claim.status !== "pending") {
      // 이미 처리된 claim — /me로
      redirect("/me");
    }
    // claim 대상은 미승인 큐레이션 댄서일 수 있다. 위에서 claim 소유(requester_id)를
    // 검증했으므로, 미승인이라도 보여주기 위해 admin read-only 로 단건 조회.
    const { data: dancer } = await createAdminClient()
      .from("dancers")
      .select("id, stage_name, slug, profile_img")
      .eq("id", claim.dancer_id)
      .maybeSingle();
    if (!dancer) notFound();
    claimContext = { dancer };
  }

  // pending 검색: claim 모드면 같은 claim 의 IG 인증만, 아니면 NULL claim_request_id.
  let pendingQ = supabase
    .from("instagram_verifications")
    .select("id, code, instagram_handle, expires_at, status, reject_reason, reviewed_at, claim_request_id")
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(5);
  pendingQ = claimMode
    ? pendingQ.eq("claim_request_id", claimParam!)
    : pendingQ.is("claim_request_id", null);
  const { data: pending } = await pendingQ;

  const active = pickActive(pending ?? []);
  const recentReject = (pending ?? []).find((v) => v.status === "rejected");

  return (
    <div className="mx-auto flex max-w-md flex-col lg:max-w-2xl gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          {t("verify.eyebrow")}
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          {claimMode ? t("verify.title.claim") : t("verify.title")}
        </h1>
        {claimMode && claimContext ? (
          <div className="mt-2 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
            {claimContext.dancer.profile_img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={claimContext.dancer.profile_img}
                alt={claimContext.dancer.stage_name}
                className="h-10 w-10 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold">
                {claimContext.dancer.stage_name[0] ?? "?"}
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-semibold">
                {withUgc(
                  t("verify.claim.heading", { name: claimContext.dancer.stage_name }),
                  claimContext.dancer.stage_name,
                )}
              </p>
              <p className="text-[11px] text-ink-3">{t("verify.claim.desc")}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-2 leading-relaxed">{t("verify.intro")}</p>
        )}
      </header>

      {recentReject?.reject_reason ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-semibold text-destructive">{t("verify.reject.title")}</p>
          <p className="mt-1 text-ink-2" data-ugc="">
            {recentReject.reject_reason}
          </p>
        </div>
      ) : null}

      <InstagramVerifyForm
        claimRequestId={claimMode ? claimParam : null}
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
        href={claimMode ? "/me/portfolio" : "/me"}
        className="text-xs uppercase tracking-[0.14em] text-ink-3 underline-offset-4 hover:underline"
      >
        {claimMode ? t("verify.back.portfolio") : t("verify.back.profile")}
      </Link>
    </div>
  );
}
