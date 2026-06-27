"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchableOption = {
  value: string;
  /** 화면에 보이는 라벨 */
  label: string;
  /** 검색 매칭용 추가 키워드 (예: 영문명/코드) */
  keywords?: string;
  /** 그룹 헤더 라벨 (옵션) */
  group?: string;
};

type Props = {
  options: SearchableOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  /** 선택 해제 허용 */
  clearable?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
};

/**
 * 검색 가능한 드롭다운 셀렉터.
 * - 트리거 클릭 → 패널 열림 → 검색어로 필터 → 항목 클릭 선택.
 * - 외부 클릭/Escape 로 닫힘, 방향키+Enter 키보드 탐색.
 * - 그룹 헤더(option.group) 지원.
 * 외부 라이브러리 없이 자체 구현(레포에 combobox 프리미티브 없음).
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "선택",
  searchPlaceholder = "검색...",
  clearable = false,
  disabled = false,
  ariaLabel,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const hay = `${o.label} ${o.keywords ?? ""} ${o.value}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, query]);

  // 외부 클릭 닫기
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // 열릴 때 검색창 포커스 (상태 초기화는 toggle에서 처리해 effect 내 setState 회피)
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  };

  const commit = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[activeIndex];
      if (opt) commit(opt.value);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-hairline-2 bg-surface-2 px-4 text-left text-sm",
          "focus:border-primary focus:outline-none disabled:opacity-50",
          selected ? "text-foreground" : "text-ink-4",
        )}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <span className="flex shrink-0 items-center gap-1">
          {clearable && selected ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="선택 해제"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="rounded p-0.5 text-ink-3 hover:text-foreground"
            >
              <X className="size-4" />
            </span>
          ) : null}
          <ChevronsUpDown className="size-4 text-ink-3" />
        </span>
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-hairline-2 bg-popover shadow-lg">
          <div className="flex items-center gap-2 border-b border-hairline-2 px-3">
            <Search className="size-4 shrink-0 text-ink-3" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="h-10 w-full bg-transparent text-sm text-foreground placeholder:text-ink-4 focus:outline-none"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-ink-3">검색 결과가 없습니다.</li>
            ) : (
              filtered.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isActive = idx === activeIndex;
                const prev = filtered[idx - 1];
                const showGroup = opt.group && opt.group !== prev?.group;
                return (
                  <li key={opt.value}>
                    {showGroup ? (
                      <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                        {opt.group}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => commit(opt.value)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm",
                        isActive ? "bg-secondary" : "",
                        isSelected ? "font-medium text-primary" : "text-foreground",
                      )}
                    >
                      <span className="truncate">{opt.label}</span>
                      {isSelected ? <Check className="size-4 shrink-0 text-primary" /> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
