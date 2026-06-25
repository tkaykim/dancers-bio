"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestEventAccessAction } from "@/app/actions/event-access-requests";

export function RequestAccessView({
  opsCode,
  eventName,
  initialStatus,
}: {
  opsCode: string;
  eventName: string;
  initialStatus: "none" | "pending" | "denied";
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"none" | "pending" | "denied">(
    initialStatus,
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("ops_code", opsCode);
    fd.set("message", message);
    requestEventAccessAction(fd).then((r) => {
      setBusy(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.data?.status === "approved") {
        router.refresh();
        return;
      }
      setStatus("pending");
    });
  }

  return (
    <main className="min-h-svh bg-[#f7f7f4] px-4 py-10 text-[#17140f]">
      <div className="mx-auto w-full max-w-[440px]">
        <div className="flex items-start justify-between gap-3 border-b border-black/10 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
              {eventName}
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight">
              접근 권한이 필요합니다
            </h1>
          </div>
          <div className="shrink-0 text-2xl font-black leading-none">dee&apos;tz</div>
        </div>

        <p className="mt-5 text-sm font-semibold leading-relaxed text-black/60">
          이 운영보드는 담당자만 접근할 수 있습니다.
          <br />
          접근이 필요하면 아래에서 권한을 신청하세요. 프로젝트 담당자가 확인 후
          승인하면 이 페이지에서 바로 접속됩니다.
        </p>

        {status === "pending" ? (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold leading-relaxed text-amber-900">
            ✓ 권한 신청이 접수되었습니다.
            <br />
            담당자가 승인하면 알림을 받고, 이 링크로 다시 들어오면 접속됩니다.
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {status === "denied" ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                이전 신청이 거절되었습니다. 필요하면 메모를 남겨 다시 신청할 수 있습니다.
              </div>
            ) : null}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="담당자에게 전할 메모 (선택) — 본인이 누구인지·소속 등을 적으면 승인이 빨라집니다."
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black/40"
            />
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="h-12 rounded-lg bg-black text-base font-extrabold text-white transition-colors hover:bg-black/80 disabled:bg-black/25"
            >
              {busy ? "신청 중..." : "권한 신청하기"}
            </button>
            {error ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {error}
              </p>
            ) : null}
          </div>
        )}

        <p className="mt-6 text-xs font-semibold leading-relaxed text-black/40">
          현재 로그인한 본인 deetz 계정으로 신청됩니다. 다른 계정으로 신청하려면
          로그아웃 후 다시 시도하세요.
        </p>
      </div>
    </main>
  );
}
