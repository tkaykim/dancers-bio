"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { claimDancerProfileAction } from "@/app/actions/claim";

function CreateProfileCard({
  href,
  dancerCount,
}: {
  href: string;
  dancerCount?: number | null;
}) {
  const avatars = [
    { label: "정", cls: "bg-primary/10 text-foreground" },
    { label: "하", cls: "bg-pink-100 text-pink-700" },
    { label: "민", cls: "bg-emerald-100 text-emerald-700" },
  ];
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-hairline-2 bg-card p-5 transition-colors hover:border-primary/30"
    >
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex -space-x-2">
          {avatars.map((a) => (
            <span
              key={a.label}
              className={
                "flex size-6 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-card " +
                a.cls
              }
            >
              {a.label}
            </span>
          ))}
        </div>
        <p className="text-xs text-ink-3">
          {dancerCount && dancerCount > 0
            ? `${dancerCount.toLocaleString("ko-KR")}명의 댄서들이 deetz에서 활동 중`
            : "댄서들이 deetz에서 활동 중"}
        </p>
      </div>
      <p className="text-[15px] font-semibold text-foreground">
        나만의 댄서 포트폴리오 만들기
      </p>
      <p className="mt-0.5 text-xs text-ink-3">
        경력·영상·SNS를 한 페이지에. 30초면 충분해요.
      </p>
      <span className="mt-4 flex h-11 items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
        무료로 시작하기
        <ArrowRight className="size-4" aria-hidden />
      </span>
    </Link>
  );
}

type Mode =
  | { kind: "guest" }
  | { kind: "logged"; canClaim: boolean; alreadyRequested: boolean; claimRequestId?: string | null };

export function ProfileFooterCTA({
  dancerId,
  dancerName,
  dancerCount,
  isCuration,
  isOwner,
  mode,
}: {
  dancerId: string;
  dancerName: string;
  dancerCount?: number | null;
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
          <CreateProfileCard href="/signup" dancerCount={dancerCount} />
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
          <div className="flex flex-col gap-2">
            <div className="rounded-2xl border border-hairline-2 bg-card px-5 py-4 text-center">
              <p className="text-sm font-medium text-ink-2">
                이미 권한 신청이 접수되었습니다.
              </p>
              <p className="mt-1 text-xs text-ink-3">
                인증을 아직 완료하지 않았다면 아래에서 코드를 다시 확인하세요.
              </p>
              {mode.claimRequestId ? (
                <Link
                  href={`/verify-instagram?claim=${mode.claimRequestId}`}
                  className="mt-3 inline-flex h-9 items-center justify-center rounded-full bg-primary px-5 text-xs font-semibold text-primary-foreground"
                >
                  인증 코드 확인하기 →
                </Link>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                onSubmit();
              }}
              disabled={pending}
              className="text-xs text-ink-3 underline underline-offset-4"
            >
              {pending ? "처리 중..." : "다시 신청하기"}
            </button>
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
        <CreateProfileCard href="/onboarding/create" dancerCount={dancerCount} />
      ) : null}
    </section>
  );
}
