import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { ProfileShareCard } from "@/components/share/ProfileShareCard";
import { PushPrompt } from "@/components/layout/PushPrompt";
import { BugReportRow } from "@/components/feedback/BugReport";

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

  return (
    <div className="flex flex-col gap-6 px-6 pb-10 pt-8">
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
