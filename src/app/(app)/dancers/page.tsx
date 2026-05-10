import Link from "next/link";
import Image from "next/image";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";

type Dancer = {
  id: string;
  stage_name: string;
  korean_name: string | null;
  slug: string | null;
  profile_img: string | null;
  location: string | null;
  genres: string[] | null;
  specialties: string[] | null;
  profile_id: string | null;
};

export default async function DancersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const supabase = await createClient();

  let query = supabase
    .from("dancers")
    .select(
      "id, stage_name, korean_name, slug, profile_img, location, genres, specialties, profile_id",
    )
    .eq("approval_status", "approved")
    .order("display_order", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(60);
  if (q) {
    const safe = q.replace(/[%_,]/g, "");
    query = query.or(
      `stage_name.ilike.%${safe}%,korean_name.ilike.%${safe}%`,
    );
  }
  const { data } = await query;
  const dancers = (data ?? []) as Dancer[];

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 댄서 디렉토리
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          댄서 찾기
        </h1>
      </header>

      <form className="flex flex-col gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder="활동명, 한글 이름 검색"
          autoComplete="off"
        />
      </form>

      {dancers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-hairline-2 p-8 text-center text-sm text-ink-3">
          {q ? "검색 결과가 없습니다." : "아직 등록된 댄서가 없습니다."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {dancers.map((d) => (
            <li key={d.id}>
              <Link
                href={`/d/${d.slug ?? d.id}`}
                className="group relative block aspect-[3/4] overflow-hidden rounded-2xl border border-border bg-card"
              >
                {d.profile_img ? (
                  <Image
                    src={d.profile_img}
                    alt={d.stage_name}
                    fill
                    sizes="(max-width: 448px) 50vw, 220px"
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `repeating-linear-gradient(135deg, rgba(255,250,235,0.04) 0 12px, rgba(255,250,235,0.08) 12px 24px)`,
                    }}
                  />
                )}
                <div
                  className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent"
                  style={{ background: "linear-gradient(to top, rgba(14,14,12,0.95) 5%, transparent 60%)" }}
                />
                <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-0.5 p-3">
                  <p className="text-sm font-semibold leading-tight text-foreground">
                    {d.stage_name}
                  </p>
                  {d.korean_name ? (
                    <p className="text-[11px] text-ink-3">{d.korean_name}</p>
                  ) : null}
                  {(d.genres ?? []).length > 0 ? (
                    <p className="text-[10px] text-ink-3">
                      {(d.genres ?? []).slice(0, 2).join(" · ")}
                    </p>
                  ) : null}
                </div>
                {d.profile_id ? null : (
                  <span className="absolute right-2 top-2 rounded-full bg-card/80 px-2 py-0.5 text-[10px] text-ink-3 backdrop-blur">
                    큐레이션
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
