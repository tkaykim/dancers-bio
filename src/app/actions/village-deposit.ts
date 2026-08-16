"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { countryLabel } from "@/lib/data/countries";
import { verifyVisaCaseToken } from "@/lib/quick-token";
import { makeVisaPaymentUrl } from "@/lib/visa/payment-link";
import type { ActionResult } from "./auth";

// deetz Village 사전예약금 결제 링크 발급.
//
// Village 는 아직 오픈 전이라 크라우드펀딩형 사전예약이다.
// 결제 대상(ref 의 id)은 항상 village_waitlist 행이다 — 비자 케이스 id 를 쓰면
// 결제 콜백이 비자 결제로 오인해 케이스 상태를 잘못 바꾼다.
//
// 두 갈래로 들어온다:
//  ① /village 공개 페이지에서 관심 등록을 마친 사람 (waitlistId)
//  ② 비자 케이스 포털에서 선택한 지원자 (caseToken) — 케이스 정보로 대기자 행을 자동 생성

const fromWaitlistSchema = z.object({ waitlistId: z.string().uuid() });

/** 이미 만들어진 대기자 행에 대한 결제 URL. */
export async function getVillageDepositUrlAction(
  input: z.input<typeof fromWaitlistSchema>,
): Promise<ActionResult<{ url: string }>> {
  const parsed = fromWaitlistSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };
  return issueDepositUrl(parsed.data.waitlistId);
}

const fromCaseSchema = z.object({ token: z.string().min(10).max(400) });

/**
 * 비자 케이스 포털에서 Village 사전예약을 선택했을 때.
 * 케이스에 연결된 대기자 행이 없으면 케이스 정보로 하나 만들고, 있으면 재사용한다.
 */
export async function reserveVillageFromCaseAction(
  input: z.input<typeof fromCaseSchema>,
): Promise<ActionResult<{ url: string; waitlistId: string }>> {
  const parsed = fromCaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };

  const applicationId = verifyVisaCaseToken(parsed.data.token);
  if (!applicationId) return { ok: false, error: "링크가 유효하지 않습니다." };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "서버 설정 오류입니다." };
  }

  const { data: existing } = await admin
    .from("village_waitlist")
    .select("id")
    .eq("visa_application_id", applicationId)
    .maybeSingle();

  if (existing) {
    const issued = await issueDepositUrl(existing.id as string);
    if (!issued.ok) return issued;
    return { ok: true, data: { url: issued.data!.url, waitlistId: existing.id as string } };
  }

  // 케이스에서 이름·국적·연락처를 가져와 대기자 행을 만든다(지원자가 다시 입력하지 않게).
  const { data: application } = await admin
    .from("dancer_visa_applications")
    .select("id, email, preferred_lang, dancer_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!application) return { ok: false, error: "케이스를 찾을 수 없습니다." };

  let name: string | null = null;
  let nationality: string | null = null;
  let nationalityCode: string | null = null;
  if (application.dancer_id) {
    const [{ data: dancer }, { data: privateInfo }] = await Promise.all([
      admin.from("dancers").select("stage_name, korean_name").eq("id", application.dancer_id).maybeSingle(),
      admin
        .from("dancer_private_info")
        .select("nationality, nationality_code")
        .eq("dancer_id", application.dancer_id)
        .maybeSingle(),
    ]);
    name = (dancer?.stage_name as string | null) || (dancer?.korean_name as string | null) || null;
    nationalityCode = (privateInfo?.nationality_code as string | null) ?? null;
    nationality =
      (privateInfo?.nationality as string | null) ??
      (nationalityCode ? countryLabel(nationalityCode, "ko") || nationalityCode : null);
  }

  const { data: created, error: insertError } = await admin
    .from("village_waitlist")
    .insert({
      interested: true,
      name,
      nationality_code: nationalityCode,
      nationality,
      contact_type: "Email",
      contact: application.email as string,
      preferred_option: "undecided",
      room_preference: "any",
      lang: (application.preferred_lang as string | null) ?? "en",
      source: "visa_case",
      status: "new",
      visa_application_id: applicationId,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    // 동시 클릭으로 유니크 인덱스에 걸리면 이미 만들어진 행을 쓴다.
    if (insertError?.code === "23505") {
      const { data: raced } = await admin
        .from("village_waitlist")
        .select("id")
        .eq("visa_application_id", applicationId)
        .maybeSingle();
      if (raced) {
        const issued = await issueDepositUrl(raced.id as string);
        if (!issued.ok) return issued;
        return { ok: true, data: { url: issued.data!.url, waitlistId: raced.id as string } };
      }
    }
    console.error("[village-deposit] waitlist 생성 실패", insertError);
    return { ok: false, error: "사전예약을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  const issued = await issueDepositUrl(created.id as string);
  if (!issued.ok) return issued;
  return { ok: true, data: { url: issued.data!.url, waitlistId: created.id as string } };
}

/** 공통 — 결제 URL 을 서명해 만들고 대기자 행에 발급 사실을 남긴다. */
async function issueDepositUrl(waitlistId: string): Promise<ActionResult<{ url: string }>> {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "서버 설정 오류입니다." };
  }

  const { data: row } = await admin
    .from("village_waitlist")
    .select("id, deposit_status")
    .eq("id", waitlistId)
    .maybeSingle();
  if (!row) return { ok: false, error: "예약 정보를 찾을 수 없습니다." };
  if (row.deposit_status === "paid") {
    return { ok: false, error: "이미 사전예약금 결제가 완료된 건입니다." };
  }

  let url: string;
  try {
    url = makeVisaPaymentUrl(waitlistId, "village-deposit");
  } catch (error) {
    console.error("[village-deposit] 결제 링크 생성 실패", error);
    return { ok: false, error: "결제 링크 설정이 완료되지 않았습니다." };
  }

  // 발급 사실만 기록한다. 실제 결제 여부는 grigoent 콜백이 갱신한다.
  await admin
    .from("village_waitlist")
    .update({ deposit_status: "link_sent", deposit_link_sent_at: new Date().toISOString() })
    .eq("id", waitlistId)
    .eq("deposit_status", "none");

  return { ok: true, data: { url } };
}
