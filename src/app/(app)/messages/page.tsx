import type { Metadata } from "next";
import { getProfile, requireUser } from "@/lib/auth/guard";
import Link from "next/link";
import { listMessageProjects } from "@/lib/messaging/project-options";
import { createClient } from "@/lib/supabase/server";
import { messagingEnabled } from "@/lib/messaging/flags";
import { listMemberInboxRooms } from "@/lib/messaging/inbox-query";
import { MessagesInbox } from "@/components/messaging/MessagesInbox";

export const metadata: Metadata = { title: "메시지 | deetz" };
export const dynamic = "force-dynamic";

// 댄서 메시지함 — 1행 = 프로젝트 하나와의 운영팀 1:1 대화.
export default async function MessagesPage() {
  const user = await requireUser();

  if (!messagingEnabled()) {
    return (
      <div className="px-4 py-16 text-center">
        <h1 className="text-lg font-bold">메시지</h1>
        <p className="mt-2 text-sm text-ink-3">메시지 기능을 준비하고 있어요.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const rooms = await listMemberInboxRooms(supabase, user.id);
  const profile = await getProfile();
  const staffProjects = profile ? await listMessageProjects(profile) : [];

  return (
    <div className="pt-5">
      <div className="px-4 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">메시지</h1>
        <p className="mt-1 text-[13px] text-ink-3">
          프로젝트 운영팀과 메시지를 주고받습니다.
        </p>
      </div>
      {staffProjects.length > 0 ? (
        <details open className="mx-4 mb-5 rounded-xl border border-border">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">운영 메시지함 · 프로젝트 {staffProjects.length}개</summary>
          <ul className="max-h-52 overflow-y-auto border-t border-border">
            {staffProjects.map((p) => <li key={p.id}>
              <Link href={`/projects/${p.id}/messages`} className="flex min-h-11 items-center gap-2 px-4 py-3 text-sm hover:bg-secondary">
                <span className="min-w-0 flex-1 break-keep [overflow-wrap:anywhere]">{p.title}</span><span aria-hidden className="shrink-0">→</span>
              </Link>
            </li>)}
          </ul>
        </details>
      ) : null}
      {staffProjects.length > 0 ? <h2 className="px-4 pb-3 text-sm font-semibold">내 프로필로 받은 메시지</h2> : null}
      <MessagesInbox initialRooms={rooms} />
    </div>
  );
}
