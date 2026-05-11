"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

type Props = {
  href: string;
};

/**
 * 프로필 편집 페이지에서 경력 관리로 이동하는 링크.
 * DancerProfileForm 이 발행하는 `dancer-profile-form-dirty` 이벤트를 들으며,
 * 미저장 상태에서 클릭하면 확인 모달을 띄운다.
 */
export function CareersNavLink({ href }: Props) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ dirty: boolean }>).detail;
      setDirty(Boolean(detail?.dirty));
    };
    window.addEventListener("dancer-profile-form-dirty", handler);
    return () => window.removeEventListener("dancer-profile-form-dirty", handler);
  }, []);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (dirty) {
      e.preventDefault();
      setConfirming(true);
    }
  }

  function discardAndGo() {
    setConfirming(false);
    router.push(href);
  }

  return (
    <>
      <Link
        href={href}
        onClick={handleClick}
        className="group flex flex-col gap-1.5 rounded-xl border border-border bg-card p-5 transition-colors hover:bg-secondary"
      >
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            ↳ 경력 관리
          </p>
          <span className="text-ink-3 transition-transform group-hover:translate-x-1">
            →
          </span>
        </div>
        <p className="text-lg font-bold leading-tight">안무·출연·수상·공연.</p>
        <p className="text-sm text-ink-2">
          카테고리별로 경력을 추가하고 영상 링크를 첨부합니다.
        </p>
        {dirty ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-warn">
            <AlertTriangle size={12} />
            프로필에 미저장 변경사항이 있어요. 먼저 저장하세요.
          </p>
        ) : null}
      </Link>

      {confirming ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-end justify-center bg-foreground/40 p-4 sm:items-center"
          onClick={() => setConfirming(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-background p-5 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warn/10 text-warn">
                <AlertTriangle size={18} />
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-bold">저장하지 않고 이동할까요?</h3>
                <p className="text-sm text-ink-2">
                  프로필에 변경사항이 있어요. 이동하면 변경사항이 사라집니다.
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-lg border border-hairline-2 bg-background py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                돌아가서 저장하기
              </button>
              <button
                type="button"
                onClick={discardAndGo}
                className="flex-1 rounded-lg bg-destructive/10 py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/20"
              >
                변경사항 버리기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
