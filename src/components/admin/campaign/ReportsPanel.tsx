"use client";
import { useState } from "react";
import Link from "next/link";
import { Copy, ExternalLink, FileText } from "lucide-react";
import { createReportAction, previewReportAction, publishReportAction, saveReportAction } from "@/app/actions/campaign-results";
import { normalizeReportSettings } from "@/lib/campaign/report-settings";
import { isConfirmed } from "@/lib/campaign/metrics";
import type { PublicReport, Report, ReportSettings, Snapshot } from "@/lib/campaign/types";
import { ResultsReport, shortDate } from "@/components/campaign/ResultsReport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Editor, ErrorText, inputClass, useAction } from "./Controls";

const flags: [keyof ReportSettings, string][] = [["showFollowers", "팔로워"], ["showDisplayNames", "검토한 표시 이름"], ["showAllPosts", "전체 게시물"], ["showDistribution", "재생 분포"], ["showFollowerTiers", "팔로워 구간표"], ["showCompliance", "준수 결과"], ["showForecast", "예측 실현율"]];
function SettingsFields({ settings, onChange }: { settings: ReportSettings; onChange: (value: ReportSettings) => void }) {
  return <div className="space-y-4">
    <fieldset className="grid grid-cols-2 gap-3"><legend className="mb-2 text-sm font-medium">보고서에 표시할 항목</legend>{flags.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings[key] === true} onChange={e => onChange({ ...settings, [key]: e.target.checked })} />{label}</label>)}</fieldset>
    <label className="block space-y-2"><span>상위 게시물 수 (0이면 숨김)</span><Input type="number" min={0} max={300} value={settings.showTopPosts} onChange={e => onChange({ ...settings, showTopPosts: Number(e.target.value) })} /></label>
    <label className="block space-y-2"><span>헤더 표시명</span><Input value={settings.brandLabel ?? ""} onChange={e => onChange({ ...settings, brandLabel: e.target.value })} /></label>
    <label className="block space-y-2"><span>고지 문구</span><textarea className={inputClass + " w-full"} rows={3} value={settings.noticeText ?? ""} placeholder="비우면 기본 고지" onChange={e => onChange({ ...settings, noticeText: e.target.value })} /></label>
  </div>;
}
function ReportCard({ report, snapshots }: { report: Report; snapshots: Snapshot[] }) {
  const [settings, setSettings] = useState(normalizeReportSettings(report.settings));
  const [snapshot, setSnapshot] = useState(report.published_snapshot_id ?? snapshots.at(-1)?.id ?? "");
  const [trendIds, setTrendIds] = useState(snapshots.map(s => s.id)), [preview, setPreview] = useState<PublicReport | null>(null);
  const [editing, setEditing] = useState(false), [copyMessage, setCopyMessage] = useState("");
  const action = useAction();
  const published = snapshots.find(s => s.id === report.published_snapshot_id);
  return <article className="space-y-5 rounded-2xl border border-border bg-card p-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-2"><h3 className="font-semibold">{report.title}</h3><p className="font-mono text-xs text-ink-3">{report.share_code}</p>
      <Badge tone={report.published_at ? "success" : "neutral"}>{report.published_at ? `발행됨 ${published?.label ?? ""} · ${shortDate(report.published_at)}` : "미발행"}</Badge></div>
      <Editor title="보고서 설정" open={editing} onOpenChange={setEditing}>
        <form className="space-y-4" action={f => action.run(() => saveReportAction(report.id, { title: String(f.get("title")), client_label: String(f.get("client") ?? "") || null, is_active: report.is_active, expires_at: f.get("expiry") ? `${f.get("expiry")}T23:59:59+09:00` : null, settings }), () => setEditing(false))}>
          <label className="block space-y-2"><span>제목</span><Input name="title" required defaultValue={report.title} /></label>
          <label className="block space-y-2"><span>클라이언트 라벨</span><Input name="client" defaultValue={report.client_label ?? ""} /></label>
          <label className="block space-y-2"><span>만료일 (KST)</span><Input type="date" name="expiry" defaultValue={report.expires_at ? new Date(Date.parse(report.expires_at) + 9 * 3600000).toISOString().slice(0, 10) : ""} /></label>
          <SettingsFields settings={settings} onChange={setSettings} />
          <p className="text-xs text-ink-3">저장한 설정으로 미리보기·발행을 진행합니다.<br />기존 발행본은 재발행할 때 갱신됩니다.</p>
          <Button type="submit" disabled={action.pending}>설정 저장</Button><ErrorText error={action.error} />
        </form>
      </Editor>
    </header>
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex flex-wrap items-center gap-2 text-xs text-ink-3">발행 기준 회차<select className={inputClass} value={snapshot} onChange={e => setSnapshot(e.target.value)}>{!snapshots.length && <option value="">확정 회차 없음</option>}{snapshots.map(s => <option key={s.id} value={s.id}>{s.label} · {shortDate(s.taken_at)}</option>)}</select></label>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={report.is_active} disabled={action.pending} onChange={e => action.run(() => saveReportAction(report.id, { ...report, is_active: e.target.checked }))} />링크 활성</label>
      <p className="text-xs text-ink-3">{report.expires_at ? `만료 ${shortDate(report.expires_at)} KST` : "만료 없음"}</p>
    </div>
    <fieldset className="flex flex-wrap gap-3 text-xs"><legend className="mb-2 text-ink-3">공개할 추이 회차</legend>{snapshots.map(s => <label key={s.id} className="flex items-center gap-1.5"><input type="checkbox" checked={trendIds.includes(s.id)} onChange={e => setTrendIds(ids => e.target.checked ? [...ids, s.id] : ids.filter(id => id !== s.id))} />{s.label}</label>)}</fieldset>
    <div className="flex flex-wrap gap-2 border-t border-border pt-4">
      <Button disabled={action.pending || !snapshot} onClick={() => action.run(() => publishReportAction(report.id, snapshot, trendIds), () => setPreview(null))}>{report.published_at ? "재발행" : "발행"}</Button>
      <Button variant="outline" disabled={action.pending || !snapshot} onClick={() => action.run(() => previewReportAction(report.id, snapshot, trendIds), setPreview)}>미리보기</Button>
      <Button variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(`${location.origin}/results/${report.share_code}`); setCopyMessage("링크를 복사했습니다."); } catch { setCopyMessage("링크를 복사하지 못했습니다. 브라우저 권한을 확인해 주세요."); } }}><Copy aria-hidden />링크 복사</Button>
      {report.published_at && <Link href={`/results/${report.share_code}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-ink-2">발행본 <ExternalLink className="size-3" aria-hidden /></Link>}
    </div>
    {copyMessage && <p role="status" className="text-xs text-ink-3">{copyMessage}</p>}
    <ErrorText error={action.error} />
    <Dialog open={Boolean(preview)} onOpenChange={open => { if (!open) setPreview(null); }}><DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-[960px]"><DialogTitle>현재 데이터 미리보기 · 미발행</DialogTitle>{preview && <ResultsReport report={preview} />}</DialogContent></Dialog>
  </article>;
}
export function ReportsPanel({ projectId, reports, snapshots }: { projectId: string; reports: Report[]; snapshots: Snapshot[] }) {
  const action = useAction();
  const [open, setOpen] = useState(false), [settings, setSettings] = useState(normalizeReportSettings({})), [draftId, setDraftId] = useState<string | null>(null);
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">클라이언트 보고서</h2><p className="mt-1 text-xs text-ink-3">발행한 회차의 성과를 공유 링크로 전달합니다.</p></div><Button onClick={() => setOpen(true)}>보고서 만들기</Button></div>
    {!reports.length && <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-14 text-center"><FileText className="size-8 text-ink-3" aria-hidden /><h3 className="text-sm font-semibold">아직 보고서가 없습니다.</h3><p className="text-xs text-ink-3">보고서를 만들고 측정 회차를 선택해 발행해 주세요.</p><Button variant="outline" onClick={() => setOpen(true)}>보고서 만들기</Button></div>}
    {reports.map(r => <ReportCard key={r.id} report={r} snapshots={snapshots.filter(s => isConfirmed(s.status))} />)}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85svh] overflow-y-auto p-6 sm:max-w-2xl"><DialogTitle>보고서 만들기</DialogTitle>
      <form className="space-y-4" action={f => action.run(async () => {
        let id = draftId;
        if (!id) { const created = await createReportAction(projectId, String(f.get("title"))); if (!created.ok) return created; id = created.data.id; setDraftId(id); }
        return saveReportAction(id, { title: String(f.get("title")), client_label: String(f.get("client") ?? "") || null, is_active: true, expires_at: f.get("expiry") ? `${f.get("expiry")}T23:59:59+09:00` : null, settings });
      }, () => { setOpen(false); setDraftId(null); })}>
        <label className="block space-y-2"><span>제목</span><Input name="title" required placeholder="캠페인 성과 보고서" /></label>
        <label className="block space-y-2"><span>클라이언트 라벨</span><Input name="client" /></label>
        <SettingsFields settings={settings} onChange={setSettings} />
        <label className="block space-y-2"><span>만료일 (선택 · KST)</span><Input type="date" name="expiry" /></label>
        <Button type="submit" disabled={action.pending}>{action.pending ? "저장 중…" : draftId ? "설정 저장 재시도" : "만들기"}</Button>
        <ErrorText error={action.error} />
      </form>
    </DialogContent></Dialog>
  </section>;
}
