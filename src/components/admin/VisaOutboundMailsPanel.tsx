"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { getVisaOutboundMailBodyAction } from "@/app/actions/visa-meeting";

export type OutboundMail = {
  id: string;
  kind: string;
  lang: string;
  subject: string;
  status: string;
  source: string;
  sent_by_name: string | null;
  sent_at: string;
};

const KIND_LABEL: Record<string, string> = {
  meeting_invite: "미팅 안내",
  reschedule: "일정 재조율",
  revive: "진행 희망 확인",
  followup: "추가 질문지 안내",
  application_confirmation: "접수 확인 (자동)",
};

const KIND_TONE: Record<string, string> = {
  meeting_invite: "bg-primary/10 text-primary",
  reschedule: "bg-amber-500/10 text-amber-700",
  revive: "bg-sky-500/10 text-sky-700",
  followup: "bg-secondary text-ink-2",
  application_confirmation: "bg-emerald-500/10 text-emerald-700",
};

function formatKst(value: string): string {
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function VisaOutboundMailsPanel({ mails }: { mails: OutboundMail[] }) {
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [bodyById, setBodyById] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const toggle = async (id: string) => {
    if (openedId === id) {
      setOpenedId(null);
      return;
    }
    setOpenedId(id);
    if (bodyById[id]) return;
    setLoadingId(id);
    try {
      const result = await getVisaOutboundMailBodyAction({ mailId: id });
      setBodyById((prev) => ({
        ...prev,
        [id]: result.ok ? result.data?.html ?? "" : "<p>본문을 불러오지 못했습니다.</p>",
      }));
    } catch {
      setBodyById((prev) => ({ ...prev, [id]: "<p>본문을 불러오지 못했습니다.</p>" }));
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="rounded-xl border border-hairline-2 bg-card p-4">
      <div className="flex items-center gap-2">
        <Mail className="size-4 text-ink-3" />
        <p className="text-xs font-semibold text-ink-3">보낸 메일 전체 {mails.length}건</p>
      </div>

      {mails.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink-3">아직 이 지원자에게 보낸 메일이 없습니다.</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {mails.map((mail) => (
            <li key={mail.id} className="rounded-lg border border-hairline-2 bg-background p-3">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px]">
                <span
                  className={`rounded px-1.5 py-0.5 font-semibold ${KIND_TONE[mail.kind] ?? "bg-secondary text-ink-2"}`}
                >
                  {KIND_LABEL[mail.kind] ?? mail.kind}
                </span>
                <span className="text-ink-2">{formatKst(mail.sent_at)}</span>
                <span className="text-ink-3">{mail.lang}</span>
                <span className="text-ink-3">{mail.source === "admin" ? "어드민 발송" : "스크립트 발송"}</span>
                {mail.status !== "sent" ? <span className="font-semibold text-rose-600">발송 실패</span> : null}
              </div>
              <p className="mt-1 text-[13px] font-medium text-foreground">{mail.subject}</p>
              <button
                type="button"
                onClick={() => toggle(mail.id)}
                className="mt-2 text-[12px] text-ink-3 underline underline-offset-2 hover:text-foreground"
              >
                {openedId === mail.id ? "본문 접기" : "본문 보기"}
              </button>
              {openedId === mail.id ? (
                loadingId === mail.id ? (
                  <p className="mt-2 text-[12px] text-ink-3">본문을 불러오는 중…</p>
                ) : (
                  <iframe
                    title="보낸 메일 본문"
                    srcDoc={bodyById[mail.id] ?? ""}
                    sandbox=""
                    className="mt-2 h-[420px] w-full rounded-lg border border-hairline-2 bg-white"
                  />
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
