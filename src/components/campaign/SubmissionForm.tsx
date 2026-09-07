"use client";
import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { mutateSubmissionAction } from "@/app/actions/campaign-submissions";
import type { Submission } from "@/lib/campaign/submissions";
import { buttonClass, inputClass } from "@/components/admin/campaign/Controls";
const FeedbackContext = createContext<((message: string) => void) | null>(null);
// Keep completion feedback outside refreshed, version-keyed forms and collapsed details.
export function SubmissionFeedback({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  return <FeedbackContext.Provider value={setMessage}>
    {message && <p role="status" aria-live="polite" className="whitespace-pre-line rounded-xl border border-border bg-secondary p-4 text-sm">{message}</p>}
    {children}
  </FeedbackContext.Provider>;
}
export function SubmissionForm({
  projectId,
  participantId,
  submission,
  initialUrl = "",
  onSaved,
}: {
  projectId: string;
  participantId: string;
  submission?: Submission;
  initialUrl?: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const reportFeedback = useContext(FeedbackContext);
  const [url, setUrl] = useState(initialUrl),
    [message, setMessage] = useState(""),
    [pending, start] = useTransition();
  const [confirmed, setConfirmed] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage("");
        reportFeedback?.("");
        start(async () => {
          try {
            const r = await mutateSubmissionAction(projectId, "submit", {
              participant_id: participantId,
              url,
              ...(submission
                ? { replace_id: submission.id, version: submission.version }
                : {}),
            });
            if (!r.ok) {
              setMessage(r.error);
              return;
            }
            const success = r.data.duplicate
                ? "이미 제출된 링크입니다."
                : "링크가 제출되었습니다.\n운영자가 확인하면 상태가 변경됩니다.";
            if (reportFeedback) reportFeedback(success);
            else setMessage(success);
            router.refresh();
            onSaved?.();
          } catch {
            setMessage(
              "연결이 끊겼습니다. 새로고침해 접수 여부를 확인해 주세요.",
            );
          }
        });
      }}
    >
      <label className="block text-sm font-medium">
        Instagram 게시물 링크
        <input
          required
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          className={`${inputClass} mt-2 w-full`}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.instagram.com/reel/…"
        />
      </label>
      {submission?.status === "approved" && (
        <label className="flex items-start gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1"
          />
          변경하면 확인 완료가 해제되고, 새 검토가 끝날 때까지 클라이언트 진행
          보드에서 기존 링크가 숨겨집니다.
        </label>
      )}
      <button
        disabled={pending || (submission?.status === "approved" && !confirmed)}
        className={`${buttonClass} min-h-11 w-full disabled:opacity-40`}
      >
        {pending ? "저장 중…" : submission ? "수정·재검토 요청" : "링크 제출"}
      </button>
      <p
        role="status"
        aria-live="polite"
        className="whitespace-pre-line text-sm text-ink-2"
      >
        {message}
      </p>
    </form>
  );
}
