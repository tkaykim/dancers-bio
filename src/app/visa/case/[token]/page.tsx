import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VisaCasePortal, type VisaCaseInitial } from "@/components/visa/VisaCasePortal";
import { visaLabel } from "@/lib/data/korea-visas";
import { verifyVisaCaseToken } from "@/lib/quick-token";
import {
  makeVisaPaymentUrl,
  VISA_PAYMENT_PAGES,
  type VisaPaymentProductSlug,
} from "@/lib/visa/payment-link";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Visa program case | deetz",
  robots: { index: false, follow: false },
};

type CaseRow = {
  id: string;
  dancer_id: string | null;
  email: string;
  preferred_lang: string | null;
  skill_level: number | null;
  dance_video_url: string | null;
  currently_in_korea: boolean | null;
  case_stage?: string | null;
  audition_at?: string | null;
  audition_location?: string | null;
  audition_status?: string | null;
  audition_result?: string | null;
  training_required?: boolean | null;
  training_partner?: string | null;
  training_start_date?: string | null;
  training_end_date?: string | null;
  training_status?: string | null;
  monthly_evaluation_at?: string | null;
  monthly_evaluation_result?: string | null;
  next_action?: string | null;
  base_price_krw?: number | null;
  quoted_price_krw?: number | null;
  follow_up_answers?: Record<string, unknown> | null;
  follow_up_submitted_at?: string | null;
  declined_at?: string | null;
  decline_reason?: string | null;
  decline_reason_detail?: string | null;
  payment_status?: string | null;
  payment_amount_krw?: number | null;
  paid_at?: string | null;
  payment_meta?: Record<string, unknown> | null;
};

function requestedLang(value: string | string[] | undefined): string | null {
  const lang = Array.isArray(value) ? value[0] : value;
  return lang === "en" || lang === "ja" || lang === "ko" ? lang : null;
}

export default async function VisaCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    lang?: string | string[];
    decline?: string | string[];
    edit?: string | string[];
  }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const declineRequested =
    (Array.isArray(query.decline) ? query.decline[0] : query.decline) === "1";
  // 재조율 메일처럼 "다시 제출해 달라"는 링크는 제출 완료 화면이 아니라 입력 폼으로 바로 착지시킨다.
  const editParam = Array.isArray(query.edit) ? query.edit[0] : query.edit;
  const editRequested = editParam === "slots" ? "slots" : editParam === "1" ? "form" : null;
  const applicationId = verifyVisaCaseToken(token);
  if (!applicationId) notFound();

  const admin = createAdminClient();
  const { data: raw } = await admin
    .from("dancer_visa_applications")
    .select("*")
    .eq("id", applicationId)
    .maybeSingle();
  if (!raw) notFound();
  const row = raw as unknown as CaseRow;

  // 확정된 온라인 미팅 — 가장 최근에 발송(sent)된 초대를 여정 타임라인에 보여준다.
  const { data: meetingInvite } = await admin
    .from("visa_meeting_invites")
    .select("meeting_at, meeting_url")
    .eq("application_id", applicationId)
    .eq("status", "sent")
    .order("meeting_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 결제 링크가 발급된 상태면 포털에서 바로 결제할 수 있게 URL 을 새로 서명해 만든다.
  // (링크를 저장하지 않고 매 렌더마다 서명하므로 만료 걱정이 없다.)
  const paymentStatus = row.payment_status ?? "unpaid";
  const issuedSlug = (row.payment_meta?.issued_product_slug as string | undefined) ?? "audition-fee";
  const paymentProductSlug: VisaPaymentProductSlug = issuedSlug in VISA_PAYMENT_PAGES
    ? (issuedSlug as VisaPaymentProductSlug)
    : "audition-fee";
  let paymentUrl: string | null = null;
  if (paymentStatus === "link_sent") {
    try {
      paymentUrl = makeVisaPaymentUrl(applicationId, paymentProductSlug);
    } catch (error) {
      // 시크릿 미설정 등 — 결제 버튼만 빠지고 나머지 화면은 정상 동작해야 한다.
      console.error("[visa-case] payment url 생성 실패 (non-fatal):", error);
    }
  }

  // Village 사전예약금 상태 (이 케이스로 만든 대기자 행이 있으면).
  const { data: villageRow } = await admin
    .from("village_waitlist")
    .select("deposit_status, deposit_paid_at")
    .eq("visa_application_id", applicationId)
    .maybeSingle();

  let name = "Dancer";
  let nationality: string | null = null;
  let hasVisa: boolean | null = null;
  let currentVisaLabel: string | null = null;
  if (row.dancer_id) {
    const [{ data: dancer }, { data: privateInfo }] = await Promise.all([
      admin.from("dancers").select("stage_name, korean_name").eq("id", row.dancer_id).maybeSingle(),
      admin.from("dancer_private_info").select("nationality, has_visa, visa_type").eq("dancer_id", row.dancer_id).maybeSingle(),
    ]);
    name = (dancer?.stage_name as string | null) || (dancer?.korean_name as string | null) || name;
    nationality = (privateInfo?.nationality as string | null) ?? null;
    hasVisa = (privateInfo?.has_visa as boolean | null) ?? null;
    const visaType = (privateInfo?.visa_type as string | null) ?? null;
    currentVisaLabel = visaType ? visaLabel(visaType) : null;
  }

  const initial: VisaCaseInitial = {
    name,
    email: row.email,
    nationality,
    hasVisa,
    visaLabel: currentVisaLabel,
    currentlyInKorea: row.currently_in_korea,
    skillLevel: row.skill_level,
    danceVideoUrl: row.dance_video_url,
    preferredLang: requestedLang(query.lang) ?? row.preferred_lang,
    followUpAnswers: row.follow_up_answers ?? {},
    followUpSubmittedAt: row.follow_up_submitted_at ?? null,
    caseStage: row.case_stage ?? "application_received",
    auditionAt: row.audition_at ?? null,
    auditionLocation: row.audition_location ?? null,
    auditionStatus: row.audition_status ?? "not_scheduled",
    auditionResult: row.audition_result ?? "pending",
    trainingRequired: row.training_required ?? null,
    trainingPartner: row.training_partner ?? null,
    trainingStartDate: row.training_start_date ?? null,
    trainingEndDate: row.training_end_date ?? null,
    trainingStatus: row.training_status ?? "not_required",
    monthlyEvaluationAt: row.monthly_evaluation_at ?? null,
    monthlyEvaluationResult: row.monthly_evaluation_result ?? "pending",
    nextAction: row.next_action ?? null,
    meetingAt: (meetingInvite?.meeting_at as string | null) ?? null,
    meetingUrl: (meetingInvite?.meeting_url as string | null) ?? null,
    paymentStatus,
    paymentProductSlug,
    paymentUrl,
    paymentAmountKrw: row.payment_amount_krw ?? null,
    paidAt: row.paid_at ?? null,
    villageDepositStatus: (villageRow?.deposit_status as string | null) ?? "none",
    villageDepositPaidAt: (villageRow?.deposit_paid_at as string | null) ?? null,
    basePriceKrw: row.base_price_krw ?? 4_000_000,
    quotedPriceKrw: row.quoted_price_krw ?? null,
    declinedAt: row.declined_at ?? null,
    declineReason: row.decline_reason ?? null,
    declineReasonDetail: row.decline_reason_detail ?? null,
  };

  return (
    <VisaCasePortal
      token={token}
      initial={initial}
      declineRequested={declineRequested}
      editRequested={editRequested}
    />
  );
}
