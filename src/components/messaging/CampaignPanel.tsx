"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  cancelCampaignAction,
  listCampaignsAction,
  previewCampaignAudienceAction,
  remindCampaignUnreadAction,
  sendCampaignAction,
} from "@/app/actions/message-campaigns";
import type { CampaignSegment } from "@/lib/messaging/campaigns";
import { formatListTime, usePolling } from "./poll";

// 캠페인 = 일괄 발송 도구. 각 수신자의 1:1 스레드로 꽂히고 회신도 그 스레드로 온다.
// 오발송 3중 장치: ① 수신 명단 확인 화면 ② 발송 후 30초 취소 창 ③ 대상은 스냅샷 고정.

export type CampaignRow = {
  id: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
  sendAfter: string;
  sentAt: string | null;
  mailChannel: boolean;
  total: number;
  delivered: number;
  skippedNoAccount: number;
  failed: number;
  read: number;
  responded: number;
  hasAction: boolean;
};

const SEGMENTS: Array<{ key: string; label: string; segment: CampaignSegment }> = [
  { key: "round1", label: "1차 합격", segment: { type: "round", round: 1 } },
  { key: "round2", label: "2차 합격", segment: { type: "round", round: 2 } },
  { key: "confirmed", label: "최종 확정", segment: { type: "confirmed" } },
  { key: "pending", label: "검토 중", segment: { type: "pending" } },
  { key: "active_all", label: "지원자 전체(탈락 제외)", segment: { type: "active_all" } },
];

