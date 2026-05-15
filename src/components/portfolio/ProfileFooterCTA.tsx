"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { claimDancerProfileAction } from "@/app/actions/claim";

type Mode =
  | { kind: "guest" }
  | { kind: "logged"; canClaim: boolean; alreadyRequested: boolean };

export function ProfileFooterCTA({
  dancerId,
  dancerName,
  isCuration,
  isOwner,
  mode,
}: {
  dancerId: string;
  dancerName: string;
  isCuration: boolean;
  isOwner: boolean;
  mode: Mode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [relation, setRelation] = useState<"self" | "manager" | "other">(
    "self",
  );
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    { ok: true } | { ok: false; error: string } | null
  >(null);

  if (isOwner) return null;

  function onSubmit() {
    setResult(null);
    const fd = new FormData();
    fd.set("dancer_id", dancerId);
    fd.set("relation", relation);
    fd.set("message", message);
    startTransition(async () => {
      const r = await claimDancerProfileAction(fd);
      if (r.ok && r.data?.claim_request_id) {
        // Lite: claim 생성 후 즉시 IG 본인 인증으로 이동.
        router.push(`/verify-instagram?claim=${r.data.claim_request_id}`);
        return;
      }
      setResult(r);
    });
  }

  return (
    <section className="mt-6 flex flex-col gap-3 px-6 pb-24">
      {/* Guest CTA */}
      {mode.kind === "guest" ? (
        <>
          <Link
            href="/signup"
            className="block rounded-2xl border border-primary/30 bg-primary/5 px-5 py-4 text-center"
          >
            <p className="text-sm font-semibold text-foreground">
              나도 프로필 만들어보기
            </p>
            <p className="mt-1 text-xs text-ink-3">
              30초만에 댄서 포트폴리오를 만들 수 있어요
            </p>
          </Link>
          {isCuration ? (
            <Link
              href={`/signup?claim=${dancerId}`}
              className="block rounded-2xl border border-hairline-2 bg-card px-5 py-4 text-center"
            >
              <p className="text-sm font-semibold text-foreground">
                이 프로필 권한 신청하기
              </p>
              <p className="mt-1 text-xs text-ink-3">
                본인 또는 매니저라면 회원가입 후 신청할 수 있어요
              </p>
            </Link>
          ) : null}
        </>
      ) : null}

      {/* Logged-in: claim or generic CTA */}
      {mode.kind === "logged" && isCuration ? (
        mode.alreadyRequested ? (
          <div className="rounded-2xl border border-hairline-2 bg-card px-5 py-4 text-center">
            <p className="text-sm font-medium text-ink-2">
              이미 권한 신청이 접수되었습니다.
            </p>
            <p className="mt-1 text-xs text-ink-3">
              관리자 검토 결과를 알려드릴게요.
            </p>
          </div>
        ) : !open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={!mode.canClaim}
            className="rounded-2xl border border-primary/30 bg-primary/10 px-5 py-4 text-center disabled:opacity-50"
          >
            <p className="text-sm font-semibold text-foreground">
              이 프로필 권한 신청하기
            </p>
            <p className="mt-1 text-xs text-ink-3">
              본인 또는 매니저라면 신청해 주세요
            </p>
          </button>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm font-semibold">
              {dancerName} 프로필 권한 신청
            </p>
            <p className="mt-1 text-xs text-ink-3">
              관계와 간단한 메시지를 입력해 주세요.
            </p>
            <fieldset className="mt-4 flex flex-col gap-2">
              <legend className="text-xs font-medium text-ink-2">관계</legend>
              <div className="flex gap-2">
                {(
                  [
                    { v: "self", l: "본인" },
                    { v: "manager", l: "매니저" },
                    { v: "other", l: "기타" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setRelation(opt.v)}
                    className={
                      "flex-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                      (relation === opt.v
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-hairline-2 text-ink-3")
                    }
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="mt-3 block text-xs font-medium text-ink-2">
              메시지 (선택)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="본인/매니저 증빙을 위한 추가 정보를 적어 주세요. (예: 인스타그램 핸들, 소속사 등)"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {result && !result.ok ? (
              <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {result.error}
              </p>
            ) : null}
            {result?.ok ? (
              <p className="mt-2 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                신청이 접수되었습니다. 관리자 검토를 기다려 주세요.
              </p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="flex-1 rounded-full border border-hairline-2 px-4 py-2 text-xs font-medium"
              >
                {result?.ok ? "닫기" : "취소"}
              </button>
              {!result?.ok ? (
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={pending}
                  className="flex-1 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {pending ? "전송 중…" : "신청 보내기"}
                </button>
              ) : null}
            </div>
          </div>
        )
      ) : null}

      {/* Generic 'create your own' CTA for any logged-in non-owner */}
      {mode.kind === "logged" && !isCuration ? (
        <Link
          href="/onboarding/create"
          className="block rounded-2xl border border-primary/30 bg-primary/5 px-5 py-4 text-center"
        >
          <p className="text-sm font-semibold text-foreground">
            나도 프로필 만들어보기
          </p>
          <p className="mt-1 text-xs text-ink-3">
            지금 바로 댄서 포트폴리오를 만들 수 있어요
          </p>
        </Link>
      ) : null}
    </section>
  );
}
