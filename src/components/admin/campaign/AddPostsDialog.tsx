"use client";
import { useState } from "react";
import { addPostsAction } from "@/app/actions/campaign-results";
import { parsePostsInput } from "@/lib/campaign/import";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { tableClass } from "@/components/campaign/ResultsReport";
import { Editor, ErrorText, inputClass, useAction } from "./Controls";
type Preview = { row: number; code: string; status: string; error: boolean };
export function AddPostsDialog({ projectId, existingCodes = [] }: { projectId: string; existingCodes?: string[] }) {
  const [open, setOpen] = useState(false), [text, setText] = useState(""), [csv, setCsv] = useState(false);
  const [preview, setPreview] = useState<Preview[]>([]), [ready, setReady] = useState(false), [saved, setSaved] = useState<number | null>(null);
  const action = useAction();
  function inspect() {
    setReady(false); setSaved(null);
    // Split CSV records outside quoted fields; the existing parser validates each record.
    const records: string[] = []; let quoted = false, record = "";
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (csv && char === '"') { if (quoted && text[i + 1] === '"') { record += '""'; i++; continue; } quoted = !quoted; }
      if (char === "\n" && !quoted) { if (record.trim()) records.push(record); record = ""; } else record += char;
    }
    if (record.trim()) records.push(record);
    const header = csv ? records.shift() : null;
    const seen = new Set(existingCodes);
    const result = records.map((line, index): Preview => {
      try {
        const post = parsePostsInput(csv ? header + "\n" + line : line, csv)[0];
        const duplicate = seen.has(post.short_code); seen.add(post.short_code);
        return { row: index + 1, code: post.short_code, status: duplicate ? "중복 게시물" : "등록 가능", error: duplicate };
      } catch (e) { return { row: index + 1, code: "—", status: e instanceof Error ? e.message.replace(/^1행/, `${index + 1}행`) : "입력 오류", error: true }; }
    });
    if (!result.length || result.length > 300 || text.length > 500000) result.push({ row: 0, code: "—", status: "한 번에 1–300개, 500KB까지 입력해 주세요.", error: true });
    setPreview(result);
    if (result.some(r => r.error)) return;
    action.run(() => addPostsAction(projectId, text, csv, true), d => {
      setPreview(result.map(r => { const matches = d.candidates.find(c => c.shortCode === r.code)?.candidates ?? []; return { ...r, status: matches.length > 1 ? "등록 가능 · 연결 후보 중복 (수동 연결)" : matches.length === 1 ? `등록 가능 · ${matches[0].name}` : "등록 가능 · 연결 없음" }; }));
      setReady(true);
    });
  }
  return <Editor title="게시물 추가" variant="default" open={open} onOpenChange={setOpen}>
    <div className="flex gap-4 border-b border-border">{[false, true].map(mode => <Button key={String(mode)} variant="ghost" disabled={action.pending} className={`rounded-none border-b-2 ${csv === mode ? "border-primary" : "border-transparent text-ink-3"}`} onClick={() => { setCsv(mode); setPreview([]); setReady(false); }}>{mode ? "CSV" : "URL 붙여넣기"}</Button>)}</div>
    {csv && <div className="space-y-2"><p className="text-xs text-ink-3">열: post_url, handle, display_name, collab_handles · 공동작업 핸들은 세미콜론으로 구분합니다.</p><input disabled={action.pending} type="file" aria-label="CSV 파일" accept=".csv,text/csv" onChange={async e => { const file = e.target.files?.[0]; if (file) { setText(await file.text()); setPreview([]); setReady(false); } }} /></div>}
    <textarea disabled={action.pending} className={inputClass + " min-h-48 w-full"} aria-label={csv ? "CSV 내용" : "게시물 URL 여러 줄"} value={text} onChange={e => { setText(e.target.value); setPreview([]); setReady(false); setSaved(null); }} placeholder="URL 또는 @handle URL을 한 줄에 하나씩 입력하세요." />
    <Button variant="outline" disabled={action.pending || !text.trim()} onClick={inspect}>{action.pending ? "확인 중…" : "미리보기"}</Button>
    {preview.length > 0 && <div className="max-h-64 overflow-auto rounded-xl border border-border"><table className={tableClass}><thead><tr><th scope="col">행</th><th scope="col">게시물</th><th scope="col">확인 결과</th></tr></thead><tbody>{preview.map((r, i) => <tr key={i}><td>{r.row || "—"}</td><td>{r.code}</td><td><Badge tone={r.error ? "danger" : "success"}>{r.status}</Badge></td></tr>)}</tbody></table></div>}
    {ready && <Button disabled={action.pending} onClick={() => action.run(() => addPostsAction(projectId, text, csv), d => { setText(""); setPreview([]); setReady(false); setSaved(d.count); })}>{preview.length}건 저장</Button>}
    {saved !== null && <p role="status" className="text-ok">{saved}건을 저장했습니다.</p>}
    <ErrorText error={action.error} />
  </Editor>;
}
