"use client";

import { useState } from "react";
import Link from "next/link";
import {
  createReportAction,
  previewReportAction,
  publishReportAction,
  saveReportAction,
} from "@/app/actions/campaign-results";
import { normalizeReportSettings } from "@/lib/campaign/report-settings";
import { isConfirmed } from "@/lib/campaign/metrics";
import type {
  PublicReport,
  Report,
  ReportSettings,
  Snapshot,
} from "@/lib/campaign/types";
import {
  date,
  ResultsReport,
  tableClass,
} from "@/components/campaign/ResultsReport";
import {
  buttonClass,
  Editor,
  ErrorText,
  inputClass,
  useAction,
} from "./Controls";
function ReportEditor({
  report,
  snapshots,
}: {
  report: Report;
  snapshots: Snapshot[];
}) {
  const [settings, setSettings] = useState(
      normalizeReportSettings(report.settings),
    ),
    [snapshot, setSnapshot] = useState(
      report.published_snapshot_id ?? snapshots.at(-1)?.id ?? "",
    ),
    [trendIds, setTrendIds] = useState(snapshots.map((s) => s.id)),
    [preview, setPreview] = useState<PublicReport | null>(null),
    [copied, setCopied] = useState(false);
  const action = useAction();
  const flags: [keyof ReportSettings, string][] = [
    ["showFollowers", "팔로워"],
    ["showDisplayNames", "검토한 표시 이름"],
    ["showAllPosts", "전체 게시물"],
    ["showDistribution", "재생 분포"],
    ["showFollowerTiers", "팔로워 구간표"],
    ["showCompliance", "준수 결과"],
    ["showForecast", "예측 실현율"],
  ];
  return (
    <Editor title={`${report.title} 편집`}>
      <form
        className="space-y-3"
        action={(f) =>
          action.run(() =>
            saveReportAction(report.id, {
              title: String(f.get("title")),
              client_label: String(f.get("client") ?? "") || null,
              is_active: f.get("active") === "on",
              expires_at: String(f.get("expiry") ?? "") || null,
              settings,
            }),
          )
        }
      >
        <label className="block">
          제목{" "}
          <input
            name="title"
            required
            defaultValue={report.title}
            className={inputClass}
          />
        </label>
        <label className="block">
          클라이언트{" "}
          <input
            name="client"
            defaultValue={report.client_label ?? ""}
            className={inputClass}
          />
        </label>
        <label className="block">
          만료 시각 (시간대 포함){" "}
          <input
            name="expiry"
            defaultValue={report.expires_at ?? ""}
            placeholder="2026-12-31T23:59:59+09:00"
            className={inputClass}
          />
        </label>
        <label className="block">
          <input
            name="active"
            type="checkbox"
            defaultChecked={report.is_active}
          />{" "}
          링크 활성
        </label>
        <div className="flex flex-wrap gap-4">
          {flags.map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={settings[key] === true}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    [key]: e.target.checked,
                  }))
                }
              />{" "}
              {label}
            </label>
          ))}
        </div>
        <label className="block">
          상위 게시물 수 (0이면 숨김){" "}
          <input
            type="number"
            min={0}
            max={300}
            className={inputClass}
            value={settings.showTopPosts}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                showTopPosts: Number(e.target.value),
              }))
            }
          />
        </label>
        <label className="block">
          헤더 표시명{" "}
          <input
            className={inputClass}
            value={settings.brandLabel ?? ""}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                brandLabel: e.target.value,
              }))
            }
          />
        </label>
        <label className="block">
          고지 문구
          <textarea
            className={`${inputClass} block w-full`}
            value={settings.noticeText ?? ""}
            placeholder="비우면 기본 고지"
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                noticeText: e.target.value,
              }))
            }
          />
        </label>
        <button className={buttonClass} disabled={action.pending}>
          편집 설정 저장
        </button>
        <p className="text-sm text-ink-3">
          저장한 설정으로 미리보기·발행을 진행합니다.
          <br />
          설정 저장만으로 기존 발행본은 바뀌지 않습니다.
        </p>
      </form>
      <label className="block">
        발행 기준 회차{" "}
        <select
          className={inputClass}
          value={snapshot}
          onChange={(e) => setSnapshot(e.target.value)}
        >
          {snapshots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-wrap gap-3">
        <legend>공개할 추이 회차</legend>
        {snapshots.map((s) => (
          <label key={s.id}>
            <input
              type="checkbox"
              checked={trendIds.includes(s.id)}
              onChange={(e) =>
                setTrendIds((ids) =>
                  e.target.checked
                    ? [...ids, s.id]
                    : ids.filter((id) => id !== s.id),
                )
              }
            />{" "}
            {s.label}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <button
          className={buttonClass}
          disabled={action.pending || !snapshot}
          onClick={() =>
            action.run(
              () => previewReportAction(report.id, snapshot, trendIds),
              setPreview,
            )
          }
        >
          미리보기 (현재 데이터)
        </button>
        <button
          className={buttonClass}
          disabled={action.pending || !snapshot}
          onClick={() =>
            action.run(
              () => publishReportAction(report.id, snapshot, trendIds),
              () => setPreview(null),
            )
          }
        >
          {report.published_at ? "재발행" : "발행"}
        </button>
        {report.published_at && (
          <Link
            className={buttonClass}
            target="_blank"
            href={`/results/${report.share_code}`}
          >
            발행본
          </Link>
        )}
        <button
          className={buttonClass}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                `${location.origin}/results/${report.share_code}`,
              );
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "복사 완료" : "공유 링크 복사"}
        </button>
      </div>
      <ErrorText error={action.error} />
      {preview && (
        <div className="rounded-xl border border-border">
          <p className="p-4 font-semibold">
            현재 데이터 미리보기 · 아직 발행되지 않은 내용입니다.
          </p>
          <button
            className={`${buttonClass} ml-4`}
            onClick={() => setPreview(null)}
          >
            미리보기 닫기
          </button>
          <ResultsReport report={preview} />
        </div>
      )}
    </Editor>
  );
}
export function ReportsPanel({
  projectId,
  reports,
  snapshots,
}: {
  projectId: string;
  reports: Report[];
  snapshots: Snapshot[];
}) {
  const action = useAction();
  return (
    <section className="space-y-5">
      <form
        className="flex gap-3"
        action={(f) =>
          action.run(() =>
            createReportAction(projectId, String(f.get("title") ?? "")),
          )
        }
      >
        <input
          aria-label="새 보고서 제목"
          name="title"
          required
          placeholder="새 보고서 제목"
          className={inputClass}
        />
        <button disabled={action.pending} className={buttonClass}>
          보고서 생성
        </button>
      </form>
      <ErrorText error={action.error} />
      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr>
              {[
                "제목",
                "코드",
                "발행 여부",
                "고정 회차",
                "발행 시각",
                "만료",
                "활성",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td>{r.title}</td>
                <td>{r.share_code}</td>
                <td>{r.published_at ? "발행됨" : "미발행"}</td>
                <td>
                  {snapshots.find((s) => s.id === r.published_snapshot_id)
                    ?.label ?? "—"}
                </td>
                <td>{date(r.published_at)}</td>
                <td>{date(r.expires_at)}</td>
                <td>{r.is_active ? "활성" : "비활성"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {reports.map((r) => (
        <ReportEditor
          key={r.id}
          report={r}
          snapshots={snapshots.filter((s) => isConfirmed(s.status))}
        />
      ))}
    </section>
  );
}
