"use client";

import { useState } from "react";
import { suggestEmailCorrection } from "@/lib/utils/email-typo";

/**
 * 이메일 도메인 오타를 제안하는 공용 조각.
 *
 * 왜 컴포넌트로 뽑았나
 *   이메일을 받는 폼이 12곳이다(가입·로그인·비밀번호 찾기·간편 접수·워크샵 예약 등).
 *   같은 로직을 매번 붙여넣으면 한 곳만 고쳐지고 나머지는 뒤처진다.
 *
 * 쓰는 법
 *   const [email, setEmail] = useState("");
 *   <input value={email} onChange={(e) => setEmail(e.target.value)} onBlur={...} />
 *   <EmailTypoHint email={email} onFix={setEmail} />
 *
 *   제어형 입력이 아니면 inputName 을 주면 된다. 같은 form 안의
 *   input[name=...] 을 직접 찾아 값을 바꾼다.
 *
 * 막지 않고 제안만 한다. 실존 도메인을 오타로 오판해 진행을 막으면
 * 가입·지원 자체를 잃고, 그 손해가 반송보다 크다.
 */
export function EmailTypoHint({
  email,
  onFix,
  inputName,
  label = "혹시",
  suffix = " 아닌가요?",
  actionLabel = "이걸로 고치기",
  className,
}: {
  /** 현재 입력값. 비어 있거나 오타가 아니면 아무것도 렌더하지 않는다. */
  email: string;
  /** 제어형 입력이면 여기로 고친 값을 돌려준다. */
  onFix?: (fixed: string) => void;
  /** 비제어형 입력이면 같은 form 안의 input[name] 을 직접 고친다. */
  inputName?: string;
  /** 제안값 앞에 붙는 말. 뒤에 붙는 말은 suffix 로 준다(언어마다 어순이 다르다). */
  label?: string;
  suffix?: string;
  actionLabel?: string;
  className?: string;
}) {
  // 한 번 무시한 제안은 다시 띄우지 않는다. 계속 뜨면 그게 더 방해가 된다.
  const [dismissed, setDismissed] = useState<string | null>(null);

  const suggestion = suggestEmailCorrection(email);
  if (!suggestion || suggestion === dismissed) return null;

  return (
    <div
      className={
        className ??
        "mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-300"
      }
    >
      <span>
        {label} <b>{suggestion}</b>
        {suffix}
      </span>
      <button
        type="button"
        className="font-bold underline underline-offset-2"
        onClick={(e) => {
          if (onFix) {
            onFix(suggestion);
          } else if (inputName) {
            const form = e.currentTarget.closest("form");
            const input = form?.querySelector<HTMLInputElement>(`input[name="${inputName}"]`);
            if (input) {
              input.value = suggestion;
              input.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }
          setDismissed(suggestion);
        }}
      >
        {actionLabel}
      </button>
    </div>
  );
}
