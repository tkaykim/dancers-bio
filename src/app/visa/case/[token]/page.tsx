import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VisaCasePortal, type VisaCaseInitial } from "@/components/visa/VisaCasePortal";
import { visaLabel } from "@/lib/data/korea-visas";
import { verifyVisaCaseToken } from "@/lib/quick-token";
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
  searchParams: Promise<{ lang?: string | string[]; decline?: string | string[] }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const declineRequested =
    (Array.isArray(query.decline) ? query.decline[0] : query.decline) === "1";
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
    basePriceKrw: row.base_price_krw ?? 4_000_000,
    quotedPriceKrw: row.quoted_price_krw ?? null,
    declinedAt: row.declined_at ?? null,
    declineReason: row.decline_reason ?? null,
    declineReasonDetail: row.decline_reason_detail ?? null,
  };

  return <VisaCasePortal token={token} initial={initial} declineRequested={declineRequested} />;
}
