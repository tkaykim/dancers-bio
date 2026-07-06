"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/browser";

// 사이트 진입 공지 팝업 (관리: /admin/popup, 데이터: site_popups).
// 닫기 = 이번 세션만 숨김 / 다시 보지 않음 = 이 팝업(id)에 한해 영구 숨김.
// 팝업 내용을 새로 등록(새 id)하면 '다시 보지 않음' 사용자에게도 다시 보인다.

type Popup = {
  id: string;
  title: string;
  body: string;
  cta_label: string | null;
  cta_href: string | null;
};

// 팝업을 띄우지 않는 경로(기능·집중 페이지). CTA 목적지(/report) 포함.
const EXCLUDED_PREFIXES = [
  "/report", "/admin", "/ops", "/login", "/signup", "/claim",
  "/forgot-password", "/reset-password", "/onboarding", "/welcome",
  "/fit", "/fr", "/sz", "/h/", "/s/", "/sr", "/settle", "/w/", "/cast",
  "/visa", "/program", "/api",
];

const HIDE_KEY = (id: string) => `deetz-popup-hide-${id}`;
const SESSION_KEY = (id: string) => `deetz-popup-closed-${id}`;

export function SitePopup() {
  const pathname = usePathname();
  const [popup, setPopup] = useState<Popup | null>(null);
  const [visible, setVisible] = useState(false);

  const excluded = EXCLUDED_PREFIXES.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    if (excluded) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = getBrowserClient();
        const { data } = await supabase
          .from("site_popups")
          .select("id, title, body, cta_label, cta_href")
          .eq("is_active", true)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled || !data) return;
        const p = data as Popup;
        if (localStorage.getItem(HIDE_KEY(p.id))) return;
        if (sessionStorage.getItem(SESSION_KEY(p.id))) return;
        setPopup(p);
        setVisible(true);
      } catch {
        /* 팝업 실패는 조용히 무시 (비치명적) */
      }
    })();
    return () => {
      cancelled = true;
    };
    // 최초 마운트 시 1회만 판단 (경로 이동마다 재등장 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible || !popup || excluded) return null;

  const close = () => {
    try {
      sessionStorage.setItem(SESSION_KEY(popup.id), "1");
    } catch {
      /* noop */
    }
    setVisible(false);
  };
  const hideForever = () => {
    try {
      localStorage.setItem(HIDE_KEY(popup.id), "1");
    } catch {
      /* noop */
    }
    setVisible(false);
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={popup.title}
      onClick={close}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-lg font-bold leading-snug text-[#171611] [word-break:keep-all]">
          {popup.title}
        </p>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[#4f4a40] [word-break:keep-all]">
          {popup.body}
        </p>

        {popup.cta_href && popup.cta_label ? (
          <Link
            href={popup.cta_href}
            onClick={close}
            className="mt-5 block rounded-xl bg-[#171611] py-3 text-center text-sm font-semibold text-white hover:bg-[#171611]/90"
          >
            {popup.cta_label} →
          </Link>
        ) : null}

        <div className="mt-3 flex items-center justify-between text-xs text-[#81796a]">
          <button type="button" onClick={hideForever} className="py-2 underline-offset-2 hover:underline">
            다시 보지 않음
          </button>
          <button type="button" onClick={close} className="py-2 font-medium text-[#4f4a40] hover:text-[#171611]">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
