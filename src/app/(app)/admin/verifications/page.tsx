import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { AdminVerificationActions } from "@/components/verification/AdminVerificationActions";

type VerifRow = {
  id: string;
  profile_id: string;
  code: string;
  instagram_handle: string;
  status: "pending" | "approved" | "rejected" | "expired";
  reject_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  expires_at: string;
  claim_request_id: string | null;
};

type ClaimContext = {
  claim_request_id: string;
  dancer_id: string;
  dancer_stage_name: string;
  dancer_slug: string | null;
  relation: string;
};

type ProfileLite = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

export default async function AdminVerificationsPage() {
  const profile = await requireProfile();
  if (!profile.is_admin) notFound();

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("instagram_verifications")
    .select(
      "id, profile_id, code, instagram_handle, status, reject_reason, reviewed_at, created_at, expires_at, claim_request_id",
    )
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(100);

  const list = (rows ?? []) as VerifRow[];
  const profileIds = Array.from(new Set(list.map((r) => r.profile_id)));
  const profileMap = new Map<string, ProfileLite>();
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", profileIds);
    for (const p of profiles ?? []) profileMap.set(p.id, p);
  }

  // claim 컨텍스트 일괄 조회.
  const claimIds = Array.from(
    new Set(list.map((r) => r.claim_request_id).filter((v): v is string => !!v)),
  );
  const claimMap = new Map<string, ClaimContext>();
  if (claimIds.length > 0) {
    const { data: claims } = await supabase
      .from("dancer_claim_requests")
      .select("id, dancer_id, relation, dancers:dancer_id(stage_name, slug)")
      .in("id", claimIds);
    for (const c of (claims ?? []) as unknown as Array<{
      id: string;
      dancer_id: string;
      relation: string;
      dancers: { stage_name: string; slug: string | null } | null;
    }>) {
      claimMap.set(c.id, {
        claim_request_id: c.id,
        dancer_id: c.dancer_id,
        dancer_stage_name: c.dancers?.stage_name ?? "(이름 없음)",
        dancer_slug: c.dancers?.slug ?? null,
        relation: c.relation,
      });
    }
  }

  const pending = list.filter((r) => r.status === "pending");
  const others = list.filter((r) => r.status !== "pending");

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 관리자 / 인증 큐
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          Instagram verifications
        </h1>
        <p className="text-sm text-ink-2">
          @dancers.bio DM에서 받은 코드와 매칭되는 요청을 찾아 승인/반려합니다.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          대기 중 ({pending.length})
        </p>
        {pending.length === 0 ? (
          <p className="rounded-xl border border-dashed border-hairline-2 p-6 text-center text-sm text-ink-3">
            대기 중인 인증 요청이 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((r) => (
              <VerifRowCard
                key={r.id}
                row={r}
                user={profileMap.get(r.profile_id)}
                claim={r.claim_request_id ? claimMap.get(r.claim_request_id) : undefined}
                actionable
              />
            ))}
          </ul>
        )}
      </section>

      {others.length > 0 ? (
        <section className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            처리 완료 ({others.length})
          </p>
          <ul className="flex flex-col gap-3">
            {others.map((r) => (
              <VerifRowCard
                key={r.id}
                row={r}
                user={profileMap.get(r.profile_id)}
                claim={r.claim_request_id ? claimMap.get(r.claim_request_id) : undefined}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <Link
        href="/me"
        className="text-xs uppercase tracking-[0.14em] text-ink-3 underline-offset-4 hover:underline"
      >
        ← admin 홈
      </Link>
    </div>
  );
}

function VerifRowCard({
  row,
  user,
  claim,
  actionable,
}: {
  row: VerifRow;
  user?: ProfileLite;
  claim?: ClaimContext;
  actionable?: boolean;
}) {
  const statusColor = {
    pending: "border-warn/30 bg-warn/5 text-warn",
    approved: "border-ok/30 bg-ok/5 text-ok",
    rejected: "border-destructive/30 bg-destructive/5 text-destructive",
    expired: "border-border bg-secondary text-ink-3",
  }[row.status];
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">
            {user?.display_name ?? "(알 수 없음)"}
          </p>
          <p className="text-xs text-ink-3 font-mono">
            @{row.instagram_handle}
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusColor}`}
        >
          {row.status}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-ink-3">
            코드
          </p>
          <p className="font-mono text-2xl font-bold tracking-[0.2em]">
            {row.code}
          </p>
        </div>
        <div className="flex flex-col gap-0.5 text-[11px] text-ink-3">
          <span>요청: {new Date(row.created_at).toLocaleString("ko-KR")}</span>
          <span>만료: {new Date(row.expires_at).toLocaleString("ko-KR")}</span>
          {row.reviewed_at ? (
            <span>처리: {new Date(row.reviewed_at).toLocaleString("ko-KR")}</span>
          ) : null}
        </div>
      </div>
      {claim ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
          <p className="font-semibold text-primary">
            🔗 댄서 프로필 claim 본인 인증
          </p>
          <p className="mt-1 text-ink-2">
            대상 댄서:{" "}
            <Link
              href={`/d/${claim.dancer_slug ?? claim.dancer_id}`}
              className="font-semibold text-foreground underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {claim.dancer_stage_name}
            </Link>
            {" "}({claim.relation === "manager" ? "매니저" : claim.relation === "self" ? "본인" : "기타"})
          </p>
          <p className="mt-1 text-[10px] text-ink-3">
            승인 시 dancer.profile_id가 이 사용자로 자동 설정되고 claim도 함께 승인됩니다.
          </p>
        </div>
      ) : null}
      {row.reject_reason ? (
        <p className="rounded-md bg-secondary/40 px-3 py-2 text-xs text-ink-2">
          반려 사유: {row.reject_reason}
        </p>
      ) : null}
      {actionable ? <AdminVerificationActions id={row.id} /> : null}
    </li>
  );
}
