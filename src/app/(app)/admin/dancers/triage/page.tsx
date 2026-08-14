import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { loadTriageBuckets, type TriageRow } from "@/lib/scoring/triage-data";
import { TriageBulkApprove } from "@/components/admin/TriageBulkApprove";

export const dynamic = "force-dynamic";

/**
 * 승인 대기 큐 트리아지 (docs/QUALITY_PLAN.md §2).
 * A=자동 승인 후보 / B=보완 요청 / C=정보 부족 / REVIEW=중복 후보.
 */
export default async function AdminDancerTriagePage() {
  const profile = await requireProfile();
  if (!profile.is_admin) notFound();

  const buckets = await loadTriageBuckets();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 관리자 / 승인 트리아지
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          승인 대기 {buckets.total}명
        </h1>
        <p className="text-sm text-ink-2">
          승인 게이트는 “명단에 올릴 최소 자격”만 봅니다.
          <br />
          실제 퀄리티 관리는 추천·정렬 점수로 하고, 미달은 거절이 아니라 보완 요청입니다.
        </p>
        <Link
          href="/admin/dancers"
          className="text-xs text-ink-2 underline underline-offset-2 hover:text-foreground"
        >
          전체 댄서 관리로 →
        </Link>
      </header>

      <section className="flex flex-col gap-3">
        <SectionHeading
          tone="ok"
          title={`A · 자동 승인 후보 (${buckets.A.length})`}
          desc="사진·장르가 있고 경력이 1건 이상이거나 관리자 검증을 받은 프로필입니다."
        />
        <TriageBulkApprove
          rows={buckets.A.map((r) => ({
            id: r.id,
            name: r.korean_name ? `${r.stage_name} (${r.korean_name})` : r.stage_name,
            careerCount: r.careerCount,
            hasPhone: r.hasPhone,
            hasAccount: !!r.profile_id,
            needsEyeball: r.triage.needsEyeball,
            nameCollisionCount: r.duplicateWeakOf.length,
          }))}
        />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading
          tone="warn"
          title={`B · 보완 요청 (${buckets.B.length})`}
          desc="사진·장르는 있으나 경력이 0건입니다. 경력 등록을 안내한 뒤 재판정합니다."
        />
        <RowList rows={buckets.B} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading
          tone="muted"
          title={`C · 정보 부족 (${buckets.C.length})`}
          desc="사진·활동명·장르 중 필수 항목이 비어 있어 명단에 올려도 클릭되지 않습니다."
        />
        <RowList rows={buckets.C} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading
          tone="destructive"
          title={`확인 필요 · 연락처 중복 (${buckets.REVIEW.length})`}
          desc="연락처가 다른 프로필과 완전히 일치합니다. 대부분 같은 사람의 계정이 갈라진 경우이니, 병합 여부를 정한 뒤 개별 승인하세요."
        />
        <RowList rows={buckets.REVIEW} showDuplicates />
      </section>
    </div>
  );
}

function SectionHeading({
  title,
  desc,
  tone,
}: {
  title: string;
  desc: string;
  tone: "ok" | "warn" | "muted" | "destructive";
}) {
  const color = {
    ok: "text-ok",
    warn: "text-warn",
    muted: "text-ink-2",
    destructive: "text-destructive",
  }[tone];
  return (
    <div className="flex flex-col gap-1">
      <h2 className={`text-sm font-semibold ${color}`}>{title}</h2>
      <p className="text-xs text-ink-3">{desc}</p>
    </div>
  );
}

function RowList({
  rows,
  showDuplicates = false,
}: {
  rows: TriageRow[];
  showDuplicates?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-4 text-sm text-ink-3">
        해당 없음
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-hairline rounded-xl border border-border bg-card">
      {rows.slice(0, 200).map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
          <Link
            href={`/d/${r.slug ?? r.id}`}
            className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
          >
            {r.stage_name}
            {r.korean_name ? (
              <span className="ml-1.5 text-[11px] text-ink-3">{r.korean_name}</span>
            ) : null}
          </Link>
          <span className="shrink-0 text-[11px] text-ink-3">
            {r.triage.reasons.join(" · ")}
          </span>
          {showDuplicates && r.duplicateStrongOf.length > 0 ? (
            <span className="shrink-0 rounded-full border border-destructive/30 bg-destructive/5 px-2 py-0.5 text-[10px] text-destructive">
              연락처 일치 {r.duplicateStrongOf.length}건
            </span>
          ) : null}
        </li>
      ))}
      {rows.length > 200 ? (
        <li className="px-4 py-2.5 text-[11px] text-ink-3">
          … 외 {rows.length - 200}명
        </li>
      ) : null}
    </ul>
  );
}
