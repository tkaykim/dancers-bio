"use client";

import { useEffect, useRef } from "react";

// 적응형 폴링 훅.
//  · setInterval 이 아니라 "응답 완료 후 다음 setTimeout 예약" — 요청 겹침 방지.
//  · 백그라운드 탭은 완전 정지, 복귀(visibilitychange)하면 즉시 1회 실행 후 재개.
//  · 오류 시 지수 백오프 + 지터, 성공하면 기본 간격 복귀.
export function usePolling(
  fn: () => Promise<void>,
  intervalMs: number,
  enabled = true,
) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let failures = 0;

    const schedule = (ms: number) => {
      if (stopped) return;
      timer = setTimeout(run, ms);
    };

    const run = async () => {
      if (stopped) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        // 숨김 탭 — 타이머를 걸지 않는다(visibilitychange 가 재개 신호).
        return;
      }
      try {
        await fnRef.current();
        failures = 0;
        schedule(intervalMs);
      } catch {
        failures += 1;
        const backoff = Math.min(intervalMs * Math.pow(2, failures), 120_000);
        schedule(backoff + Math.random() * 1_000);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        void run();
      }
    };

    void run();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, enabled]);
}

/** 전송 멱등키 — 한 번의 전송 시도(재시도 포함)에 하나. */
export function newClientMessageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `cm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 목록 시각 — 최근은 상대, 오래되면 날짜(하이브리드 관례). */
export function formatListTime(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "어제";
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const ampm = h < 12 ? "오전" : "오후";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${hh}:${String(d.getMinutes()).padStart(2, "0")}`;
}
