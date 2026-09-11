import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import {
  RateCardManager,
  type RateCardRow,
} from "@/components/portfolio/RateCardManager";
import { serverT } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n/t";
import me from "@/lib/i18n/messages/me";

// 댄서 본인이 서비스별 단가(안무제작/챌린지/모델료/국내강습/해외워크샵)를 입력하는 페이지.
// 해외워크샵은 국가별로 단가를 따로 둘 수 있다. (RLS: 본인/매니저/관리자만 쓰기)
export default async function MyRatesPage() {
  const user = await requireUser();
  const t = await serverT(me);
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
        <Header t={t} />
        <Link
          href="/me/portfolio/add"
          className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-hairline-2 p-8 text-center transition-colors hover:bg-secondary"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Plus size={20} />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold">{t("rates.no_dancer_title")}</p>
            <p className="text-xs text-ink-3">{t("rates.no_dancer_desc")}</p>
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
      <Header t={t} dancerName={dancer.stage_name} />
      <RateCardManager initialCards={initialCards} dancerId={dancer.id} />
    </div>
  );
}

function Header({
  t,
  dancerName,
}: {
  t: Translator<typeof me>;
  dancerName?: string;
}) {
  return (
    <header className="flex flex-col gap-2">
      <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
        ↳ {t("rates.eyebrow")}
      </p>
      <h1 className="text-2xl font-bold tracking-tight leading-tight">
        {t("rates.title")}
      </h1>
      <p className="text-sm text-ink-2">
        {dancerName ? (
          <>
            <span data-ugc>{dancerName}</span>
            {" · "}
          </>
        ) : null}
        {t("rates.desc")}
      </p>
    </header>
  );
}
