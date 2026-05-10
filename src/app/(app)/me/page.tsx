import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { ProfileEditForm } from "@/components/profile/ProfileEditForm";

export default async function MePage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, display_name, avatar_url, bio, can_create_project, is_admin",
    )
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  // Quick lookup: do they already have a dancer profile?
  const { data: ownDancer } = await supabase
    .from("dancers")
    .select("id, slug")
    .eq("profile_id", user.id)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-6 px-6 pb-10 pt-8">
      <header className="flex items-center gap-4">
        {profile.avatar_url ? (
          <Image
            src={profile.avatar_url}
            alt={profile.display_name ?? "프로필 사진"}
            width={64}
            height={64}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-xl font-bold">
            {(profile.display_name ?? "U")[0]}
          </div>
        )}
        <div className="flex flex-col">
          <h1 className="text-2xl font-extrabold tracking-tight">
            {profile.display_name}
          </h1>
          <Link
            href={`/u/${profile.id}`}
            className="text-xs text-ink-3 hover:text-foreground"
          >
            공개 프로필 보기 →
          </Link>
        </div>
      </header>

      {!profile.can_create_project && !profile.is_admin ? (
        <Link
          href="/verify-instagram"
          className="flex items-center gap-3 rounded-2xl border border-warn/25 bg-warn/10 p-4 transition-colors active:bg-warn/15"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warn/20 text-warn">
            !
          </span>
          <div className="flex-1">
            <p className="text-sm font-bold text-warn">본인인증이 필요해요</p>
            <p className="mt-0.5 text-xs text-ink-2">
              인스타그램 DM 1회로 프로젝트 개설 권한을 받으세요.
            </p>
          </div>
          <ChevronRight size={18} className="text-warn" aria-hidden />
        </Link>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-2">기본 정보</h2>
        <ProfileEditForm
          defaultValues={{
            display_name: profile.display_name ?? "",
            bio: profile.bio,
          }}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold text-ink-2">활동</h2>
        <ul className="overflow-hidden rounded-2xl border border-border bg-card">
          <SettingsRow
            href={ownDancer ? "/me/portfolio" : "/me/portfolio"}
            title="댄서 포트폴리오"
            desc={ownDancer ? "활동명·경력·영상 편집" : "포트폴리오 만들기"}
          />
          {(profile.can_create_project || profile.is_admin) ? (
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
        </ul>
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
