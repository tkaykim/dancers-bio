"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { COMMON_BANKS, searchBanks, type Bank } from "@/lib/banks";

// 은행 선택(검색 + 드롭다운). 자유입력 대신 표준 목록에서 고르게 해 오타·표기흔들림 방지.
export function BankPicker({
  value,
  onChange,
  disabled,
}: {
  value: Bank | null;
  onChange: (bank: Bank) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchBanks(query), [query]);

  function pick(bank: Bank) {
    onChange(bank);
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="flex w-full items-center justify-between rounded-xl border border-border bg-background px-3 py-2 text-left text-sm outline-none focus:border-primary disabled:opacity-50"
      >
        <span className={value ? "text-foreground" : "text-ink-3"}>
          {value ? value.name : "은행 선택"}
        </span>
        <ChevronDown size={16} className="shrink-0 text-ink-3" aria-hidden />
      </button>

      <BottomSheet open={open} onOpenChange={setOpen} title="은행 선택">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
            <Search size={16} className="shrink-0 text-ink-3" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="은행명 검색 (예: 카카오, 농협, kb)"
              className="w-full bg-transparent text-sm outline-none placeholder:text-ink-3"
            />
          </div>

          {query.trim() === "" ? (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-medium text-ink-3">
                자주 쓰는 은행
              </span>
              <div className="grid grid-cols-3 gap-2">
                {COMMON_BANKS.map((b) => (
                  <button
                    key={b.code}
                    type="button"
                    onClick={() => pick(b)}
                    className={`rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors ${
                      value?.code === b.code
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-ink-2 active:bg-secondary"
                    }`}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
              <span className="mt-1 text-[11px] font-medium text-ink-3">
                전체 은행
              </span>
            </div>
          ) : null}

          <ul className="flex flex-col">
            {results.length === 0 ? (
              <li className="py-6 text-center text-sm text-ink-3">
                검색 결과가 없어요.
              </li>
            ) : (
              results.map((b) => {
                const active = value?.code === b.code;
                return (
                  <li key={b.code}>
                    <button
                      type="button"
                      onClick={() => pick(b)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left active:bg-secondary"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {b.name}
                        </span>
                        {b.hint ? (
                          <span className="text-[11px] text-ink-3">{b.hint}</span>
                        ) : null}
                      </span>
                      {active ? (
                        <Check size={16} className="shrink-0 text-primary" aria-hidden />
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </BottomSheet>
    </>
  );
}
