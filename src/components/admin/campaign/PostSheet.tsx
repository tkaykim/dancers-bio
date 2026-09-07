"use client";
import { useEffect, useState } from "react";
import { getPostDetailAction, updatePostAction } from "@/app/actions/campaign-results";
import type { Metric, Post, PostStatus, Snapshot } from "@/lib/campaign/types";
import type { Candidate } from "@/lib/campaign/repository";
import { shortDate, number, tableClass } from "@/components/campaign/ResultsReport";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorText, inputClass, useAction } from "./Controls";
export function PostSheet({ post, snapshots, onClose }: { post: Post; snapshots: Snapshot[]; onClose: () => void }) {
  const action = useAction();
  const [loading, setLoading] = useState(true), [rawOpen, setRawOpen] = useState(false);
  const [name, setName] = useState(post.display_name ?? ""), [note, setNote] = useState(post.note ?? ""), [status, setStatus] = useState<PostStatus>(post.status), [collabs, setCollabs] = useState(post.collab_handles.join(";"));
  const [application, setApplication] = useState(post.application_id ?? ""), [candidates, setCandidates] = useState<Candidate[]>([]), [metrics, setMetrics] = useState<(Metric & { raw: unknown })[]>([]), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getPostDetailAction(post.id).then(r => { if (cancelled) return; setLoading(false); if (r.ok) { setMetrics(r.data.metrics); setCandidates(r.data.candidates); } else setError(r.error); }).catch(() => { if (!cancelled) { setLoading(false); setError("상세 정보를 불러오지 못했습니다."); } });
    return () => { cancelled = true; };
  }, [post.id]);
  return <Drawer open onOpenChange={open => { if (!open) onClose(); }} title={`게시물 상세 · ${post.short_code}`} className="sm:w-[680px]">
    <div className="space-y-5">
      <a href={post.post_url} target="_blank" rel="noreferrer" className="text-sm underline underline-offset-4">Instagram 게시물 열기 ↗</a>
      <p className="text-xs text-ink-3">소유 계정 @{post.owner_handle ?? "미확인"} · {post.owner_confirmed_at ? `관측 확인 ${shortDate(post.owner_confirmed_at)} KST` : "소유 계정 미확정"}</p>
      {loading ? <p role="status" className="text-sm text-ink-3">회차별 지표와 지원자를 불러오고 있습니다.</p> : <div className="overflow-x-auto rounded-xl border border-border"><table className={tableClass}><thead><tr>{["회차", "관측", "재생", "좋아요", "댓글", "공유"].map((h, i) => <th scope="col" className={i > 1 ? "text-right" : ""} key={h}>{h}</th>)}</tr></thead><tbody>
        {metrics.map(m => <tr key={m.snapshot_id}><td>{snapshots.find(s => s.id === m.snapshot_id)?.label ?? "측정 회차"}</td><td>{{ found: "확인", not_found: "미확인", error: "오류" }[m.fetch_status]}</td>{(["plays", "likes", "comments", "shares"] as const).map(key => <td key={key} className="text-right tabular-nums" title={m[key] == null ? "미확인" : undefined}>{number(m[key])}</td>)}</tr>)}
        {!metrics.length && <tr><td colSpan={6} className="text-center text-ink-3">측정 기록이 없습니다.</td></tr>}
      </tbody></table></div>}
      {post.note?.includes("소유 계정 불일치:") && <p role="status" className="rounded-lg bg-warn/10 p-3 text-sm text-warn">{post.note.split("\n").filter(l => l.startsWith("소유 계정 불일치:")).join("\n")}</p>}
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); action.run(() => updatePostAction(post.id, { display_name: name, note, status, collab_handles: collabs.split(";").map(v => v.trim()).filter(Boolean), application_id: application || null, dancer_id: application ? candidates.find(c => c.applicationId === application)?.dancerId ?? post.dancer_id : null }), onClose); }}>
        <label className="block space-y-2 text-sm"><span>보고서 표시 이름</span><Input value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="block space-y-2 text-sm"><span>지원자 연결</span><select className={inputClass + " w-full"} value={application} onChange={e => setApplication(e.target.value)}><option value="">연결 없음</option>{candidates.map(c => <option key={c.applicationId} value={c.applicationId}>{c.name} · {c.handles.map(h => "@" + h).join(", ")}</option>)}</select></label>
        <label className="block space-y-2 text-sm"><span>공동작업 핸들 (세미콜론 구분)</span><Input value={collabs} onChange={e => setCollabs(e.target.value)} /></label>
        <label className="block space-y-2 text-sm"><span>상태</span><select className={inputClass + " w-full"} value={status} onChange={e => setStatus(e.target.value as PostStatus)}><option value="active">게시 중</option>{post.status === "unverified" && <option value="unverified">미확인</option>}<option value="removed">삭제 수동 확인</option><option value="excluded">집계 제외</option></select></label>
        <label className="block space-y-2 text-sm"><span>운영 메모</span><textarea className={inputClass + " w-full"} rows={4} value={note} onChange={e => setNote(e.target.value)} /></label>
        <Button type="submit" disabled={action.pending || loading || Boolean(error)}>{action.pending ? "저장 중…" : "저장"}</Button>
        <ErrorText error={action.error ?? error} />
      </form>
      <Button variant="ghost" aria-expanded={rawOpen} onClick={() => setRawOpen(v => !v)}>{rawOpen ? "원본 접기" : "원본 보기"}</Button>
      {rawOpen && metrics.map(m => <div key={m.snapshot_id}><p className="mb-2 text-xs text-ink-3">{snapshots.find(s => s.id === m.snapshot_id)?.label ?? "측정 회차"}</p><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-secondary p-3 text-xs">{JSON.stringify(m.raw, (key, value) => /run.?id|dataset.?id|snapshot.?id/i.test(key) ? undefined : typeof value === "string" ? value.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[내부 식별자]") : value, 2)}</pre></div>)}
    </div>
  </Drawer>;
}
