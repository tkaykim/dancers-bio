import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import {
  RATE_SERVICE_TYPES,
  RATE_SERVICE_LABELS,
  isCountryService,
  countryLabel,
  formatRate,
  type RateServiceType,
} from "@/lib/validation/rate-cards";

/**
 * 관리자 전용 댄서 단가 열람. 댄서별 서비스 단가 + 팔로워 + 경력점수를 한눈에.
 * 엔터테인먼트 챌린지 대량 제안 시 단가 비교/추출용. (rate_cards·dancer_scores admin-only RLS)
 */

type Card = {
  id: string;
  service_type: RateServiceType;
  country: string | null;
  price: number | null;
  price_min: number | null;
  price_max: number | null;
  currency: string;
  is_negotiable: boolean;
  unit: string | null;
  note: string | null;
  is_public: boolean;
};

type DancerRow = {
  id: string;
  stage_name: string;
  korean_name: string | null;
  slug: string | null;
  approval_status: string;
  is_active: boolean;
  follower_counts: Record<string, number> | null;
  dancer_rate_cards: Card[];
  dancer_scores: { score: number }[] | null;
};

function followerOf(fc: Record<string, number> | null, key: string): number | null {
  if (!fc || fc[key] == null) return null;
  const n = Number(fc[key]);
  return Number.isFinite(n) ? n : null;
}

function compactNum(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}만`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}천`;
  return n.toLocaleString();
}

export default async function AdminRateCardsPage() {
  await requireSuperAdmin();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dancers")
    .select(
      "id, stage_name, korean_name, slug, approval_status, is_active, follower_counts, " +
        "dancer_rate_cards!inner ( id, service_type, country, price, price_min, price_max, currency, is_negotiable, unit, note, is_public ), " +
        "dancer_scores ( score )",
    )
    .order("stage_name", { ascending: true })
    .limit(500);

  const rows = (data ?? []) as unknown as DancerRow[];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 관리자 / 단가
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          댄서 단가 열람
        </h1>
        <p className="text-sm text-ink-2">
          댄서가 직접 등록한 서비스별 단가 + 팔로워 + 경력점수. 엔터테인먼트 챌린지
          대량 제안 시 단가 비교용입니다. (단가 등록된 댄서만 표시 · {rows.length}명)
        </p>
      </header>

      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          조회 실패: {error.message}
        </p>
      ) : null}

      {rows.length === 0 && !error ? (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-ink-3">
          아직 단가를 등록한 댄서가 없습니다.
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {rows.map((d) => {
          const ig = followerOf(d.follower_counts, "instagram");
          const tt = followerOf(d.follower_counts, "tiktok");
          const score = d.dancer_scores?.[0]?.score ?? null;
          const masked = d.approval_status !== "approved" || !d.is_active;
          const byService = RATE_SERVICE_TYPES.map((st) => ({
            service: st,
            items: d.dancer_rate_cards
              .filter((c) => c.service_type === st)
              .sort((a, b) => (a.country ?? "").localeCompare(b.country ?? "")),
          })).filter((g) => g.items.length > 0);

          return (
            <div
              key={d.id}
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                <Link
                  href={d.slug ? `/d/${d.slug}` : `/d/${d.id}`}
                  className="text-sm font-bold text-foreground hover:underline"
                >
                  {d.stage_name}
                </Link>
                {d.korean_name ? (
                  <span className="text-xs text-ink-3">{d.korean_name}</span>
                ) : null}
                {masked ? (
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-ink-3">
                    미노출
                  </span>
                ) : null}
                <div className="ml-auto flex items-center gap-1.5">
                  {ig != null ? (
                    <span className="rounded-full border border-hairline-2 px-2 py-0.5 text-[10px] text-ink-2">
                      IG {compactNum(ig)}
                    </span>
                  ) : null}
                  {tt != null ? (
                    <span className="rounded-full border border-hairline-2 px-2 py-0.5 text-[10px] text-ink-2">
                      TT {compactNum(tt)}
                    </span>
                  ) : null}
                  {score != null ? (
                    <span className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 font-mono text-[10px] text-primary">
                      점수 {Number(score).toFixed(1)}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-x-4 gap-y-2 p-3 sm:grid-cols-2">
                {byService.map((g) => (
                  <div key={g.service} className="flex flex-col gap-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">
                      {RATE_SERVICE_LABELS[g.service]}
                    </p>
                    <ul className="flex flex-col gap-0.5">
                      {g.items.map((c) => (
                        <li
                          key={c.id}
                          className="flex items-baseline gap-1.5 text-sm"
                        >
                          {isCountryService(g.service) ? (
                            <span className="shrink-0 rounded bg-secondary px-1 py-0.5 text-[10px] text-ink-2">
                              {countryLabel(c.country)}
                            </span>
                          ) : null}
                          <span className="font-semibold text-foreground">
                            {formatRate(c)}
                          </span>
                          {c.unit ? (
                            <span className="text-xs text-ink-3">/ {c.unit}</span>
                          ) : null}
                          {c.is_negotiable ? (
                            <span className="text-[10px] text-ink-4">협의</span>
                          ) : null}
                          {!c.is_public ? (
                            <span className="text-[10px] text-ink-4">·비공개</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Link
        href="/admin"
        className="text-xs uppercase tracking-[0.14em] text-ink-3 underline-offset-4 hover:underline"
      >
        ← admin 홈
      </Link>
    </div>
  );
}
