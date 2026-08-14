import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import {
  RateCardManager,
  type RateCardRow,
} from "@/components/portfolio/RateCardManager";

// 댄서 본인이 서비스별 단가(안무제작/챌린지/모델료/국내강습/해외워크샵)를 입력하는 페이지.
// 해외워크샵은 국가별로 단가를 따로 둘 수 있다. (RLS: 본인/매니저/관리자만 쓰기)
export default async function MyRatesPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: dancer } = await supabase
    .from("dancers")
    .select("id, stage_name")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!dancer) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
        <Header />
        <Link
          href="/me/portfolio/add"
          className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-hairline-2 p-8 text-center transition-colors hover:bg-secondary"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Plus size={20} />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold">먼저 댄서 프로필을 만들어 주세요</p>
            <p className="text-xs text-ink-3">
              프로필을 만든 뒤 단가를 등록할 수 있어요
            </p>
          </div>
        </Link>
      </div>
    );
  }

  const { data: cards } = await supabase
    .from("dancer_rate_cards")
    .select(
      "id, service_type, country, price, price_min, price_max, currency, is_negotiable, unit, note, is_public",
    )
    .eq("dancer_id", dancer.id);

  const initialCards = (cards ?? []) as RateCardRow[];

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <Header dancerName={dancer.stage_name} />
      <RateCardManager initialCards={initialCards} dancerId={dancer.id} />
    </div>
  );
}

function Header({ dancerName }: { dancerName?: string }) {
  return (
    <header className="flex flex-col gap-2">
      <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
        ↳ 댄서 단가
      </p>
      <h1 className="text-2xl font-bold tracking-tight leading-tight">
        내 단가표
      </h1>
      <p className="text-sm text-ink-2">
        {dancerName ? `${dancerName} · ` : ""}
        안무제작 · 챌린지 · 모델료 · 강습 단가를 직접 등록하세요. 엔터테인먼트 챌린지
        제안 등에 활용됩니다.
      </p>
    </header>
  );
}
