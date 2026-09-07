import { requireStaff } from "@/lib/auth/guard";
import { RateCheckConsole } from "@/components/admin/rate-check/RateCheckConsole";
import { rateChecksTable, RATE_CHECK_COLUMNS, toRateCheckData, type RateCheckRow } from "@/lib/rate-check/repository";
import { RATE_CHECK_DISABLED, type RateCheckData } from "@/lib/rate-check/types";

export const dynamic = "force-dynamic";
export const maxDuration = 240;

export default async function RateCheckPage() {
  await requireStaff();
  let history: RateCheckData[] = [];
  let historyError: string | null = null;
  try {
    const { data, error } = await rateChecksTable().select(RATE_CHECK_COLUMNS)
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    history = ((data ?? []) as unknown as RateCheckRow[]).map((row) => toRateCheckData(row));
  } catch {
    historyError = "조회 기록을 불러오지 못했습니다. DB 마이그레이션과 연결을 확인해 주세요.";
  }

  return (
    <div className="flex flex-col gap-6 px-6 pb-10 pt-8 lg:mx-auto lg:max-w-4xl">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 도구 / 페이 산정</p>
        <h1 className="text-2xl font-bold leading-tight tracking-tight">페이 산정 (음원 챌린지 기준)</h1>
        <p className="text-sm text-ink-2">인스타그램 팔로워와 최근 릴스 조회수로 안내가를 확인합니다.</p>
      </header>
      {!process.env.RATE_CHECK_APIFY_TOKEN?.trim() && (
        <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{RATE_CHECK_DISABLED}</p>
      )}
      <RateCheckConsole history={history} historyError={historyError} />
    </div>
  );
}
