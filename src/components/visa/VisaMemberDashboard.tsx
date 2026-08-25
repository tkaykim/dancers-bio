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
  const [lang, setLang] = useState<VisaJourneyLang>(defaultLang);

  return (
    <>
      <div className="mt-4 flex justify-end gap-1" aria-label="Language">
        {(["en", "ja", "ko"] as VisaJourneyLang[]).map((value) => (
          <button
            key={value}
            type="button"
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
    </>
  );
}
