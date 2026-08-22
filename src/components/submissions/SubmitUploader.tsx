"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { translator } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locale";

type Phase = "idle" | "preparing" | "uploading" | "finishing" | "done" | "error";

export function SubmitUploader({
  token,
  instagramHandle,
  alreadyUploadedName,
  locale,
}: {
  token: string;
  instagramHandle: string;
  alreadyUploadedName: string | null;
  locale: Locale;
}) {
  // upload 콜백이 매 렌더 새로 만들어지지 않게 고정한다.
  const t = useMemo(() => translator(locale), [locale]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(alreadyUploadedName);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = phase === "preparing" || phase === "uploading" || phase === "finishing";

  const upload = useCallback(
    async (file: File) => {
      setMessage(null);
      setPercent(0);
      setPhase("preparing");

      try {
        const startRes = await fetch(`/api/submit/${token}/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentType: file.type || "video/mp4",
            sizeBytes: file.size,
          }),
        });
        const start = await startRes.json();
        if (!startRes.ok || !start.ok) {
          // API 도 공고 언어로 답한다. 그쪽 문구가 오면 그대로 쓴다.
          throw new Error(start.error ?? t("submit.upload.start_failed"));
        }

        // 파일은 우리 서버를 거치지 않고 구글로 바로 올라간다.
        // XHR 을 쓰는 이유는 진행률(upload.onprogress)이 필요해서다.
        setPhase("uploading");
        const fileId: string = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", start.uploadUrl, true);
          xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setPercent(Math.round((e.loaded / e.total) * 100));
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const j = JSON.parse(xhr.responseText);
                if (j?.id) return resolve(j.id as string);
                reject(new Error(t("submit.upload.bad_response")));
              } catch {
                reject(new Error(t("submit.upload.bad_response")));
              }
            } else {
              reject(new Error(t("submit.upload.failed_status", { status: xhr.status })));
            }
          };
          xhr.onerror = () => reject(new Error(t("submit.upload.network")));
          xhr.onabort = () => reject(new Error(t("submit.upload.aborted")));
          xhr.send(file);
        });

        setPhase("finishing");
        const doneRes = await fetch(`/api/submit/${token}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId }),
        });
        const done = await doneRes.json();
        if (!doneRes.ok || !done.ok) {
          throw new Error(done.error ?? t("submit.upload.complete_failed"));
        }

        setSavedName(done.fileName ?? null);
        setPhase("done");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : t("submit.upload.failed"));
        setPhase("error");
      }
    },
    [token, t],
  );

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />

      {savedName && phase !== "uploading" && phase !== "preparing" ? (
        <div className="text-sm leading-relaxed">
          <p className="font-semibold">{t("submit.upload.received")}</p>
          <p className="text-muted-foreground">{savedName}</p>
        </div>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-xl bg-foreground px-4 py-4 text-sm font-bold text-background disabled:opacity-60"
      >
        {phase === "preparing"
          ? t("submit.upload.preparing")
          : phase === "uploading"
            ? t("submit.upload.uploading", { percent })
            : phase === "finishing"
              ? t("submit.upload.finishing")
              : savedName
                ? t("submit.upload.reupload")
                : t("submit.upload.choose")}
      </button>

      {phase === "uploading" ? (
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-foreground transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}

      {message ? (
        <p className="text-sm font-medium text-red-600 dark:text-red-400">{message}</p>
      ) : null}

      <div className="text-xs leading-relaxed text-muted-foreground">
        <p>{t("submit.upload.note_filename", { handle: instagramHandle })}</p>
        <p>{t("submit.upload.note_no_rename")}</p>
        <p className="mt-2">{t("submit.upload.note_keep_open")}</p>
        <p>{t("submit.upload.note_last_wins")}</p>
      </div>
    </div>
  );
}
