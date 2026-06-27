"use client";

import { useEffect, useRef, type TextareaHTMLAttributes } from "react";

// 내용 높이에 맞춰 자동으로 늘어나는 textarea (잘림·내부 스크롤 방지).
export function AutoTextarea({
  value,
  className,
  minRows = 2,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value: string;
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      className={`resize-none overflow-hidden ${className ?? ""}`}
      {...rest}
    />
  );
}
