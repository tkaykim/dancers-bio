"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitBugReportAction } from "@/app/actions/bug-report";
import { Bug } from "lucide-react";

const SEVERITIES: { value: "low" | "normal" | "high" | "critical"; label: string }[] = [
  { value: "low", label: "낮음" },
  { value: "normal", label: "보통" },
  { value: "high", label: "높음" },
  { value: "critical", label: "치명" },
];

export function BugReportFab() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [severity, setSeverity] = useState<"low" | "normal" | "high" | "critical">("normal");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const reset = () => {
    setTitle("");
    setDescription("");
    setEmail("");
    setSeverity("normal");
    setError(null);
    setSent(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTimeout(reset, 200);
      }}
    >
      <DialogTrigger
        aria-label="버그 신고"
        className="fixed bottom-[88px] right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background shadow-lg ring-1 ring-foreground/10 transition hover:opacity-90 active:scale-95"
      >
        <Bug className="h-5 w-5" strokeWidth={2.25} />
      </DialogTrigger>

      <DialogContent className="max-w-md">
        {sent ? (
          <div className="flex flex-col gap-3 py-4 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary text-xl">
              ✓
            </div>
            <DialogTitle className="text-lg">감사합니다!</DialogTitle>
            <p className="text-sm leading-relaxed text-ink-2">
              버그 리포트가 접수되었습니다.<br />
              빠르게 확인하고 수정하겠습니다.
            </p>
            <Button variant="outline" className="mt-2" onClick={() => setOpen(false)}>
              닫기
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>버그 신고</DialogTitle>
              <p className="text-xs text-ink-3">
                무엇이 잘못되었는지 알려주시면 빠르게 고치겠습니다.
              </p>
            </DialogHeader>

            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                startTransition(async () => {
                  const result = await submitBugReportAction({
                    title,
                    description,
                    severity,
                    reporter_email: email,
                    page_url: typeof window !== "undefined" ? window.location.href : "",
                    user_agent:
                      typeof navigator !== "undefined" ? navigator.userAgent : "",
                  });
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setSent(true);
                });
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bug-title" className="text-xs">제목</Label>
                <Input
                  id="bug-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="예: 프로필 저장 버튼이 동작하지 않습니다"
                  required
                  maxLength={160}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bug-desc" className="text-xs">상세 설명</Label>
                <textarea
                  id="bug-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="언제·어디서·어떻게 발생했는지 알려주세요. 화면 메시지나 재현 단계가 있으면 더 빨라요."
                  required
                  minLength={5}
                  maxLength={4000}
                  rows={5}
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                />
                <p className="text-[11px] text-ink-3">
                  현재 페이지 주소와 브라우저 정보는 자동으로 함께 전송됩니다.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="bug-severity" className="text-xs">긴급도</Label>
                  <select
                    id="bug-severity"
                    value={severity}
                    onChange={(e) =>
                      setSeverity(e.target.value as typeof severity)
                    }
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {SEVERITIES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="bug-email" className="text-xs">회신용 이메일 (선택)</Label>
                  <Input
                    id="bug-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    inputMode="email"
                    autoComplete="email"
                  />
                </div>
              </div>

              {error ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  취소
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "보내는 중..." : "신고 보내기"}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
