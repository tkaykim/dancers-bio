"use client";

import { useState, type ReactNode } from "react";

export function ProjectRegistrationModes({
  manual,
  automatic,
  initialMode = "manual",
}: {
  manual: ReactNode;
  automatic?: ReactNode;
  initialMode?: "manual" | "auto";
}) {
  const [mode, setMode] = useState(initialMode);
  const [autoOpened, setAutoOpened] = useState(initialMode === "auto");
  if (!automatic) return <>{manual}</>;
  return (
    <div className="space-y-5">
      <div
        role="group"
        aria-label="공고 입력 방식"
        className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1"
      >
        {(
          [
            ["manual", "직접 입력"],
            ["auto", "텍스트·캡처로 자동 입력"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            aria-controls={`registration-${value}`}
            onClick={() => {
              setMode(value);
              if (value === "auto") setAutoOpened(true);
            }}
            className={`min-h-11 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 ${mode === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-sm text-ink-2">
        {mode === "manual"
          ? "아래 양식에 직접 입력한 뒤 발행하거나 임시저장하세요."
          : "원문을 붙여넣거나 캡처를 첨부하세요. 정리가 끝나면 같은 등록 양식에서 수정하고 발행할 수 있습니다."}
      </p>
      {/* Keep both panels mounted after opening so switching does not discard edits or uploads. */}
      <section
        id="registration-manual"
        aria-label="직접 입력 양식"
        hidden={mode !== "manual"}
      >
        {manual}
      </section>
      <section
        id="registration-auto"
        aria-label="자동 입력 접수"
        hidden={mode !== "auto"}
      >
        {autoOpened ? automatic : null}
      </section>
    </div>
  );
}
