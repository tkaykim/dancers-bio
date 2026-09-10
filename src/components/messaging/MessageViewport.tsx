"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** The visual viewport shrinks when the mobile keyboard opens. */
export function useMessageViewport() {
  const [viewport, setViewport] = useState<{ height: number; bottom: number; mobile: boolean } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => setViewport({
      height: vv?.height ?? window.innerHeight,
      bottom: Math.max(0, window.innerHeight - (vv?.height ?? window.innerHeight) - (vv?.offsetTop ?? 0)),
      mobile: window.innerWidth < 640,
    });
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return viewport;
}

export function MessageViewport({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => {
      const top = Math.max(0, (ref.current?.getBoundingClientRect().top ?? 0) - (vv?.offsetTop ?? 0));
      setHeight(Math.max(160, (vv?.height ?? window.innerHeight) - top));
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return <div ref={ref} style={{ height }} className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden">{children}</div>;
}
