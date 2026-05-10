import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import {
  CareerForm,
  CareerListItem,
} from "@/components/portfolio/CareerEditor";

type CareerRow = {
  id: number;
  type: string;
  title: string;
  date: string;
  details: { link?: string; role?: string; description?: string; thumbnail?: string } | null;
  is_public: boolean;
  is_representative: boolean;
};

export default async function CareersPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: dancer } = await supabase
    .from("dancers")
    .select("id, stage_name")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!dancer) redirect("/me/portfolio");

  const { data: careers } = await supabase
    .from("careers")
    .select("id, type, title, date, details, is_public, is_representative")
    .eq("dancer_id", dancer.id)
    .order("date", { ascending: false })
    .order("sort_order", { ascending: true });

  const list = (careers ?? []) as CareerRow[];

  return (
    <div className="mx-auto flex max-w-md flex-col gap-8 px-6 py-8">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            ↳ 경력 관리
          </p>
          <h1 className="text-2xl font-bold tracking-tight leading-tight">
            {dancer.stage_name}
          </h1>
        </div>
        <Link
          href="/me/portfolio"
          className="shrink-0 rounded-full border border-hairline-2 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-ink-2 hover:text-foreground"
        >
          ← 프로필
        </Link>
      </header>

      <section className="flex flex-col gap-3">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 새 경력 추가
        </p>
        <CareerForm />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            ↳ 경력 목록
          </p>
          <span className="font-mono text-[11px] text-ink-3">
            {list.length}건
          </span>
        </div>
        {list.length === 0 ? (
          <p className="rounded-xl border border-dashed border-hairline-2 p-6 text-center text-sm text-ink-3">
            아직 등록된 경력이 없습니다. 위에서 추가해 주세요.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {list.map((career) => (
              <CareerListItem key={career.id} career={career} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