export function CampaignPanel(props: {
  projectId: string;
  projectTitle: string;
  initialCampaigns: CampaignRow[];
}) {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>(props.initialCampaigns);
  const [composing, setComposing] = useState(false);
  const [now, setNow] = useState(0);

  const hasScheduled = campaigns.some((c) => c.status === "scheduled" || c.status === "sending");

  const refresh = useCallback(async () => {
    const result = await listCampaignsAction({ projectId: props.projectId });
    if (result.ok && result.data) setCampaigns(result.data.campaigns);
  }, [props.projectId]);

  // 발송 진행 중일 때만 잦은 갱신(취소 창·집계 반영), 평시 60초.
  usePolling(refresh, hasScheduled ? 5_000 : 60_000);

  useEffect(() => {
    if (!hasScheduled) return;
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [hasScheduled]);

  const cancel = useCallback(
    async (campaignId: string) => {
      const result = await cancelCampaignAction({ campaignId });
      if (!result.ok) toast.error(result.error);
      else toast.success("발송을 취소했습니다.");
      void refresh();
    },
    [refresh],
  );

  const remind = useCallback(
    async (c: CampaignRow) => {
      const unread = c.delivered - c.read;
      if (unread <= 0) return void toast.info("미읽음 인원이 없습니다.");
      const okGo = window.confirm(
        `안 읽은 ${unread}명에게 재촉 메일을 보냅니다. (읽은 사람에게는 가지 않습니다)\n계속할까요?`,
      );
      if (!okGo) return;
      const result = await remindCampaignUnreadAction({ campaignId: c.id });
      if (!result.ok) return void toast.error(result.error);
      toast.success(
        result.data!.unread === 0
          ? "재촉할 미읽음 인원이 없습니다."
          : `미읽음 ${result.data!.unread}명 재촉 메일을 예약했습니다 — 1~2분 내 순차 발송됩니다.`,
      );
    },
    [],
  );

  return (
    <div className="min-h-0 overflow-y-auto px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[15px] font-bold">일괄 발송</p>
          <p className="mt-0.5 text-[12px] text-ink-3">
            선택한 대상 각자의 1:1 대화방으로 발송되고, 답장도 그 대화방으로 옵니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="shrink-0 rounded-md bg-foreground px-3.5 py-2 text-[13px] font-bold text-background"
        >
          새 발송
        </button>
      </div>

      <ul className="mt-4 space-y-3">
        {campaigns.length === 0 ? (
          <li className="rounded-md border border-border px-4 py-8 text-center text-[13px] text-ink-3">
            아직 발송한 캠페인이 없습니다.
          </li>
        ) : null}
        {campaigns.map((c) => {
          const cancelLeft = Math.max(0, Math.ceil((new Date(c.sendAfter).getTime() - now) / 1000));
          const readPct = c.delivered > 0 ? Math.round((c.read / c.delivered) * 100) : 0;
          return (
            <li key={c.id} className="rounded-md border border-border p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-[14px] font-bold">
                  {c.title || "(제목 없음)"}
                </p>
                <span className="shrink-0 text-[11px] text-ink-3">
                  {formatListTime(c.createdAt)}
                </span>
              </div>
              <p className="mt-1 truncate text-[12px] text-ink-3">{c.body}</p>

              {c.status === "scheduled" ? (
                <div className="mt-2.5 flex items-center gap-2.5 rounded-md bg-secondary px-3 py-2">
                  <span className="flex-1 text-[12px] font-semibold">
                    {now === 0
                      ? "30초 동안 취소할 수 있습니다 — 이후 순차 발송됩니다."
                      : cancelLeft > 0
                        ? `${cancelLeft}초 안에 취소할 수 있습니다 — 이후 순차 발송됩니다.`
                        : "곧 발송이 시작됩니다…"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void cancel(c.id)}
                    className="rounded-md border border-foreground px-2.5 py-1 text-[12px] font-bold"
                  >
                    발송 취소
                  </button>
                </div>
              ) : null}

              {c.status === "sending" ? (
                <p className="mt-2.5 text-[12px] font-semibold text-ink-2">
                  발송 중… {c.delivered}/{c.total - c.skippedNoAccount}
                </p>
              ) : null}

              {c.status === "sent" ? (
                <div className="mt-2.5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] tabular-nums">
                    <span>
                      전달 <b>{c.delivered}</b>
                    </span>
                    <span>
                      읽음 <b>{c.read}</b>/{c.delivered} ({readPct}%)
                    </span>
                    {c.hasAction ? (
                      <span>
                        응답 <b>{c.responded}</b>/{c.delivered}
                      </span>
                    ) : null}
                    {c.skippedNoAccount > 0 ? (
                      <span className="text-ink-3">미가입 제외 {c.skippedNoAccount}</span>
                    ) : null}
                    {c.failed > 0 ? (
                      <span className="text-red-600">실패 {c.failed}</span>
                    ) : null}
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full bg-foreground" style={{ width: `${readPct}%` }} />
                  </div>
                  {c.delivered - c.read > 0 ? (
                    <button
                      type="button"
                      onClick={() => void remind(c)}
                      className="mt-2.5 rounded-md border border-border px-2.5 py-1.5 text-[12px] font-semibold"
                    >
                      미읽음 {c.delivered - c.read}명 재촉 — 메일
                    </button>
                  ) : null}
                </div>
              ) : null}

              {c.status === "cancelled" ? (
                <p className="mt-2 text-[12px] text-ink-3">발송 취소됨</p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {composing ? (
        <CampaignComposer
          projectId={props.projectId}
          onClose={() => setComposing(false)}
          onSent={() => {
            setComposing(false);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function CampaignComposer(props: {
  projectId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [segmentKey, setSegmentKey] = useState("round1");
  const [preview, setPreview] = useState<{
    included: Array<{ dancerId: string; name: string }>;
    excluded: Array<{ dancerId: string; name: string }>;
  } | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [withAction, setWithAction] = useState(false);
  const [deadline, setDeadline] = useState("");
  const [mail, setMail] = useState(true);
  const [step, setStep] = useState<"compose" | "confirm">("compose");
  const [sending, setSending] = useState(false);

  const segment = useMemo(
    () => SEGMENTS.find((s) => s.key === segmentKey)?.segment ?? SEGMENTS[0].segment,
    [segmentKey],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await previewCampaignAudienceAction({
        projectId: props.projectId,
        segment,
      });
      if (!cancelled && result.ok && result.data) setPreview(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [props.projectId, segment]);

  const send = useCallback(async () => {
    if (sending) return;
    setSending(true);
    const result = await sendCampaignAction({
      projectId: props.projectId,
      title: title.trim(),
      body: body.trim(),
      segment,
      mailChannel: mail,
      // 확인 화면에서 본 그 명단 — 서버는 이 명단을 넘어 발송하지 않는다.
      confirmedDancerIds: (preview?.included ?? []).map((r) => r.dancerId),
      actionChoices: withAction ? ["가능", "불가", "일부만 가능"] : undefined,
      actionDeadline: withAction && deadline ? new Date(deadline).toISOString() : null,
      actionDetailFor: withAction ? ["일부만 가능"] : undefined,
    });
    setSending(false);
    if (!result.ok) return void toast.error(result.error);
    toast.success(
      `${result.data!.included}명에게 발송을 예약했습니다 — 30초 안에 취소할 수 있습니다.`,
    );
    props.onSent();
  }, [sending, props, title, body, segment, mail, withAction, deadline, preview]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[92svh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-background p-5 sm:rounded-xl">
        {step === "compose" ? (
          <>
            <p className="text-[15px] font-bold">일괄 발송 만들기</p>

            <p className="mt-4 text-[12px] font-bold text-ink-2">① 대상</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {SEGMENTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    setSegmentKey(s.key);
                    setPreview(null);
                  }}
                  className={
                    "rounded-full border px-3 py-1.5 text-[13px] font-semibold " +
                    (segmentKey === s.key
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-ink-2")
                  }
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[12px] text-ink-3">
              {preview
                ? `발송 ${preview.included.length}명` +
                  (preview.excluded.length > 0
                    ? ` · 미가입 제외 ${preview.excluded.length}명(메일로 별도 연락 필요)`
                    : "")
                : "대상 계산 중…"}
            </p>

            <p className="mt-4 text-[12px] font-bold text-ink-2">② 내용</p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목 (예: 9월 일정 확인 안내)"
              className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2.5 text-[14px] outline-none focus:border-foreground"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="내용을 입력하세요. 각자의 대화방으로 전달되고, 답장도 대화방으로 옵니다."
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2.5 text-[14px] leading-relaxed outline-none focus:border-foreground"
            />

            <label className="mt-3 flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={withAction}
                onChange={(e) => setWithAction(e.target.checked)}
              />
              응답 요청 버튼 추가 (가능 / 불가 / 일부만 가능)
            </label>
            {withAction ? (
              <label className="mt-2 block text-[12px] text-ink-3">
                응답 기한(선택)
                <input
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-[13px]"
                />
              </label>
            ) : null}

            <p className="mt-4 text-[12px] font-bold text-ink-2">③ 채널</p>
            <p className="text-[11px] text-ink-4">인앱 + 푸시는 기본으로 나갑니다.</p>
            <label className="mt-1.5 flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={mail} onChange={(e) => setMail(e.target.checked)} />
              메일도 함께 발송 (요지 + 링크)
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={props.onClose}
                className="rounded-md px-3.5 py-2 text-[13px] font-semibold text-ink-3"
              >
                닫기
              </button>
              <button
                type="button"
                disabled={!body.trim() || !preview || preview.included.length === 0}
                onClick={() => setStep("confirm")}
                className="rounded-md bg-foreground px-4 py-2 text-[13px] font-bold text-background disabled:opacity-40"
              >
                다음 — 수신 명단 확인
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[15px] font-bold">
              수신 명단 확인 — {preview?.included.length ?? 0}명
            </p>
            <p className="mt-1 text-[12px] text-ink-3">
              발송 후 30초 동안 취소할 수 있고, 이후 순차 발송됩니다.
            </p>
            <div className="mt-3 max-h-44 overflow-y-auto rounded-md border border-border p-2.5">
              <p className="flex flex-wrap gap-x-2 gap-y-1 text-[12px] leading-relaxed">
                {(preview?.included ?? []).map((r) => (
                  <span key={r.dancerId}>{r.name}</span>
                ))}
              </p>
            </div>
            {preview && preview.excluded.length > 0 ? (
              <div className="mt-2.5 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                <b>미가입이라 받지 못하는 {preview.excluded.length}명</b> — 기존 메일로 별도 연락이
                필요합니다:{" "}
                {preview.excluded.map((r) => r.name).join(", ")}
              </div>
            ) : null}
            <div className="mt-3 rounded-md bg-secondary px-3 py-2.5 text-[12px] leading-relaxed">
              <p className="font-bold">{title || "(제목 없음)"}</p>
              <p className="mt-1 whitespace-pre-wrap text-ink-2">{body}</p>
              {withAction ? <p className="mt-1 text-ink-3">+ 응답 요청 버튼</p> : null}
              <p className="mt-1 text-ink-3">채널: 인앱·푸시{mail ? " + 메일" : ""}</p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStep("compose")}
                className="rounded-md px-3.5 py-2 text-[13px] font-semibold text-ink-3"
              >
                ← 수정
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => void send()}
                className="rounded-md bg-foreground px-4 py-2 text-[13px] font-bold text-background disabled:opacity-40"
              >
                {sending ? "예약 중…" : `${preview?.included.length ?? 0}명에게 발송`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
