"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle, ChevronRight, Crown, Loader2, Search, Shield } from "lucide-react";
import { claimDancerProfileAction } from "@/app/actions/claim";

type DancerResult = {
  id: string;
  stage_name: string;
  korean_name: string | null;
  slug: string | null;
  profile_img: string | null;
  approval_status: string | null;
};

type Props = {
  role: "self" | "manager";
  q: string;
  results: DancerResult[];
};

export function SearchSection({ role, q, results }: Props) {
  const router = useRouter();
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());
  const [claimError, setClaimError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // "본인" + "으로" = "본인으로", "매니저" + "로" = "매니저로" (한글 받침 처리)
  const roleLabel = role === "manager" ? "매니저로 등록" : "본인으로 등록";
  const roleIcon =
    role === "manager" ? (
      <Shield size={12} className="text-ink-2" />
    ) : (
      <Crown size={12} className="text-primary" />
    );

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const q = (fd.get("q") ?? "").toString().trim();
    router.push(`/me/portfolio/add/search?role=${role}&q=${encodeURIComponent(q)}`);
  }

  function handleClaim(dancer: DancerResult) {
    setClaimingId(dancer.id);
    setClaimError(null);
  }

  function handleCancelClaim() {
    setClaimingId(null);
    setClaimError(null);
  }

  function handleSubmitClaim(dancer: DancerResult, message: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("dancer_id", dancer.id);
      fd.set("relation", role === "manager" ? "manager" : "self");
      if (message.trim()) fd.set("message", message.trim());

      const result = await claimDancerProfileAction(fd);
      if (!result.ok) {
        setClaimError(result.error);
        return;
      }
      setClaimedIds((prev) => new Set([...prev, dancer.id]));
      setClaimingId(null);
    });
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 댄서 포트폴리오
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          기존 프로필 검색
        </h1>
        <p className="text-sm text-ink-2">
          이미 등록된 프로필이 있을 수 있어요. 먼저 검색해보세요.
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          {roleIcon}
          <span className="text-xs font-medium text-ink-3">{roleLabel}</span>
        </div>
      </header>

      {/* 검색 폼 */}
      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <input
            name="q"
            defaultValue={q}
            placeholder="활동명(Stage Name) 검색"
            className="w-full rounded-lg border border-hairline-2 bg-surface-2 py-3 pl-9 pr-4 text-sm placeholder:text-ink-4 focus:border-primary focus:outline-none"
            autoFocus={!q}
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          검색
        </button>
      </form>

      {/* 결과 */}
      {q && results.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-hairline-2 p-8 text-center">
          <p className="text-sm font-medium">
            &ldquo;{q}&rdquo; 와 일치하는 프로필이 없어요
          </p>
          <p className="text-xs text-ink-3">새로 프로필을 만들어드릴게요.</p>
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.14em] text-ink-3">
            검색 결과 {results.length}건
          </p>
          <ul className="flex flex-col gap-3">
            {results.map((dancer) => (
              <li key={dancer.id}>
                {claimingId === dancer.id ? (
                  <ClaimForm
                    dancer={dancer}
                    role={role}
                    onSubmit={(msg) => handleSubmitClaim(dancer, msg)}
                    onCancel={handleCancelClaim}
                    error={claimError}
                    pending={pending}
                  />
                ) : claimedIds.has(dancer.id) ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-ok/30 bg-ok/5 p-4 text-sm text-ok">
                    <CheckCircle size={16} className="shrink-0" />
                    <div className="flex flex-col gap-0.5">
                      <p className="font-semibold">
                        {dancer.stage_name} — 권한 신청 완료
                      </p>
                      <p className="text-xs text-ok/80">
                        관리자 승인 후 프로필이 연결됩니다.
                      </p>
                    </div>
                  </div>
                ) : (
                  <DancerCard
                    dancer={dancer}
                    onClaim={() => handleClaim(dancer)}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 하단 CTA */}
      <div className="flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={() =>
            router.push(`/onboarding/create?role=${role}`)
          }
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline-2 p-4 text-sm font-medium text-ink-2 transition-colors hover:bg-secondary"
        >
          {q
            ? "없어요, 새로 만들기"
            : "건너뛰고 바로 새로 만들기"}
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function DancerCard({
  dancer,
  onClaim,
}: {
  dancer: DancerResult;
  onClaim: () => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
      {dancer.profile_img ? (
        <Image
          src={dancer.profile_img}
          alt={dancer.stage_name}
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary text-base font-bold">
          {dancer.stage_name?.[0] ?? "?"}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-sm font-semibold">{dancer.stage_name}</p>
        {dancer.korean_name ? (
          <p className="truncate text-xs text-ink-3">{dancer.korean_name}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClaim}
        className="shrink-0 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
      >
        이 프로필이에요
      </button>
    </div>
  );
}

function ClaimForm({
  dancer,
  role,
  onSubmit,
  onCancel,
  error,
  pending,
}: {
  dancer: DancerResult;
  role: "self" | "manager";
  onSubmit: (message: string) => void;
  onCancel: () => void;
  error: string | null;
  pending: boolean;
}) {
  const [message, setMessage] = useState("");

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center gap-3">
        {dancer.profile_img ? (
          <Image
            src={dancer.profile_img}
            alt={dancer.stage_name}
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold">
            {dancer.stage_name?.[0] ?? "?"}
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-semibold">{dancer.stage_name}</p>
          <p className="text-xs text-ink-3">
            {role === "manager" ? "매니저로 권한 신청" : "본인 프로필로 권한 신청"}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-ink-2">
          관리자에게 전달할 메시지 <span className="text-ink-4">(선택)</span>
        </label>
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={1000}
          placeholder={
            role === "manager"
              ? "예: 이 댄서의 매니저입니다. 연락처: ..."
              : "예: 본인입니다. 인스타그램 @..."
          }
          className="w-full resize-none rounded-lg border border-hairline-2 bg-background px-3 py-2 text-sm placeholder:text-ink-4 focus:border-primary focus:outline-none"
        />
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <p className="text-xs text-ink-3">
        신청 후 관리자 검토를 거쳐 연결됩니다.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="flex-1 rounded-lg border border-hairline-2 bg-background py-2.5 text-sm font-medium text-ink-2 transition-colors hover:bg-secondary disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => onSubmit(message)}
          disabled={pending}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : "권한 신청"}
        </button>
      </div>
    </div>
  );
}
