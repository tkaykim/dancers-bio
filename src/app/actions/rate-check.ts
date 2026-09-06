"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/guard";
import { collectInstagramRate, RateCheckCollectionError } from "@/lib/rate-check/apify";
import { calculateRate, normalizeInstagramHandle } from "@/lib/rate-check/pricing";
import { kstDayStart, rateChecksTable, RATE_CHECK_COLUMNS, toRateCheckData, type RateCheckRow } from "@/lib/rate-check/repository";
import { RATE_CHECK_DAILY_LIMIT, RATE_CHECK_DISABLED, type RateCheckData } from "@/lib/rate-check/types";

const schema = z.object({
  handle: z.string().max(2048).transform(normalizeInstagramHandle).refine((value) => value !== null),
  force: z.enum(["true", "false"]).nullable(),
});

export async function checkInstagramRateAction(fd: FormData): Promise<{ ok: true; data: RateCheckData } | { ok: false; error: string }> {
  let profile;
  try { profile = await requireStaff(); }
  catch { return { ok: false, error: "관리자 또는 프로젝트 공동관리자만 사용할 수 있습니다." }; }

  const parsed = schema.safeParse({ handle: fd.get("handle"), force: fd.get("force") });
  if (!parsed.success || !parsed.data.handle) return { ok: false, error: "올바른 인스타그램 핸들을 입력해 주세요(영문·숫자·점·밑줄, 1~30자)." };
  const handle = parsed.data.handle;
  const enabled = Boolean(process.env.RATE_CHECK_APIFY_TOKEN?.trim());

  try {
    if (parsed.data.force !== "true") {
      const { data, error } = await rateChecksTable().select(RATE_CHECK_COLUMNS)
        .eq("ig_handle", handle).is("error", null)
        .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (data) return { ok: true, data: toRateCheckData(data as unknown as RateCheckRow, true) };
      if (error && enabled) return { ok: false, error: "조회 기록을 읽을 수 없습니다. DB 마이그레이션과 연결을 확인해 주세요." };
    }
    if (!enabled) return { ok: false, error: RATE_CHECK_DISABLED };
    const { count, error: countError } = await rateChecksTable().select("id", { count: "exact", head: true }).gte("created_at", kstDayStart());
    if (countError || count === null) return { ok: false, error: "오늘 측정 횟수를 확인할 수 없습니다." };
    if (count >= RATE_CHECK_DAILY_LIMIT) return { ok: false, error: `오늘 측정 한도(한국 시간 기준 ${RATE_CHECK_DAILY_LIMIT}회)에 도달했습니다. 내일 다시 시도해 주세요.` };

    let collected;
    try {
      collected = await collectInstagramRate(handle);
    } catch (error) {
      const failure = error instanceof RateCheckCollectionError ? error : null;
      const message = failure?.message ?? "계정 수집에 실패했습니다.";
      const { error: saveError } = await rateChecksTable().insert({
        ig_handle: handle, created_by: profile.id, sample_status: "insufficient",
        followers: failure?.profile?.followers ?? null, full_name: failure?.profile?.fullName ?? null,
        profile_pic_url: failure?.profile?.profilePicUrl ?? null, is_private: failure?.profile?.isPrivate ?? false,
        raw: failure?.raw ?? null, error: message,
      });
      revalidatePath("/tools/rate-check");
      return { ok: false, error: saveError ? `${message} 오류 기록 저장에도 실패했습니다.` : message };
    }

    const pricing = calculateRate(collected.profile.followers, collected.reels);
    const { data, error } = await rateChecksTable().insert({
      ig_handle: handle, followers: collected.profile.followers, full_name: collected.profile.fullName,
      profile_pic_url: collected.profile.profilePicUrl, is_private: false,
      reels: pricing.reels, reels_used: pricing.reelsUsed, sample_status: pricing.sampleStatus,
      trimmed_mean: pricing.trimmedMean, median_views: pricing.median, views_low: pricing.viewsLow,
      views_high: pricing.viewsHigh, expected_views: pricing.expectedViews, tier: pricing.tier,
      f_base: pricing.fBase, v_base: pricing.vBase, formula_rate: pricing.formulaRate,
      raw: collected.raw, created_by: profile.id,
    }).select(RATE_CHECK_COLUMNS).single();
    if (error || !data) return { ok: false, error: "측정 결과를 저장하지 못했습니다. DB 연결을 확인해 주세요." };
    revalidatePath("/tools/rate-check");
    return { ok: true, data: toRateCheckData(data as unknown as RateCheckRow) };
  } catch {
    return { ok: false, error: enabled ? "측정 처리에 실패했습니다. 서버 설정과 DB 연결을 확인해 주세요." : RATE_CHECK_DISABLED };
  }
}
