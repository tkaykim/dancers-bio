import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, FileText, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadMemberVisaAccess } from "@/lib/visa/member-case";
import { isPaidVisaDocumentCase } from "@/lib/visa/document-products";
import { makeVisaCaseToken } from "@/lib/quick-token";
import {
  makeVisaPaymentUrl,
  VISA_PAYMENT_PAGES,
  type VisaPaymentProductSlug,
} from "@/lib/visa/payment-link";
import { VisaMemberDashboard } from "@/components/visa/VisaMemberDashboard";
import type { JourneyData, VisaJourneyLang } from "@/components/visa/VisaJourneyTimeline";

export const metadata = { title: "Visa & Korea | deetz" };

function stringValue(row: Record<string, unknown>, key: string): string | null {
  return typeof row[key] === "string" ? row[key] : null;
}

function booleanValue(row: Record<string, unknown>, key: string): boolean | null {
  return typeof row[key] === "boolean" ? row[key] : null;
}

function objectValue(row: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function applicantNote(value: string | null): string | null {
  const note = value?.trim();
  if (!note) return null;
  if (note.includes("결제 링크 발송") || note.includes("결제 완료") || note.includes("결제 취소")) return null;
  if (/^(온라인\s*(미팅|상담)\s*예정|온라인 미팅 완료.*)$/i.test(note)) return null;
  return note;
}

export default async function MemberVisaPage() {
  const user = await requireUser();
  const access = await loadMemberVisaAccess(user.id);
  if (!access.eligible) redirect("/me");

  if (!access.application) {
    return (
      <div className="px-5 pb-12 pt-6 md:mx-auto md:max-w-2xl md:px-6">
        <Link href="/me" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-foreground">
          <ArrowLeft className="size-4" />
          My page
        </Link>
        <section className="mt-6 rounded-2xl border border-primary/25 bg-card p-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Visa &amp; Korea</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Start with the visa program guide</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            Your nationality profile is eligible to view this area, but no visa program case is connected to your account yet.
          </p>
          <Link href="/program?lang=en" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">
            View the program
            <ExternalLink className="size-4" />
          </Link>
          <p className="mt-4 text-xs leading-relaxed text-ink-3">
            Program participation does not guarantee a visa, employment, or project placement.
          </p>
        </section>
      </div>
    );
  }

  const row = access.application;
  const admin = createAdminClient();
  const applicationId = row.id;
  const [{ data: meetingInvite }, { data: villageRow }] = await Promise.all([
    admin
      .from("visa_meeting_invites")
      .select("meeting_at, meeting_url")
      .eq("application_id", applicationId)
      .eq("status", "sent")
      .order("meeting_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("village_waitlist")
      .select("deposit_status, deposit_paid_at")
      .eq("visa_application_id", applicationId)
      .maybeSingle(),
  ]);

  const paymentMeta = objectValue(row, "payment_meta");
  const issuedSlug = typeof paymentMeta.issued_product_slug === "string"
    ? paymentMeta.issued_product_slug
    : "audition-fee";
  const paymentProductSlug: VisaPaymentProductSlug = issuedSlug in VISA_PAYMENT_PAGES
    ? issuedSlug as VisaPaymentProductSlug
    : "audition-fee";
  const paymentStatus = stringValue(row, "payment_status") ?? "unpaid";
  const documentFormReady = isPaidVisaDocumentCase(row);
  let paymentUrl: string | null = null;
  if (paymentStatus === "link_sent") {
    try {
      paymentUrl = makeVisaPaymentUrl(applicationId, paymentProductSlug);
    } catch (error) {
      console.error("[me/visa] payment url 생성 실패 (non-fatal):", error);
    }
  }

  const answers = objectValue(row, "follow_up_answers");
  const settlementNeeds = Array.isArray(answers.settlementNeeds)
    ? answers.settlementNeeds.filter((value): value is string => typeof value === "string")
    : [];
  const defaultLangRaw = stringValue(row, "preferred_lang");
  const defaultLang: VisaJourneyLang =
    defaultLangRaw === "ja" || defaultLangRaw === "ko" ? defaultLangRaw : "en";
  const documentCta = {
    ko: {
      title: "비자 서류 정보",
      body: "서류 준비에 필요한 정보를 안전하게 제출해 주세요. 작성 내용은 자동으로 임시 저장됩니다.",
      action: "서류 작성하기",
    },
    en: {
      title: "Visa document information",
      body: "Submit the information needed to prepare your documents. Your progress is saved automatically.",
      action: "Open document form",
    },
    ja: {
      title: "ビザ書類情報",
      body: "書類準備に必要な情報をご提出ください。入力内容は自動的に一時保存されます。",
      action: "書類フォームを開く",
    },
  }[defaultLang];
  const data: JourneyData = {
    followUpSubmittedAt: stringValue(row, "follow_up_submitted_at"),
    caseStage: stringValue(row, "case_stage") ?? "application_received",
    meetingAt: (meetingInvite?.meeting_at as string | null) ?? null,
    meetingUrl: (meetingInvite?.meeting_url as string | null) ?? null,
    auditionAt: stringValue(row, "audition_at"),
    auditionLocation: stringValue(row, "audition_location"),
    auditionStatus: stringValue(row, "audition_status") ?? "not_scheduled",
    auditionResult: stringValue(row, "audition_result") ?? "pending",
    auditionEndsAt: stringValue(row, "audition_ends_at"),
    auditionRsvp: stringValue(row, "audition_rsvp"),
    trainingRequired: booleanValue(row, "training_required"),
    trainingPartner: stringValue(row, "training_partner"),
    trainingStartDate: stringValue(row, "training_start_date"),
    trainingEndDate: stringValue(row, "training_end_date"),
    monthlyEvaluationAt: stringValue(row, "monthly_evaluation_at"),
    monthlyEvaluationResult: stringValue(row, "monthly_evaluation_result") ?? "pending",
    contractStatus: stringValue(row, "contract_status") ?? "not_started",
    basicDocumentsStatus: stringValue(row, "basic_documents_status") ?? "not_started",
    detailedDocumentsStatus: stringValue(row, "detailed_documents_status") ?? "not_started",
    visaIssuedAt: stringValue(row, "visa_issued_at"),
    visaType: access.visa?.visaType ?? null,
    visaTypeOther: access.visa?.visaTypeOther ?? null,
    visaExpiry: access.visa?.visaExpiry ?? null,
    paymentStatus,
    paymentProductSlug,
    paymentUrl,
    paymentAmountKrw: typeof row.payment_amount_krw === "number" ? row.payment_amount_krw : null,
    paidAt: stringValue(row, "paid_at"),
    wantsHousing: settlementNeeds.includes("housing"),
    villageDepositStatus: (villageRow?.deposit_status as string | null) ?? "none",
    villageDepositPaidAt: (villageRow?.deposit_paid_at as string | null) ?? null,
  };

  return (
    <div className="px-5 pb-12 pt-6 md:mx-auto md:max-w-2xl md:px-6">
      <Link href="/me" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-foreground">
        <ArrowLeft className="size-4" />
        My page
      </Link>
      <header className="mt-6">
        <div className="flex items-center gap-2 text-primary">
          <ShieldCheck className="size-5" />
          <p className="text-xs font-bold uppercase tracking-[0.16em]">Visa &amp; Korea</p>
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          {access.dancerName ? `${access.dancerName}'s visa program` : "Your visa program"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          Check the current milestone, assigned next action, meeting, and payment information in one place.
        </p>
      </header>

      <VisaMemberDashboard
        data={data}
        caseToken={makeVisaCaseToken(applicationId)}
        defaultLang={defaultLang}
        nextActionNote={applicantNote(stringValue(row, "next_action"))}
      />

      {documentFormReady ? (
        <section className="mt-5 rounded-2xl border border-primary/25 bg-primary/5 p-5">
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 size-5 text-primary" />
            <div className="min-w-0 flex-1">
              <h2 className="font-bold">{documentCta.title}</h2>
              <p className="mt-1 text-sm leading-6 text-ink-2">
                {documentCta.body}
              </p>
              <Link href="/me/visa/documents" className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">
                {documentCta.action}
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <p className="mt-4 px-1 text-xs leading-relaxed text-ink-3">
        The final visa decision and processing time are determined by Korea Immigration.
      </p>
    </div>
  );
}
