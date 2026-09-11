"use client";

import { useState } from "react";
import {
  VisaJourneyTimeline,
  type JourneyData,
  type VisaJourneyLang,
} from "@/components/visa/VisaJourneyTimeline";
import { cn } from "@/lib/utils";

export function VisaMemberDashboard({
  data,
  caseToken,
  defaultLang,
  nextActionNote,
}: {
  data: JourneyData;
  caseToken: string;
  defaultLang: VisaJourneyLang;
  nextActionNote: string | null;
}) {
  // 초기 언어는 서버가 정한 값(케이스 저장 언어 → 요청 언어)뿐이다. 마운트 후 브라우저 신호로
  // 다시 정하지 않는다(docs/design-i18n-ui.md §3.4).
  const [lang, setLang] = useState<VisaJourneyLang>(defaultLang);

  return (
    // 본문 언어를 DOM 에도 표시한다 — <html lang> 은 UI 언어라 이 영역과 다를 수 있다(§3.10).
    <div lang={lang}>
      <div className="mt-4 flex justify-end gap-1" aria-label="Language">
        {(["en", "ja", "ko"] as VisaJourneyLang[]).map((value) => (
          <button
            key={value}
            type="button"
            lang={value}
            onClick={() => setLang(value)}
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-xs",
              value === lang
                ? "border-foreground text-foreground"
                : "border-hairline-2 text-ink-3",
            )}
          >
            {value === "ja" ? "日本語" : value === "ko" ? "한국어" : "EN"}
          </button>
        ))}
      </div>
      <VisaJourneyTimeline
        data={data}
        lang={lang}
        nextActionNote={nextActionNote}
        caseToken={caseToken}
      />
    </div>
  );
}
