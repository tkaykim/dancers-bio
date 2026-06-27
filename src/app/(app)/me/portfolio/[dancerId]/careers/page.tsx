import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import {
  CareerHistoryManager,
  type CareerRow,
} from "@/components/portfolio/CareerHistoryManager";

export default async function CareersPage({
  params,
}: {
  params: Promise<{ dancerId: string }>;
}) {
  const { dancerId } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: dancer } = await supabase
    .from("dancers")
    .select("id, stage_name, profile_id")
    .eq("id", dancerId)
    .maybeSingle();

  if (!dancer) notFound();

  // Auth: owner / manager / admin
  const isOwner = dancer.profile_id === user.id;
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = Boolean(profile?.is_admin);
  let isManager = false;
  if (!isOwner && !isAdmin) {
    const { data: mgr } = await supabase
      .from("dancer_managers")
      .select("dancer_id")
      .eq("dancer_id", dancer.id)
      .eq("manager_id", user.id)
      .maybeSingle();
    isManager = Boolean(mgr);
  }
  if (!isOwner && !isManager && !isAdmin) notFound();

  const { data: careers } = await supabase
    .from("careers")
    .select(
      "id, type, title, date, details, is_public, is_representative, sort_order",
    )
    .eq("dancer_id", dancer.id)
    .order("sort_order", { ascending: false })
    .order("date", { ascending: false });

  const list = ((careers ?? []) as CareerRow[]).map((c) => ({
    ...c,
    sort_order: c.sort_order ?? 0,
    is_public: c.is_public ?? false,
    is_representative: c.is_representative ?? false,
  }));

  return (
    <div className="mx-auto flex max-w-md flex-col lg:max-w-2xl gap-8 px-6 py-8">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            ↳ 경력 관리
          </p>
          <h1 className="text-2xl font-bold leading-tight tracking-tight">
            {dancer.stage_name}
          </h1>
          <p className="text-sm text-ink-2">
            카테고리별로 경력을 추가하고 영상 링크를 첨부합니다.
          </p>
        </div>
        <Link
          href={`/me/portfolio/${dancer.id}`}
          className="shrink-0 rounded-full border border-hairline-2 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-ink-2 hover:text-foreground"
        >
          ← 프로필
        </Link>
      </header>

      {/* Lite: AI 경력 추출 UI 비활성. */}
      <CareerHistoryManager initialCareers={list} dancerId={dancer.id} />
    </div>
  );
}
