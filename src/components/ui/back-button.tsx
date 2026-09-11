"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import ui from "@/lib/i18n/messages/ui";

// 브라우저 히스토리 기반 뒤로가기. 직전 페이지로 돌아간다(예: 지원자 목록).
// 히스토리가 없으면(새 탭/직접 진입) fallback 경로로 이동.
export function BackButton({
  fallback = "/dancers",
  className,
  ariaLabel,
  children,
}: {
  fallback?: string;
  className?: string;
  /** 안 넘기면 사전의 기본 라벨을 쓴다(기본값 자리에서는 훅을 부를 수 없다). */
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const t = useT(ui);
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? t("back.aria")}
      className={className}
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallback);
        }
      }}
    >
      {children}
    </button>
  );
}
