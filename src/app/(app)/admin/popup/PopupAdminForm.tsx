"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createSitePopupAction, updateSitePopupAction } from "@/app/actions/site-popup";

export type PopupRow = {
  id: string;
  title: string;
  body: string;
  cta_label: string | null;
  cta_href: string | null;
  is_active: boolean;
  updated_at: string;
};

const inputCls =
  "mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

export function PopupAdminForm({ initial }: { initial: PopupRow | null }) {
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [ctaLabel, setCtaLabel] = useState(initial?.cta_label ?? "");
  const [ctaHref, setCtaHref] = useState(initial?.cta_href ?? "/report");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const buildFd = () => {
    const fd = new FormData();
    if (initial) fd.set("id", initial.id);
    fd.set("title", title);
    fd.set("body", body);
    fd.set("cta_label", ctaLabel);
    fd.set("cta_href", ctaHref);
    fd.set("is_active", String(isActive));
    return fd;
  };

  const save = (asNew: boolean) =>
    start(async () => {
      const r = asNew || !initial
        ? await createSitePopupAction(buildFd())
        : await updateSitePopupAction(buildFd());
      if (!r.ok) return void toast.error(r.error);
      toast.success(
        asNew || !initial
          ? "새 팝업으로 등록했습니다. ('다시 보지 않음' 사용자에게도 다시 보입니다)"
          : "저장했습니다.",
      );
    });

  return (
    <div className="flex flex-col gap-5">
      {/* 미리보기 */}
      <div className="rounded-2xl border border-border bg-secondary/40 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-3">미리보기</p>
        <div className="mx-auto max-w-sm rounded-2xl bg-white p-6 shadow-md">
          <p className="text-lg font-bold leading-snug text-[#171611] [word-break:keep-all]">
            {title || "(제목)"}
          </p>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[#4f4a40] [word-break:keep-all]">
            {body || "(본문)"}
          </p>
          {ctaLabel ? (
            <span className="mt-5 block rounded-xl bg-[#171611] py-3 text-center text-sm font-semibold text-white">
              {ctaLabel} →
            </span>
          ) : null}
          <div className="mt-3 flex items-center justify-between text-xs text-[#81796a]">
            <span className="underline">다시 보지 않음</span>
            <span className="font-medium">닫기</span>
          </div>
        </div>
      </div>

      {/* 편집 */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
        <label className="text-sm font-medium">
          제목
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </label>
        <label className="text-sm font-medium">
          본문 <span className="font-normal text-ink-3">(줄바꿈 그대로 표시)</span>
          <textarea className={`${inputCls} min-h-[120px]`} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            버튼 문구
            <input className={inputCls} value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} maxLength={60} placeholder="예: 제보하러 가기" />
          </label>
          <label className="text-sm font-medium">
            버튼 이동 경로
            <input className={inputCls} value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} maxLength={500} placeholder="/report" />
          </label>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
          팝업 노출 (켜면 사이트 진입 시 표시)
        </label>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            disabled={pending}
            onClick={() => save(false)}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {pending ? "저장 중…" : initial ? "저장 (같은 팝업 수정)" : "등록"}
          </button>
          {initial ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => save(true)}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-ink-2 disabled:opacity-50"
            >
              새 팝업으로 등록 (전원 재노출)
            </button>
          ) : null}
        </div>
        <p className="text-xs leading-relaxed text-ink-3">
          저장 = 내용만 수정되어 &lsquo;다시 보지 않음&rsquo;한 사용자에겐 계속 숨겨집니다.
          <br />
          새 팝업으로 등록 = 새 공지로 취급되어 모든 사용자에게 다시 보입니다.
        </p>
      </div>
    </div>
  );
}
