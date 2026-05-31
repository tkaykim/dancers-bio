import Image from "next/image";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { IngestionReview, CareersPreview } from "./IngestionReview";

type ParsedProfile = {
  stage_name?: string;
  bio?: string;
  location?: string;
  genres?: string[];
  profile_img?: string;
  slug?: string;
};

type IngestionRow = {
  id: string;
  ig_user_id: string | null;
  parsed_profile: ParsedProfile | null;
  parsed_careers: Array<Record<string, unknown>> | null;
  status: string;
  created_dancer_id: string | null;
  created_at: string;
  decided_at: string | null;
};

function fmt(d: string): string {
  return new Date(d).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default async function AdminIngestionsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from("dancer_ingestions")
    .select(
      "id, ig_user_id, parsed_profile, parsed_careers, status, created_dancer_id, created_at, decided_at",
    )
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(100);

  const list = (data ?? []) as IngestionRow[];

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin"
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← 관리자 콘솔
      </Link>
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 댄서 발굴 파이프라인
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          검수 게이트
        </h1>
        <p className="text-sm text-ink-2">
          스크랩으로 수집된 프로필 초안을 검토하고 승인/기각합니다.
        </p>
      </header>

      <div className="rounded-2xl border border-warn/30 bg-warn/5 p-4 text-sm text-warn">
        ⚠ 여기 표시되는 경력은 자동 추출된{" "}
        <strong>미검증(unverified)</strong> 데이터입니다. 승인 전 반드시 사실
        여부를 확인하세요. 승인 후에도 경력은 미검증 상태로 노출됩니다.
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-hairline-2 bg-card p-6 text-center text-sm text-ink-3">
          검수 대기 중인 초안이 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {list.map((row) => {
            const p = row.parsed_profile ?? {};
            const careers = row.parsed_careers ?? [];
            const stageName = p.stage_name ?? "";
            const defaultSlug = p.slug ?? (stageName ? slugify(stageName) : "");
            return (
              <li
                key={row.id}
                className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-secondary">
                    {p.profile_img ? (
                      <Image
                        src={p.profile_img}
                        alt={stageName || "프로필"}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {stageName || "(활동명 없음)"}
                    </p>
                    <p className="truncate text-[11px] text-ink-3">
                      {p.location ?? "—"}
                      {row.ig_user_id ? ` · IG ${row.ig_user_id}` : ""}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-3">
                      {fmt(row.created_at)}
                    </p>
                  </div>
                </div>

                {p.bio ? (
                  <p className="text-xs text-ink-2">{p.bio}</p>
                ) : null}

                {p.genres && p.genres.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {p.genres.map((g, i) => (
                      <span
                        key={i}
                        className="rounded-full border border-hairline-2 px-2 py-0.5 text-[10px] text-ink-2"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-warn/30 bg-warn/5 px-2 py-0.5 text-[10px] font-medium text-warn">
                    미검증
                  </span>
                  <span className="text-[11px] text-ink-3">
                    경력 {careers.length}건
                  </span>
                </div>

                <CareersPreview careers={careers} />

                <IngestionReview
                  ingestionId={row.id}
                  defaultStageName={stageName}
                  defaultSlug={defaultSlug}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
