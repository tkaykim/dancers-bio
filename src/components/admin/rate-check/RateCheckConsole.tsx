"use client";

import { useRef, useState, useTransition } from "react";
import { Copy, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkInstagramRateAction } from "@/app/actions/rate-check";
import { formatKoCount, TIER_LABEL, TIER_ORDER, type LineupTier } from "@/lib/casting/forecast";
import type { RateCheckData } from "@/lib/rate-check/types";

const money = (value: number | null) => value === null ? "—" : `${value.toLocaleString("ko-KR")}원`;
const views = (value: number | null) => value === null ? "미측정" : `${value.toLocaleString("ko-KR")}회`;
const followers = (value: number | null) => value === null ? "미확인" : formatKoCount(value);
const sampleLabel = (value: string) => value === "ok" ? "정상" : value === "short" ? "표본 부족(참고치)" : "표본 부족(산정 불가)";
const date = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

function safeUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch { return undefined; }
}

function TierBadge({ tier }: { tier: LineupTier | null }) {
  return <span className="inline-flex rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-ink-2">{tier ? TIER_LABEL[tier] : "미측정"}</span>;
}

function RateCheckResult({ result }: { result: RateCheckData }) {
  async function copySummary() {
    const rate = result.error ? "측정 실패" : result.formulaRate === null
      ? `산정 불가 · F 기준 참고가 ${money(result.fBase)}` : money(result.formulaRate);
    const summary = `@${result.handle} · 팔로워 ${followers(result.followers)} · 최근 릴스 평균 ${views(result.trimmedMean)} · ${result.tier ? TIER_LABEL[result.tier] : "미측정"} · 안내가 ${rate}`;
    try { await navigator.clipboard.writeText(summary); toast.success("요약을 복사했습니다."); }
    catch { toast.error("클립보드에 복사하지 못했습니다."); }
  }
  const photo = safeUrl(result.profilePicUrl);
  return (
    <section aria-label="측정 결과" className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        {/* Arbitrary Instagram CDN hosts; no image proxy or client credentials. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo && <img src={photo} alt="" width={48} height={48} referrerPolicy="no-referrer" className="size-12 rounded-full object-cover" />}
        <div className="min-w-0 flex-1">
          <a href={`https://www.instagram.com/${result.handle}/`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all font-bold hover:underline">@{result.handle}<ExternalLink size={14} aria-hidden /></a>
          <p className="text-sm text-ink-2">{result.fullName} · 팔로워 {followers(result.followers)}</p>
          <p className="text-xs text-ink-3">{date(result.createdAt)} KST{result.cached ? " · 캐시 결과" : ""}</p>
        </div>
        <Button variant="outline" size="sm" onClick={copySummary}><Copy size={14} aria-hidden />요약 복사</Button>
      </header>
      {result.error ? <p role="alert" className="p-4 text-sm text-destructive">{result.error}</p> : (
        <div className="grid gap-6 p-4 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h2 className="font-semibold">최근 릴스 조회수 <span className="text-sm font-normal text-ink-3">{result.reelsUsed}개 · 오름차순</span></h2>
            <ol className="divide-y divide-border">
              {result.reels.map((reel, index) => {
                const url = safeUrl(reel.url);
                return <li key={`${reel.shortCode ?? index}-${index}`} className={`flex items-center gap-2 py-2 text-sm ${reel.excluded ? "text-ink-3 opacity-60" : "text-foreground"}`}>
                  <span className="w-5 text-xs text-ink-3">{index + 1}</span>
                  <span className="text-xs text-ink-3">{reel.timestamp ? new Date(reel.timestamp).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : "게시일 미확인"}</span>
                  <span className="ml-auto font-mono tabular-nums">{views(reel.plays)}</span>
                  {reel.excluded && <span className="rounded bg-secondary px-1 text-xs">제외</span>}
                  {url && <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`${index + 1}번 릴스 게시물 보기`} className="p-1 hover:text-primary"><ExternalLink size={14} aria-hidden /></a>}
                </li>;
              })}
            </ol>
            {result.reels.length === 0 && <p className="text-sm text-ink-3">조회수를 확인할 수 있는 릴스가 없습니다.</p>}
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2"><TierBadge tier={result.tier} /><span className="text-xs text-ink-2">{sampleLabel(result.sampleStatus)}</span></div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {([
                ["절사평균", views(result.trimmedMean)], ["중앙값", views(result.median)],
                ["보정 기대치", views(result.expectedViews)],
                ["절사 후 범위", result.viewsLow === null ? "미측정" : `${views(result.viewsLow)} ~ ${views(result.viewsHigh)}`],
                ["F · 팔로워 기본단가", money(result.fBase)], ["V · 도달 단가", money(result.vBase)],
              ]).map(([label, value]) => <div key={label}><dt className="text-xs text-ink-3">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}
            </dl>
            <div className="rounded-lg border border-border bg-secondary p-4">
              <p className="text-xs text-ink-2">{result.formulaRate === null ? "F 기준 참고가" : "산식가 · 안내가"}</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{money(result.formulaRate ?? result.fBase)}</p>
              {result.formulaRate === null && <p className="mt-2 text-xs text-ink-2">표본이 6개 미만으로 산식가를 계산하지 않았습니다.</p>}
              <p className="mt-2 text-xs text-ink-3">하한 50,000원 · 상한 500,000원</p>
              {result.outOfLadder && <p className="mt-2 text-sm font-semibold text-primary">단가표 밖 인물 · 개별 협의</p>}
            </div>
            <p className="text-xs leading-relaxed text-ink-2">오퍼가 = 희망가와 산식가 중 낮은 쪽.<br />희망가가 산식가보다 높으면 산식가로 협의.<br />상업(브랜드) 챌린지는 별도 협의.</p>
          </div>
        </div>
      )}
    </section>
  );
}

export function RateCheckConsole({ history, historyError }: { history: RateCheckData[]; historyError: string | null }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RateCheckData | null>(null);
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState<LineupTier | "all" | "unmeasured">("all");
  const resultRef = useRef<HTMLDivElement>(null);
  const query = search.trim().toLowerCase().replace(/^@/, "");
  const rows = history.filter((row) => row.handle.includes(query) && (tier === "all" || (tier === "unmeasured" ? row.tier === null : row.tier === tier)));

  function submit(fd: FormData) {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const response = await checkInstagramRateAction(fd);
        if (!response.ok) setError(response.error);
        else setResult(response.data);
      } catch { setError("측정 요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요."); }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form action={submit} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-busy={pending}>
        <label htmlFor="rate-check-handle" className="text-sm font-medium">인스타그램 핸들 또는 프로필 URL</label>
        <div className="flex gap-2">
          <Input id="rate-check-handle" name="handle" placeholder="@handle 또는 instagram.com/handle" required maxLength={2048} disabled={pending} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          <Button type="submit" disabled={pending}>{pending && <Loader2 size={16} className="animate-spin" aria-hidden />}{pending ? "측정 중" : "측정"}</Button>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-2"><input type="checkbox" name="force" value="true" disabled={pending} className="accent-primary" />캐시 무시하고 재측정</label>
        <p className="text-xs text-ink-3">7일 이내 결과는 캐시로 표시합니다.<br />새 측정은 한국 시간 기준 하루 30회까지 가능합니다.</p>
        {pending && <p role="status" className="text-xs text-ink-2">프로필과 릴스를 수집하고 있습니다.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>
      <div ref={resultRef}>{result && <RateCheckResult result={result} />}</div>
      <section aria-label="조회 히스토리" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">조회 히스토리 <span className="text-sm font-normal text-ink-3">최근 200건 · {rows.length}건 표시</span></h2>
        {historyError && <p role="alert" className="text-sm text-destructive">{historyError}</p>}
        <Input aria-label="히스토리 핸들 검색" placeholder="핸들 검색" value={search} onChange={(event) => setSearch(event.target.value)} className="max-w-sm" />
        <div className="flex flex-wrap gap-2" aria-label="티어 필터">
          {(["all", ...TIER_ORDER, "unmeasured"] as const).map((value) => <button key={value} type="button" aria-pressed={tier === value} onClick={() => setTier(value)} className={`rounded-full border px-3 py-1.5 text-xs ${tier === value ? "border-primary bg-primary text-primary-foreground" : "border-border text-ink-2 hover:bg-secondary"}`}>{value === "all" ? "전체" : value === "unmeasured" ? "미측정" : TIER_LABEL[value]}</button>)}
        </div>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border bg-secondary text-xs text-ink-3"><tr>{["시각 (KST)", "핸들", "팔로워", "보정 기대치", "티어", "산식가", "표본", "조회자"].map((label) => <th key={label} scope="col" className="px-3 py-3 font-medium">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => <tr key={row.id} onClick={() => { setResult(row); resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="cursor-pointer hover:bg-secondary/60">
                <td className="whitespace-nowrap px-3 py-3 text-xs text-ink-3">{date(row.createdAt)}</td>
                <td className="px-3 py-3"><button type="button" className="font-semibold hover:underline" onClick={() => setResult(row)}>@{row.handle}</button></td>
                <td className="px-3 py-3 tabular-nums">{followers(row.followers)}</td>
                <td className="px-3 py-3 tabular-nums">{views(row.expectedViews)}</td>
                <td className="px-3 py-3"><TierBadge tier={row.tier} /></td>
                <td className="px-3 py-3 tabular-nums">{money(row.formulaRate)}</td>
                <td className="px-3 py-3 text-xs">{row.error ? "측정 실패" : `${sampleLabel(row.sampleStatus)} · ${row.reelsUsed}개`}</td>
                <td className="px-3 py-3 text-xs text-ink-3">{row.createdBy ?? "—"}</td>
              </tr>)}
              {!rows.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-ink-3">{historyError ? "조회 기록을 표시할 수 없습니다." : "조건에 맞는 조회 기록이 없습니다."}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
