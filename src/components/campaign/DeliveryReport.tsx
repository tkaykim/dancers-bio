"use client";
import { useState } from "react";
import { ArrowUpRight, CalendarDays, Check, Copy, Printer, Search } from "lucide-react";
import type { PublicReport } from "@/lib/campaign/types";
import styles from "./DeliveryReport.module.css";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { compactFollowers } from "@/lib/campaign/format-count";

const num = (n: number) => n.toLocaleString("ko-KR");
const stamp = (date: string) => new Date(Date.parse(date) + 9 * 3600000).toISOString().slice(0, 16).replace("T", " ");
export function DeliveryReport({ report }: { report: PublicReport }) {
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState("");
  const d = report.delivery!;
  const items = d.items.filter(p => [...p.names, p.handle ?? ""].join(" ").toLowerCase().includes(search.toLowerCase()));
  const viewLabel = d.views === null ? "확인 중" : (d.approximate ? "약 " : "") + num(d.views);
  return <article className={styles.report}>
    <div className={styles.toolbar}>
      <span>광고주 공유용</span>
      <div><button onClick={async () => { try { await navigator.clipboard.writeText(location.href); setCopied("링크를 복사했습니다."); } catch { setCopied("주소창의 링크를 복사해 주세요."); } }}><Copy size={15} />링크 복사</button>
        <button onClick={() => window.print()}><Printer size={15} />인쇄 · PDF</button></div>
      {copied && <span role="status">{copied}</span>}
    </div>
    <header className={styles.header}>
      <div className={styles.brand}><DeetzLogo className={styles.logo} priority /></div>
      <div className={styles.headerGrid}>
        <div className={styles.titleBlock}>
          <h1>{report.title}</h1>
          <p className={styles.subtitle}>공개 업로드가 확인된 콘텐츠의 참여 현황과 누적 조회수입니다.</p>
        </div>
        <div className={styles.observed}>
          <div className={styles.timestamp}><strong>조회수 기준</strong><span>{stamp(report.snapshot.takenAt)} · 한국 시간</span></div>
          {d.followersCheckedAt && <div className={styles.followerTime}><strong>팔로워 확인</strong><span>{stamp(d.followersCheckedAt)} · 한국 시간</span></div>}
        </div>
      </div>
    </header>
    <section className={styles.metrics} aria-label="업로드 성과 요약">
      <div className={styles.heroMetric}><span>{d.measured < d.posts ? "조회수 확인분 합계" : "누적 조회수"}</span><strong>{viewLabel}<small>{d.views === null ? "" : "회"}</small></strong><p>완료 영상 {d.measured}/{d.posts}개 조회수 확인</p></div>
      <div><span>업로드 완료 참여자</span><strong>{d.participants}<small>명·팀</small></strong><p>실제 제출 영상 기준</p></div>
      <div><span>업로드 영상</span><strong>{d.posts}<small>개</small></strong><p>동일 링크는 한 번만 집계</p></div>
    </section>
    <div className={styles.contentGrid}>
      <section className={styles.section}>
        <div className={styles.sectionHead}><div><h2>업로드 완료 <span>{d.posts}</span></h2></div>
          <label className={styles.search}><Search size={17}/><span>참여자 검색</span><input aria-label="참여자 검색" value={search} onChange={e => setSearch(e.target.value)}/></label>
        </div>
        <p className={styles.caption}>조회수 높은 순 · 이름과 영상 보기를 눌러 원본을 확인할 수 있습니다.</p>
        <div className={styles.tableWrap}><table><thead><tr><th scope="col">참여자</th><th scope="col">상태</th><th scope="col">누적 조회수</th><th scope="col">콘텐츠</th></tr></thead>
          <tbody>{d.items.map(p => <tr key={p.url} hidden={!items.includes(p)}><td><a href={p.url} target="_blank" rel="noreferrer"><strong>{p.names.join(" · ")}</strong></a>{p.handle && <a className={styles.handle} href={`https://www.instagram.com/${p.handle}/`} target="_blank" rel="noreferrer">@{p.handle}</a>}<span className={styles.followers}>팔로워 {compactFollowers(p.followers)}</span></td><td><span className={styles.completed}><Check size={13}/>업로드 완료</span></td><td className={styles.views}><span className={styles.mobileLabel}>누적 조회수</span>{p.views === null ? "확인 중" : (d.approximate ? "약 " : "") + num(p.views)}{p.views !== null && <small> 회</small>}</td><td><a className={styles.video} href={p.url} target="_blank" rel="noreferrer">영상 보기<ArrowUpRight size={15}/></a></td></tr>)}</tbody></table></div>
        {!items.length && <p className={styles.empty}>검색 결과가 없습니다.</p>}
      </section>
      {d.upcoming.length > 0 && <section className={styles.upcoming}>
        <div className={styles.sectionHead}><div><h2>참여 예정 <span>{d.upcoming.length}</span></h2></div><CalendarDays size={22}/></div>
        <p className={styles.caption}>예정 인원은 완료 실적에 포함하지 않았습니다.</p>
        <div className={styles.people}>{d.upcoming.map(p => <div key={p.handle ?? p.name}><strong>{p.name}</strong>{p.handle && <a className={styles.handle} href={`https://www.instagram.com/${p.handle}/`} target="_blank" rel="noreferrer">@{p.handle}</a>}<span className={styles.followers}>팔로워 {compactFollowers(p.followers)}</span><span className={styles.schedule}>{p.date ? p.date.slice(5).replace("-", "/") + " 참여 예정" : "제출 예정"}</span></div>)}</div>
      </section>}
    </div>
    <footer className={styles.footer}><strong>집계 기준</strong><p>{report.notice}</p><span>deetz · 캠페인 운영</span></footer>
  </article>;
}
