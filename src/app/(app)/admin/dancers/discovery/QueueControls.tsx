"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  enqueueForScrapeAction,
  updateScrapeQueueAction,
  removeFromQueueAction,
  runScrapeAction,
  discoverDancersByHashtagAction,
} from "@/app/actions/dancer-ingestion";

export function HashtagDiscoverForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [hashtag, setHashtag] = useState("");
  const [limit, setLimit] = useState("60");

  function discover() {
    setError(null);
    setMsg(null);
    if (!hashtag.trim()) {
      setError("해시태그를 입력하세요.");
      return;
    }
    const fd = new FormData();
    fd.set("hashtag", hashtag.trim());
    if (limit) fd.set("limit", limit);
    startTransition(async () => {
      const r = await discoverDancersByHashtagAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMsg(`발견 ${r.data?.found ?? 0}건 중 ${r.data?.inserted ?? 0}건 신규 적재`);
      setHashtag("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-semibold">해시태그로 발견</p>
      <p className="text-[11px] text-ink-3">
        댄스 해시태그의 인기 게시물 작성자를 발견 풀에 적재합니다. (Apify hashtag-scraper · APIFY_TOKEN 필요)
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-ink-3">
            해시태그
          </label>
          <Input
            placeholder="예: 팝핀 / kpopdance / 안무"
            value={hashtag}
            onChange={(e) => setHashtag(e.target.value)}
          />
        </div>
        <div className="flex w-24 flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-ink-3">
            개수
          </label>
          <Input
            type="number"
            inputMode="numeric"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </div>
        <Button type="button" disabled={pending} onClick={discover}>
          {pending ? "수집 중..." : "발견 실행"}
        </Button>
      </div>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      {msg ? <p className="text-[11px] text-primary">{msg}</p> : null}
    </div>
  );
}

export function EnqueueButton({ discoveryId }: { discoveryId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [priority, setPriority] = useState("");

  function enqueue() {
    setError(null);
    const fd = new FormData();
    fd.set("discovery_id", discoveryId);
    if (scheduledDate) fd.set("scheduled_date", scheduledDate);
    if (priority) fd.set("priority", priority);
    startTransition(async () => {
      const r = await enqueueForScrapeAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        큐에 추가
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-secondary/40 p-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-ink-3">
            예약일 (선택)
          </label>
          <Input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-ink-3">
            우선순위 (선택)
          </label>
          <Input
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          />
        </div>
      </div>
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => setOpen(false)}
          className="flex-1"
        >
          취소
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={enqueue}
          className="flex-1"
        >
          {pending ? "추가 중..." : "큐에 추가"}
        </Button>
      </div>
    </div>
  );
}

export function QueueRowControls({
  queueId,
  priority,
  scheduledDate,
  status,
}: {
  queueId: string;
  priority: number | null;
  scheduledDate: string | null;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [priorityVal, setPriorityVal] = useState(
    priority != null ? String(priority) : "",
  );
  const [dateVal, setDateVal] = useState(scheduledDate ?? "");

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("queue_id", queueId);
    if (priorityVal) fd.set("priority", priorityVal);
    if (dateVal) fd.set("scheduled_date", dateVal);
    startTransition(async () => {
      const r = await updateScrapeQueueAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    if (!confirm("이 항목을 큐에서 제거하시겠어요?")) return;
    const fd = new FormData();
    fd.set("queue_id", queueId);
    startTransition(async () => {
      const r = await removeFromQueueAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function run() {
    setError(null);
    const fd = new FormData();
    fd.set("queue_id", queueId);
    startTransition(async () => {
      const r = await runScrapeAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {editing ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-ink-3">
              우선순위
            </label>
            <Input
              type="number"
              inputMode="numeric"
              value={priorityVal}
              onChange={(e) => setPriorityVal(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-ink-3">
              예약일
            </label>
            <Input
              type="date"
              value={dateVal}
              onChange={(e) => setDateVal(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setEditing(false)}
            >
              취소
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={save}
            >
              {pending ? "저장 중..." : "저장"}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setEditing(true)}
          >
            우선순위·예약일 수정
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending || status === "scraping"}
          onClick={run}
        >
          {pending ? "처리 중..." : "지금 스크랩"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={remove}
        >
          제거
        </Button>
      </div>
    </div>
  );
}
