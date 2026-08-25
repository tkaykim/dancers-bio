import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Globe2, LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { ProfileShareCard } from "@/components/share/ProfileShareCard";
import { PushPrompt } from "@/components/layout/PushPrompt";
import { BugReportRow } from "@/components/feedback/BugReport";
import { loadMemberVisaAccess, type MemberVisaApplication } from "@/lib/visa/member-case";
import { deriveVisaProgress, VISA_PROGRESS_LABELS } from "@/lib/visa/progress";

// Lite: 받은 제안·creator 권한 신청 CTA 제거, 관리자만 프로젝트 개설.
// 팀 기능은 재활성화됨(댄서 프로필 보유 시 "내 팀" 노출).
export default async function MePage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, bio, is_admin, phone")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const { data: ownDancers } = await supabase
    .from("dancers")
    .select("id, slug, approval_status, is_active")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);
  const ownDancer = (ownDancers ?? [])[0] ?? null;
  // 공유 링크는 활성 프로필이면 노출 — 승인 무관(URL 직접 접근 가능, project URL 모델).
  // 미승인 프로필은 SEO엔 안 뜨지만 링크를 아는 사람은 볼 수 있다.
  const shareable = ownDancer && ownDancer.is_active !== false;
  const shareUrl = shareable
    ? ownDancer.slug
      ? `https://dancers.bio/${ownDancer.slug}`
      : `https://dancers.bio/d/${ownDancer.id}`
    : null;
  const shareTitle = `${profile.display_name ?? "댄서"} | 댄서 프로필 · dancers.bio`;
  const visaAccess = await loadMemberVisaAccess(user.id);

  // 공동관리자로 지정된 공고 목록.
  //
  // project_managers 는 권한 판정(canManageProject)에만 쓰였고 어디에도 목록이 없었다.
  // 그래서 관리자가 아닌 담당자(예: 프로젝트 매니저)는 공고 URL 을 북마크하지 않으면
  // 자기가 맡은 공고를 다시 찾을 방법이 없었다 — 공고가 마감되면 피드에서도 사라진다.
  // 소유자 공고도 같은 목록에 합쳐 "내가 관리하는 공고" 하나로 보여준다.
  const managedProjects = await (async () => {
    const { data: managerRows } = await supabase
      .from("project_managers")
      .select("project_id")
      .eq("profile_id", user.id);
    const managedIds = (managerRows ?? []).map((r) => r.project_id as string);

    const { data: rows } = await supabase
      .from("projects")
      .select("id, short_code, title, status, application_deadline")
      .is("deleted_at", null)
      .or(
        managedIds.length > 0
          ? `owner_id.eq.${user.id},id.in.(${managedIds.join(",")})`
          : `owner_id.eq.${user.id}`,
      )
      .order("created_at", { ascending: false })
      .limit(50);
    return (rows ?? []) as Array<{
      id: string;
      short_code: string | null;
      title: string;
      status: string;
      application_deadline: string | null;
    }>;
  })();

  return (
    <div className="flex flex-col gap-6 px-6 pb-10 pt-8 lg:mx-auto lg:max-w-2xl">
      <ProfileCard
        userId={user.id}
        displayName={profile.display_name ?? ""}
        bio={profile.bio}
        avatarUrl={profile.avatar_url}
        phone={profile.phone ?? null}
      />

      {shareUrl ? (
        <ProfileShareCard url={shareUrl} title={shareTitle} />
      ) : null}

      {visaAccess.eligible ? (
        <VisaStatusCard application={visaAccess.application} />
      ) : null}

      {managedProjects.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-ink-2">내가 관리하는 공고</h2>
          <ul className="overflow-hidden rounded-2xl border border-border bg-card">
            {managedProjects.map((mp) => (
              <SettingsRow
                key={mp.id}
                href={`/projects/${mp.short_code ?? mp.id}/applicants`}
                title={mp.title}
                desc={
                  mp.status === "open" ? "모집 중 · 지원자 보기" : "마감 · 지원자 보기"
                }
              />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold text-ink-2">활동</h2>
        <ul className="overflow-hidden rounded-2xl border border-border bg-card">
          <SettingsRow
            href="/me/portfolio"
            title="댄서 포트폴리오"
            desc={ownDancer ? "활동명·경력·영상 편집" : "포트폴리오 만들기"}
          />
          {ownDancer ? (
            <SettingsRow
              href="/me/teams"
              title="내 팀"
              desc="팀 프로필 · 멤버 관리"
            />
          ) : null}
          <SettingsRow
            href="/me/settlements"
            title="정산 · 출금"
            desc="정산금액 확인 · 계좌 등록 · 출금 신청"
          />
          <SettingsRow
            href="/me/workshops"
            title="내 워크샵 예약"
            desc="예약금 결제 내역 · 진행 상태"
          />
          {profile.is_admin ? (
            <SettingsRow
              href="/projects/new"
              title="프로젝트 개설"
              desc="캐스팅 공고 등록"
              accent
            />
          ) : null}
          {profile.is_admin ? (
            <SettingsRow
              href="/admin"
              title="관리자 콘솔"
              desc="인증 큐 · 사용자 권한"
            />
          ) : null}
          <BugReportRow />
        </ul>
      </section>

      <PushPrompt />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-2">계정</h2>
        <p className="px-1 text-xs text-ink-3">{user.email}</p>
        <Link
          href="/me/notifications"
          className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-ink-2 hover:bg-secondary"
        >
          알림 설정 →
        </Link>
        <Link
          href="/me/password"
          className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-ink-2 hover:bg-secondary"
        >
          비밀번호 변경 →
        </Link>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-4 text-sm font-semibold text-ink-2 transition-colors active:bg-secondary"
          >
            <LogOut size={16} aria-hidden />
            로그아웃
          </button>
        </form>
      </section>
    </div>
  );
}

function VisaStatusCard({ application }: { application: MemberVisaApplication | null }) {
  const paymentProductSlug =
    typeof application?.payment_meta?.issued_product_slug === "string"
      ? application.payment_meta.issued_product_slug
      : null;
  const progress = application
    ? deriveVisaProgress({
        caseStage: application.case_stage ?? "application_received",
        auditionResult: application.audition_result ?? "pending",
        monthlyEvaluationResult: application.monthly_evaluation_result ?? "pending",
        contractStatus: application.contract_status ?? "not_started",
        paymentStatus: application.payment_status ?? "unpaid",
        paymentProductSlug,
        basicDocumentsStatus: application.basic_documents_status ?? "not_started",
        detailedDocumentsStatus: application.detailed_documents_status ?? "not_started",
        visaIssuedAt: application.visa_issued_at ?? null,
      })
    : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card">
      <Link href="/me/visa" className="block p-5 transition-colors hover:bg-primary/5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Globe2 className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Visa &amp; Korea</p>
              <h2 className="mt-1 text-base font-bold">
                {progress ? VISA_PROGRESS_LABELS.en[progress.activeStep - 1] : "Explore your visa program"}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-3">
                {progress ? `Step ${progress.activeStep} of 5` : "See eligibility, program details, and the next action."}
              </p>
            </div>
          </div>
          <ChevronRight className="mt-2 size-5 shrink-0 text-ink-3" aria-hidden />
        </div>
        {progress ? (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress.percent}%` }} />
          </div>
        ) : null}
      </Link>
    </section>
  );
}

function SettingsRow({
  href,
  title,
  desc,
  accent,
}: {
  href: string;
  title: string;
  desc?: string;
  accent?: boolean;
}) {
  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        href={href}
        className="flex items-center justify-between gap-4 px-4 py-4 transition-colors active:bg-secondary"
      >
        <div className="flex flex-col gap-0.5">
          <span
            className={
              "text-base font-semibold " +
              (accent ? "text-primary" : "text-foreground")
            }
          >
            {title}
          </span>
          {desc ? (
            <span className="text-xs text-ink-3">{desc}</span>
          ) : null}
        </div>
        <ChevronRight size={18} className="text-ink-3" aria-hidden />
      </Link>
    </li>
  );
}
