"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  createOutreachAction,
  sendOutreachAction,
  updateOutreachStatusAction,
} from "@/app/actions/dancer-ingestion";

type DancerOption = {
  id: string;
  stage_name: string;
  slug: string | null;
};

export function CreateOutreachForm({
  dancers,
}: {
  dancers: DancerOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dancerId, setDancerId] = useState("");
  const [channel, setChannel] = useState<"email" | "ig_dm">("email");
  const [message, setMessage] = useState("");

  function create() {
    setError(null);
    if (!dancerId) {
      setError("댄서를 선택하세요.");
      return;
    }
    const fd = new FormData();
    fd.set("dancer_id", dancerId);
    fd.set("channel", channel);
    if (message.trim()) fd.set("message", message.trim());
    startTransition(async () => {
      const r = await createOutreachAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDancerId("");
      setMessage("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-bold text-ink-2">새 아웃리치 만들기</h2>

      {dancers.length === 0 ? (
        <p className="text-xs text-ink-3">
          미claim 승인 댄서가 없습니다. 검수 게이트에서 승인하면 여기에서 섭외할
          수 있습니다.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="outreach_dancer">대상 댄서</Label>
            <select
              id="outreach_dancer"
              value={dancerId}
              onChange={(e) => setDancerId(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">선택하세요</option>
              {dancers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.stage_name}
                  {d.slug ? ` (${d.slug})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="outreach_channel">채널</Label>
            <select
              id="outreach_channel"
              value={channel}
              onChange={(e) =>
                setChannel(e.target.value as "email" | "ig_dm")
              }
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="email">이메일</option>
              <option value="ig_dm">인스타 DM</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="outreach_message">메시지 (선택)</Label>
            <textarea
              id="outreach_message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="비워두면 기본 템플릿이 사용됩니다."
              className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
            />
          </div>

          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="button" disabled={pending} onClick={create} size="lg">
            {pending ? "생성 중..." : "아웃리치 생성 (대기열)"}
          </Button>
        </>
      )}
    </div>
  );
}

const STATUS_OPTIONS = [
  { value: "queued", label: "대기열" },
  { value: "sent", label: "발송됨" },
  { value: "claimed", label: "claim됨" },
  { value: "bounced", label: "반송" },
  { value: "failed", label: "실패" },
];

export function OutreachRowControls({
  outreachId,
  status,
}: {
  outreachId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState(status);

  function send() {
    setError(null);
    const fd = new FormData();
    fd.set("outreach_id", outreachId);
    startTransition(async () => {
      const r = await sendOutreachAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function changeStatus() {
    setError(null);
    if (newStatus === status) return;
    const fd = new FormData();
    fd.set("outreach_id", outreachId);
    fd.set("status", newStatus);
    startTransition(async () => {
      const r = await updateOutreachStatusAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {status === "queued" ? (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={send}
          >
            {pending ? "발송 중..." : "발송"}
          </Button>
        ) : null}
        <select
          value={newStatus}
          onChange={(e) => setNewStatus(e.target.value)}
          className="h-7 rounded-md border border-input bg-background px-2 text-xs"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending || newStatus === status}
          onClick={changeStatus}
        >
          상태 변경
        </Button>
      </div>
    </div>
  );
}
