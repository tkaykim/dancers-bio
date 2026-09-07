"use client";

import { useEffect, useRef, useState } from "react";
import {
  getPostDetailAction,
  updatePostAction,
} from "@/app/actions/campaign-results";
import type { Metric, Post, PostStatus, Snapshot } from "@/lib/campaign/types";
import type { Candidate } from "@/lib/campaign/repository";
import { date, number, tableClass } from "@/components/campaign/ResultsReport";
import { buttonClass, ErrorText, inputClass, useAction } from "./Controls";
export function PostSheet({
  post,
  snapshots,
  onClose,
}: {
  post: Post;
  snapshots: Snapshot[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    action = useAction();
  const [name, setName] = useState(post.display_name ?? ""),
    [note, setNote] = useState(post.note ?? ""),
    [status, setStatus] = useState<PostStatus>(post.status),
    [collabs, setCollabs] = useState(post.collab_handles.join(";"));
  const [application, setApplication] = useState(post.application_id ?? ""),
    [candidates, setCandidates] = useState<Candidate[]>([]),
    [metrics, setMetrics] = useState<
      (Metric & {
        raw: unknown;
      })[]
    >([]),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    ref.current?.showModal();
    let cancelled = false;
    getPostDetailAction(post.id)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) {
          setMetrics(r.data.metrics);
          setCandidates(r.data.candidates);
        } else setError(r.error);
      })
      .catch(() => {
        if (!cancelled) setError("상세 정보를 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [post.id]);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClose={onClose}
      className="fixed inset-y-0 left-auto right-0 m-0 h-full max-h-none w-full max-w-3xl overflow-y-auto border-l border-border bg-card p-6 text-ink-1 backdrop:bg-black/40"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-bold">게시물 상세 · {post.short_code}</h2>
        <button className={buttonClass} onClick={onClose}>
          닫기
        </button>
      </header>
      <div className="my-6 space-y-4">
        <p>
          소유 계정 @{post.owner_handle ?? "미확인"} ·{" "}
          {post.owner_confirmed_at
            ? `관측 확인 ${date(post.owner_confirmed_at)}`
            : "소유 계정 미확정"}
        </p>
        {post.note?.includes("소유 계정 불일치:") && (
          <p role="status" className="text-amber-700">
            {post.note
              .split("\n")
              .filter((l) => l.startsWith("소유 계정 불일치:"))
              .join("\n")}
          </p>
        )}
        <label className="block">
          보고서 표시 이름
          <input
            className={`${inputClass} block w-full`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block">
          지원자 연결
          <select
            className={`${inputClass} block w-full`}
            value={application}
            onChange={(e) => setApplication(e.target.value)}
          >
            <option value="">연결 없음</option>
            {candidates.map((c) => (
              <option key={c.applicationId} value={c.applicationId}>
                {c.name} · {c.handles.map((h) => `@${h}`).join(", ")}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          공동작업 핸들 (세미콜론 구분)
          <input
            className={`${inputClass} block w-full`}
            value={collabs}
            onChange={(e) => setCollabs(e.target.value)}
          />
        </label>
        <label className="block">
          상태
          <select
            className={`${inputClass} block`}
            value={status}
            onChange={(e) => setStatus(e.target.value as PostStatus)}
          >
            <option value="active">활성</option>
            {post.status === "unverified" && (
              <option value="unverified">미확인</option>
            )}
            <option value="removed">삭제 수동 확인</option>
            <option value="excluded">집계 제외</option>
          </select>
        </label>
        <label className="block">
          운영 메모
          <textarea
            className={`${inputClass} block w-full`}
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button
          disabled={action.pending}
          className={buttonClass}
          onClick={() =>
            action.run(
              () =>
                updatePostAction(post.id, {
                  display_name: name,
                  note,
                  status,
                  collab_handles: collabs
                    .split(";")
                    .map((v) => v.trim())
                    .filter(Boolean),
                  application_id: application || null,
                  dancer_id: application
                    ? (candidates.find((c) => c.applicationId === application)
                        ?.dancerId ?? post.dancer_id)
                    : null,
                }),
              onClose,
            )
          }
        >
          저장
        </button>
        <ErrorText error={action.error ?? error} />
      </div>
      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr>
              <th>회차</th>
              <th>관측</th>
              <th>재생</th>
              <th>좋아요</th>
              <th>댓글</th>
              <th>공유</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.snapshot_id}>
                <td>
                  {snapshots.find((s) => s.id === m.snapshot_id)?.label ??
                    m.snapshot_id}
                </td>
                <td>{m.fetch_status}</td>
                <td>{number(m.plays)}</td>
                <td>{number(m.likes)}</td>
                <td>{number(m.comments)}</td>
                <td>{number(m.shares)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {metrics.map((m) => (
        <details className="mt-4" key={m.snapshot_id}>
          <summary>
            원본 관측 · {snapshots.find((s) => s.id === m.snapshot_id)?.label}
          </summary>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all bg-secondary p-3 text-xs">
            {JSON.stringify(m.raw, null, 2)}
          </pre>
        </details>
      ))}
    </dialog>
  );
}
