"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";

import { cn } from "@/lib/utils";

type PriorityOption = {
  value: string;
  label: string;
};

type PriorityMultiSelectProps = {
  options: PriorityOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  variant?: "list" | "pills";
};

export function PriorityMultiSelect({
  options,
  selected,
  onChange,
  variant = "list",
}: PriorityMultiSelectProps) {
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((s) => s !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...selected];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };

  const moveDown = (index: number) => {
    if (index === selected.length - 1) return;
    const next = [...selected];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  };

  const remove = (value: string) => {
    onChange(selected.filter((s) => s !== value));
  };

  const labelOf = (value: string) =>
    options.find((o) => o.value === value)?.label ?? value;

  const priorityOf = (value: string) => {
    const idx = selected.indexOf(value);
    return idx >= 0 ? idx + 1 : null;
  };

  return (
    <div className="flex flex-col gap-4">
      {variant === "list" ? (
        <div className="grid grid-cols-1 gap-2.5">
          {options.map(({ value, label }) => {
            const priority = priorityOf(value);
            const isSelected = priority !== null;
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggle(value)}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-4 py-3.5 text-left transition-all",
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-hairline-2 hover:bg-secondary",
                )}
              >
                <span className="text-sm font-medium text-foreground">
                  {label}
                </span>
                {isSelected ? (
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {priority}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map(({ value, label }) => {
            const priority = priorityOf(value);
            const isSelected = priority !== null;
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggle(value)}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-all",
                  isSelected
                    ? "border-primary bg-primary font-semibold text-primary-foreground"
                    : "border-hairline-2 text-foreground hover:bg-secondary",
                )}
              >
                {isSelected ? (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-foreground text-[10px] font-bold text-primary">
                    {priority}
                  </span>
                ) : null}
                {label}
              </button>
            );
          })}
        </div>
      )}

      {selected.length > 0 ? (
        <div className="rounded-xl border border-hairline-2 bg-surface-2 p-4">
          <p className="mb-3 text-xs uppercase tracking-[0.14em] text-ink-3">
            선택 순서 (위일수록 높은 우선순위)
          </p>
          <div className="flex flex-col gap-2">
            {selected.map((value, index) => (
              <div
                key={value}
                className="flex items-center gap-3 rounded-lg bg-surface-3 px-3 py-2"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {index + 1}
                </span>
                <span className="flex-1 truncate text-sm text-foreground">
                  {labelOf(value)}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      moveUp(index);
                    }}
                    disabled={index === 0}
                    aria-label="위로"
                    className="rounded p-1 transition-colors hover:bg-secondary disabled:opacity-30"
                  >
                    <ArrowUp className="size-4 text-ink-2" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      moveDown(index);
                    }}
                    disabled={index === selected.length - 1}
                    aria-label="아래로"
                    className="rounded p-1 transition-colors hover:bg-secondary disabled:opacity-30"
                  >
                    <ArrowDown className="size-4 text-ink-2" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(value);
                    }}
                    aria-label="제거"
                    className="ml-1 rounded p-1 transition-colors hover:bg-destructive/15"
                  >
                    <X className="size-4 text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
