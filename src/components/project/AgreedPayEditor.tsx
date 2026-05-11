"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAgreedPayAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AgreedPayEditor({
  projectId,
  initialAgreedPay,
}: {
  projectId: string;
  initialAgreedPay: number | null;
}) {
  const router = useRouter();
  const [display, setDisplay] = useState<string>(
    initialAgreedPay !== null ? initialAgreedPay.toLocaleString("ko-KR") : "",
  );
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onPayChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/[^\d]/g, "");
    if (!digits) {
      setDisplay("");
      return;
    }
    setDisplay(Number(digits.slice(0, 10)).toLocaleString("ko-KR"));
  }

  return (
    <form
      action={(formData) => {
        setMessage(null);
        formData.set("project_id", projectId);
        const raw = display.replace(/[^\d]/g, "");
        formData.set("agreed_pay", raw);
        startTransition(async () => {
          const result = await setAgreedPayAction(formData);
          if (!result.ok) {
            setMessage({ kind: "error", text: result.error });
            return;
          }
          setMessage({ kind: "ok", text: "확정 비용이 저장됐습니다." });
          router.refresh();
        });
      }}
      className="flex items-center gap-2 rounded-xl border border-border bg-card p-3"
    >
      <span className="text-sm font-mono">₩</span>
      <Input
        name="agreed_pay_display"
        value={display}
        onChange={onPayChange}
        placeholder="확정 금액 (비우면 미정)"
        inputMode="numeric"
        className="flex-1"
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "저장..." : "저장"}
      </Button>
      {message ? (
        <span
          className={
            "text-xs " +
            (message.kind === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")
          }
        >
          {message.text}
        </span>
      ) : null}
    </form>
  );
}
