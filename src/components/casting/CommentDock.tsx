"use client";

import { useState, useTransition } from "react";
import { MessageSquarePlus, X, Check } from "lucide-react";
import { submitCastingCommentAction } from "@/app/actions/casting-comments";

// 클라이언트가 보드에 코멘트를 남기는 위젯.
// 데스크탑=우측 사이드패널, 모바일=바텀시트. 본인이 방금 남긴 의견만 화면에 표시(전체는 관리자만 확인).
export function CommentDock({ shareCode }: { shareCode: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<string[]>([]);
  const [busy, start] = useTransition();

  function submit() {
    setError(null);
    const text = body.trim();
    if (!text) {
      setError("내용을 입력해 주세요.");
      return;
    }
    const fd = new FormData();
    fd.set("share_code", shareCode);
    fd.set("body", text);
    if (name.trim()) fd.set("author_name", name.trim());
    start(async () => {
      const r = await submitCastingCommentAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMine((m) => [text, ...m]);
      setBody("");
    });
  }

  return (
    <>
      {/* 플로팅 버튼 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-black/20 transition hover:opacity-90"
      >
        <MessageSquarePlus className="size-4" />
        의견 남기기
      </button>

      {open ? (
        <>
          {/* 오버레이 */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />
          {/* 패널: 모바일 바텀시트 / 데스크탑 우측 사이드 */}
          <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:bottom-0 sm:max-h-none sm:w-[420px] sm:rounded-none sm:rounded-l-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <p className="text-sm font-bold">캐스팅 보드에 의견 남기기</p>
                <p className="mt-0.5 text-[11px] text-ink-3">
                  남겨주신 의견은 담당자에게 전달됩니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1.5 text-ink-3 hover:bg-secondary"
                aria-label="닫기"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <label className="mb-1 block text-[11px] font-medium text-ink-2">
                성함 / 회사 (선택)
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예) AST컴퍼니 정현수"
                className="mb-3 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              />
              <label className="mb-1 block text-[11px] font-medium text-ink-2">
                의견 내용
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                placeholder="원하시는 댄서, 추가 요청, 피드백 등을 자유롭게 남겨주세요."
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              {error ? (
                <p className="mt-2 text-[12px] text-red-500">{error}</p>
              ) : null}

              {mine.length > 0 ? (
                <div className="mt-5 border-t border-border pt-4">
                  <p className="mb-2 flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                    <Check className="size-3.5" /> 전달된 의견
                  </p>
                  <ul className="flex flex-col gap-2">
                    {mine.map((m, i) => (
                      <li
                        key={i}
                        className="whitespace-pre-wrap rounded-lg bg-secondary px-3 py-2 text-[13px] text-ink-2"
                      >
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="border-t border-border px-5 py-4">
              <button
                type="button"
                disabled={busy}
                onClick={submit}
                className="h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {busy ? "전달 중…" : "의견 보내기"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
