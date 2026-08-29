import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/guard";
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

  return (
    <div className="pt-5">
      <div className="px-4 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">메시지</h1>
        <p className="mt-1 text-[13px] text-ink-3">
          지원한 프로젝트의 운영팀과 나눈 대화입니다.
        </p>
      </div>
      <MessagesInbox initialRooms={rooms} />
    </div>
  );
}
