"use client";

import { useCallback, useRef, useState } from "react";

type Phase = "idle" | "preparing" | "uploading" | "finishing" | "done" | "error";

export function SubmitUploader({
  token,
  instagramHandle,
  alreadyUploadedName,
}: {
  token: string;
  instagramHandle: string;
  alreadyUploadedName: string | null;
}) {
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
          throw new Error(start.error ?? "업로드를 시작하지 못했습니다.");
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
                reject(new Error("업로드 응답을 확인하지 못했습니다."));
              } catch {
                reject(new Error("업로드 응답을 확인하지 못했습니다."));
              }
            } else {
              reject(new Error(`업로드에 실패했습니다. (${xhr.status})`));
            }
          };
          xhr.onerror = () => reject(new Error("네트워크 오류로 업로드가 중단되었습니다."));
          xhr.onabort = () => reject(new Error("업로드가 취소되었습니다."));
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
          throw new Error(done.error ?? "제출을 마무리하지 못했습니다.");
        }

        setSavedName(done.fileName ?? null);
        setPhase("done");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "업로드에 실패했습니다.");
        setPhase("error");
      }
    },
    [token],
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
          <p className="font-semibold">제출이 접수되었습니다.</p>
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
          ? "준비 중..."
          : phase === "uploading"
            ? `업로드 중 ${percent}%`
            : phase === "finishing"
              ? "마무리 중..."
              : savedName
                ? "다시 올리기"
                : "영상 파일 선택"}
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
        <p>파일명은 자동으로 {instagramHandle} 으로 저장됩니다.</p>
        <p>직접 파일 이름을 바꾸실 필요는 없습니다.</p>
        <p className="mt-2">업로드 중에는 창을 닫지 말아 주세요.</p>
        <p>다시 올리시면 마지막에 올린 영상이 최종 제출본이 됩니다.</p>
      </div>
    </div>
  );
}
