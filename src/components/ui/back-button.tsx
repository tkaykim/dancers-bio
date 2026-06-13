"use client";

import { useRouter } from "next/navigation";

// 브라우저 히스토리 기반 뒤로가기. 직전 페이지로 돌아간다(예: 지원자 목록).
// 히스토리가 없으면(새 탭/직접 진입) fallback 경로로 이동.
export function BackButton({
  fallback = "/dancers",
  className,
  ariaLabel = "뒤로",
  children,
}: {
  fallback?: string;
  className?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label={ariaLabel}
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
