"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  CheckCircle,
  ChevronRight,
  Crown,
  Loader2,
  Shield,
} from "lucide-react";
import { claimDancerProfileAction } from "@/app/actions/claim";
import { createClient } from "@/lib/supabase/browser";
import { Input } from "@/components/ui/input";

const PAGE_SIZE = 24;

type DancerResult = {
  id: string;
  stage_name: string;
  korean_name: string | null;
  slug: string | null;
  profile_img: string | null;
  genres: string[] | null;
};

type Props = {
  role: "self" | "manager";
  /** SSR에서 미리 가져온 첫 페이지. */
  initialDancers: DancerResult[];
  /** 클레임 가능한 큐레이션 댄서 총 개수. */
  totalCount: number;
  returnTo?: string | null;
};

// nav `/dancers`와 동일한 검색 UX. 단 차이점:
// - claim 대상이라 profile_id IS NULL 필터 (큐레이션 dancer만)
// - 팀 탭 없음 (claim은 dancer만)
// - 카드 클릭 → 공개 페이지 이동 대신 inline 클레임 폼
export function SearchSection({
  role,
  initialDancers,
  totalCount,
  returnTo = null,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [dancers, setDancers] = useState<DancerResult[]>(initialDancers);
  const [hasMore, setHasMore] = useState(initialDancers.length === PAGE_SIZE);
  const [, startTransition] = useTransition();
  const [loadingMore, setLoadingMore] = useState(false);

  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimPending, startClaim] = useTransition();

  const roleLabel = role === "manager" ? "매니저로 등록" : "본인으로 등록";
  const roleIcon =
    role === "manager" ? (
      <Shield size={12} className="text-ink-2" />
    ) : (
      <Crown size={12} className="text-primary" />
    );

  // 검색 debounce
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);

  const fetchPage = useCallback(
    async (q: string, offset: number): Promise<DancerResult[]> => {
      const supabase = createClient();
      let qb = supabase
        .from("dancers")
        .select("id, stage_name, korean_name, slug, profile_img, genres")
        .is("profile_id", null)
        .eq("approval_status", "approved")
        .eq("is_active", true)
        // verified 큐레이션 프로필도 검색에 노출한다 — 본인이 가입 후 검색으로 찾아
        // 클레임할 수 있어야 하고, 실제 연결은 IG 인증 + 관리자 승인으로 게이트된다.
        .order("stage_name", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (q) {
        const safe = q.replace(/[%_,]/g, "");
        qb = qb.or(
          `stage_name.ilike.%${safe}%,korean_name.ilike.%${safe}%`,
        );
      }
      const { data } = await qb;
      return (data ?? []) as DancerResult[];
    },
    [],
  );

  const skipFirstFetch = useRef(true);

  useEffect(() => {
    if (skipFirstFetch.current && debouncedQ === "") {
      skipFirstFetch.current = false;
      return;
    }
    startTransition(() => {
      void (async () => {
        const next = await fetchPage(debouncedQ, 0);
        setDancers(next);
        setHasMore(next.length === PAGE_SIZE);
      })();
    });
  }, [debouncedQ, fetchPage]);

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchPage(debouncedQ, dancers.length);
      setDancers((prev) => [...prev, ...next]);
      setHasMore(next.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }

  function handleSubmitClaim(dancer: DancerResult, message: string) {
    startClaim(async () => {
      const fd = new FormData();
      fd.set("dancer_id", dancer.id);
      fd.set("relation", role === "manager" ? "manager" : "self");
      if (message.trim()) fd.set("message", message.trim());

      const result = await claimDancerProfileAction(fd);
      if (!result.ok) {
        setClaimError(result.error);
        return;
      }
      // Lite: claim 생성 후 즉시 IG 본인 인증 단계로 이동.
      const claimId = result.data?.claim_request_id;
      if (claimId) {
        router.push(`/verify-instagram?claim=${claimId}`);
        return;
      }
      // 보조 fallback (이론적으로 발생 X)
      setClaimedIds((prev) => new Set([...prev, dancer.id]));
      setClaimingId(null);
      setClaimError(null);
    });
  }

  const shown = dancers.length;

  return (
    <div className="mx-auto flex max-w-md flex-col lg:max-w-2xl gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 댄서 포트폴리오
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          기존 프로필 검색
        </h1>
        <p className="text-sm text-ink-2">
          이미 등록된 프로필이 있을 수 있어요. 활동명·한글 이름으로 검색해 보세요.
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          {roleIcon}
          <span className="text-xs font-medium text-ink-3">{roleLabel}</span>
        </div>
      </header>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="활동명, 한글 이름 검색"
        autoComplete="off"
        type="search"
        enterKeyHint="search"
        autoFocus
      />

      {totalCount > 0 && !debouncedQ ? (
        <p className="text-[11px] text-ink-3">
          총 {totalCount.toLocaleString()}명 중 {shown.toLocaleString()}명 표시
        </p>
      ) : null}

      {dancers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-hairline-2 p-8 text-center text-sm text-ink-3">
          {debouncedQ
            ? `"${debouncedQ}" 와 일치하는 프로필이 없어요. 아래에서 새로 만들어드릴게요.`
            : "등록된 댄서가 없습니다."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {dancers.map((d) => {
            if (claimedIds.has(d.id)) {
              return (
                <li key={d.id} className="col-span-2">
                  <div className="flex items-center gap-3 rounded-2xl border border-ok/30 bg-ok/5 p-4 text-sm text-ok">
                    <CheckCircle size={16} className="shrink-0" />
                    <div className="flex flex-col gap-0.5">
                      <p className="font-semibold">
                        {d.stage_name} — 권한 신청 완료
                      </p>
                      <p className="text-xs text-ok/80">
                        관리자 승인 후 프로필이 연결됩니다.
                      </p>
                    </div>
                  </div>
                </li>
              );
            }
            if (claimingId === d.id) {
              return (
                <li key={d.id} className="col-span-2">
                  <ClaimForm
                    dancer={d}
                    role={role}
                    onSubmit={(msg) => handleSubmitClaim(d, msg)}
                    onCancel={() => {
                      setClaimingId(null);
                      setClaimError(null);
                    }}
                    error={claimError}
                    pending={claimPending}
                  />
                </li>
              );
            }
            return (
              <li key={d.id}>
                <DancerCard dancer={d} onClick={() => setClaimingId(d.id)} />
              </li>
            );
          })}
        </ul>
      )}

      {hasMore && dancers.length > 0 ? (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mx-auto mt-2 rounded-full border border-hairline-2 bg-card px-6 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
        >
          {loadingMore ? "불러오는 중…" : "더 보기"}
        </button>
      ) : null}

      <div className="flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={() => {
            const rt = returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : "";
            router.push(`/onboarding/create?role=${role}${rt}`);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline-2 p-4 text-sm font-medium text-ink-2 transition-colors hover:bg-secondary"
        >
          {debouncedQ ? "없어요, 새로 만들기" : "건너뛰고 바로 새로 만들기"}
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function DancerCard({
  dancer,
  onClick,
}: {
  dancer: DancerResult;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative block aspect-[3/4] w-full overflow-hidden rounded-2xl border border-border bg-card text-left"
    >
      {dancer.profile_img ? (
        <Image
          src={dancer.profile_img}
          alt={dancer.stage_name}
          fill
          sizes="(max-width: 448px) 50vw, 220px"
          className="object-cover transition-transform group-hover:scale-105"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              "repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 12px, rgba(255,255,255,0.09) 12px 24px), #1c1c19",
          }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(14,14,12,0.95) 5%, transparent 60%)",
        }}
      />
      <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-0.5 p-3">
        <p className="text-sm font-semibold leading-tight text-white">
          {dancer.stage_name}
        </p>
        {dancer.korean_name ? (
          <p className="text-[11px] text-white/65">{dancer.korean_name}</p>
        ) : null}
        {(dancer.genres ?? []).length > 0 ? (
          <p className="text-[10px] text-white/55">
            {(dancer.genres ?? []).slice(0, 2).join(" · ")}
          </p>
        ) : null}
      </div>
      <span className="absolute right-2 top-2 rounded-full bg-card/80 px-2 py-0.5 text-[10px] text-ink-3 backdrop-blur">
        큐레이션
      </span>
    </button>
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
