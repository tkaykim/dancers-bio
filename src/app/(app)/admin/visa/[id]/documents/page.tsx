import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileImage, FileText, LockKeyhole } from "lucide-react";
import { requireProfile } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptVisaDocumentSensitiveData } from "@/lib/visa/document-intake-crypto";
import {
  joinVisaDocumentData,
  type VisaDocumentFormData,
} from "@/lib/visa/document-intake-schema";
import { VISA_DOCUMENTS_BUCKET, formatVisaAttachmentSize, type VisaAttachmentKind } from "@/lib/visa/document-attachments";

export const metadata = { title: "비자 서류 제출 내용 | deetz admin" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "작성 중",
  submitted: "제출 완료",
  needs_revision: "수정 요청",
  accepted: "검토 완료",
};

const EDUCATION_LABEL: Record<string, string> = {
  high_school: "고등학교 졸업",
  bachelor: "대학교 졸업",
  master: "석사",
  doctorate: "박사",
};

const MARITAL_LABEL: Record<string, string> = {
  married: "기혼",
  divorced: "이혼",
  single: "미혼",
};

const ATTACHMENT_LABEL: Record<VisaAttachmentKind, string> = {
  passport_copy: "여권 사본",
  dancer_profile: "개인 댄서 프로필",
  id_photo: "증명사진",
  activity_photo: "주요 활동 실적 사진",
};

type AttachmentRow = {
  id: string;
  kind: VisaAttachmentKind;
  sort_order: number;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
};

function display(value: unknown): string {
  if (value === true) return "예";
  if (value === false) return "아니요";
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function Row({ label, value, sensitive = false }: { label: string; value: unknown; sensitive?: boolean }) {
  return (
    <div className="grid gap-1 border-b border-border py-3 last:border-b-0 md:grid-cols-[180px_1fr] md:gap-5">
      <dt className="text-xs font-semibold text-ink-3">{label}</dt>
      <dd className={sensitive ? "break-all font-mono text-sm font-semibold" : "whitespace-pre-wrap text-sm text-foreground"}>
        {display(value)}
      </dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
      <h2 className="text-base font-bold">{title}</h2>
      <dl className="mt-3">{children}</dl>
    </section>
  );
}

function PassportRows({ passport, prefix }: {
  passport: VisaDocumentFormData["primaryPassport"];
  prefix?: string;
}) {
  const label = prefix ? `${prefix} ` : "";
  return (
    <>
      <Row label={`${label}여권 종류`} value={passport.type} />
      <Row label={`${label}여권번호`} value={passport.number} sensitive />
      <Row label={`${label}발급국가`} value={passport.issuingCountry} />
      <Row label={`${label}만료일`} value={passport.expiryDate} />
    </>
  );
}

export default async function AdminVisaDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile();
  if (!profile.is_admin) notFound();

  const { id } = await params;
  const admin = createAdminClient();
  const [{ data: application }, { data: intake }, { data: attachmentsRaw }] = await Promise.all([
    admin
      .from("dancer_visa_applications")
      .select("id, email")
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("visa_document_intakes")
      .select("status, form_data, sensitive_data_ciphertext, last_saved_at, submitted_at")
      .eq("application_id", id)
      .maybeSingle(),
    admin
      .from("visa_document_attachments")
      .select("id, kind, sort_order, storage_path, original_name, mime_type, size_bytes")
      .eq("application_id", id)
      .order("kind")
      .order("sort_order"),
  ]);
  if (!application || !intake) notFound();

  const sensitive = intake.sensitive_data_ciphertext
    ? decryptVisaDocumentSensitiveData(id, intake.sensitive_data_ciphertext)
    : null;
  const form = joinVisaDocumentData(intake.form_data, sensitive);
  const attachmentRows = (attachmentsRaw ?? []) as AttachmentRow[];
  const attachments = await Promise.all(attachmentRows.map(async (attachment) => {
    const { data } = await admin.storage
      .from(VISA_DOCUMENTS_BUCKET)
      .createSignedUrl(attachment.storage_path, 900);
    return { ...attachment, viewUrl: data?.signedUrl ?? null };
  }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 pb-16">
      <Link href="/admin/visa" className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-3 hover:text-foreground">
        <ArrowLeft className="size-4" />
        비자 신청 관리로 돌아가기
      </Link>

      <header className="rounded-2xl border border-primary/25 bg-primary/5 p-5 md:p-6">
        <div className="flex items-center gap-2 text-primary">
          <LockKeyhole className="size-4" />
          <p className="text-xs font-bold">관리자 전용 민감정보</p>
        </div>
        <h1 className="mt-2 text-2xl font-bold">비자 서류 제출 내용</h1>
        <p className="mt-2 text-sm leading-6 text-ink-2">
          여권번호와 본국 국가식별번호가 포함되어 있습니다.
          업무에 필요한 범위에서만 열람하고 외부 메신저나 개인 저장공간으로 옮기지 마세요.
        </p>
        <dl className="mt-4 grid gap-2 text-sm md:grid-cols-2">
          <Row label="로그인 이메일" value={application.email} />
          <Row label="제출 상태" value={STATUS_LABEL[intake.status] ?? intake.status} />
          <Row label="마지막 저장" value={intake.last_saved_at} />
          <Row label="제출 시각" value={intake.submitted_at} />
        </dl>
      </header>

      <Section title="1. 기본 인적사항">
        <Row label="영문 성명" value={form.fullNameEnglish} />
        <Row label="한자 성명" value={form.hanjaName} />
        <Row label="생년월일" value={form.birthDate} />
        <Row label="휴대폰 번호" value={form.mobilePhone} />
        <Row label="자택 전화번호" value={form.hasNoHomePhone ? "없음" : form.homePhone} />
        <Row label="본국 주소" value={form.homeCountryAddress} />
        <Row label="현재 거주지 주소" value={form.currentResidenceDifferent ? form.currentResidenceAddress : "본국 주소와 동일"} />
        <Row label="한국 체류 예정 주소" value={form.koreaPlannedAddress} />
        <Row label="본국 국가식별번호" value={form.nationalIdNotApplicable ? "해당 없음" : form.nationalIdNumber} sensitive />
      </Section>

      <Section title="2. 국적·여권">
        <Row label="복수 국적" value={form.dualNationality ? form.dualNationalityCountries.join(", ") : "없음"} />
        <PassportRows passport={form.primaryPassport} />
        {form.otherPassports.map((passport, index) => (
          <PassportRows key={passport.id} passport={passport} prefix={`추가 여권 ${index + 1}`} />
        ))}
        <Row
          label="과거 한국 출입국 시 다른 성명"
          value={form.usedOtherNameInKorea ? form.previousNames.map((name) => name.fullNameEnglish).join(", ") : "없음"}
        />
      </Section>

      <Section title="3. 비상 연락처">
        <Row label="이름" value={form.emergencyContact.nameEnglish} />
        <Row label="전화번호" value={form.emergencyContact.phone} />
        <Row label="거주 국가" value={form.emergencyContact.country} />
        <Row label="관계" value={form.emergencyContact.relationship} />
      </Section>

      <Section title="4. 학력">
        <Row label="최종 학력" value={EDUCATION_LABEL[form.education.level] ?? form.education.level} />
        <Row label="학교 이름" value={form.education.schoolName} />
        <Row label="학교 소재지" value={[form.education.city, form.education.region, form.education.country].filter(Boolean).join(" / ")} />
      </Section>

      <Section title="5. 혼인 및 가족">
        <Row label="혼인 사항" value={MARITAL_LABEL[form.maritalStatus] ?? form.maritalStatus} />
        {form.maritalStatus === "married" ? (
          <>
            <Row label="배우자 성명" value={form.spouse.nameEnglish} />
            <Row label="배우자 생년월일" value={form.spouse.birthDate} />
            <Row label="배우자 국적" value={form.spouse.nationality} />
            <Row label="배우자 거주지" value={form.spouse.residence} />
            <Row label="배우자 연락처" value={form.spouse.phone} />
          </>
        ) : null}
        <Row label="자녀" value={form.hasChildren ? `${form.childrenCount}명` : "없음"} />
        <Row
          label="한국에 있는 가족"
          value={form.hasFamilyInKorea
            ? form.familyInKorea.map((member) => `${member.nameEnglish} / ${member.birthDate} / ${member.nationality} / ${member.relationship}`).join("\n")
            : "없음"}
        />
        <Row
          label="동반 가족"
          value={form.hasAccompanyingFamily
            ? form.accompanyingFamily.map((member) => member.relationship).join(", ")
            : "없음"}
        />
      </Section>

      <Section title="6. 최근 5년간 한국 방문">
        <Row label="총 방문 횟수" value={`${form.koreaVisitCountLast5Years}회`} />
        <Row label="최근 방문 목적" value={form.latestKoreaVisit.purpose} />
        <Row label="최근 방문 기간" value={[form.latestKoreaVisit.startDate, form.latestKoreaVisit.endDate].filter(Boolean).join(" ~ ")} />
      </Section>

      <Section title="7. 최근 5년간 한국 외 해외 방문">
        <Row
          label="방문 기록"
          value={form.otherInternationalTravel.length > 0
            ? form.otherInternationalTravel.map((trip) => `${trip.country} / ${trip.purpose} / ${trip.startDate} ~ ${trip.endDate}`).join("\n")
            : "없음"}
        />
        <Row label="민감정보 수집 동의" value={form.sensitiveCollectionConsent} />
        <Row label="사실 확인" value={form.truthfulnessConfirmed} />
      </Section>

      <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-base font-bold">8. 첨부자료</h2>
          <p className="text-xs font-semibold text-ink-3">총 {attachments.length}개</p>
        </div>
        {attachments.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {attachments.map((attachment) => (
              <article key={attachment.id} className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-start gap-3">
                  {attachment.mime_type === "application/pdf" ? <FileText className="mt-0.5 size-5 shrink-0 text-primary" /> : <FileImage className="mt-0.5 size-5 shrink-0 text-primary" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-primary">
                      {ATTACHMENT_LABEL[attachment.kind]}
                      {attachment.kind === "activity_photo" ? ` ${attachment.sort_order + 1}` : ""}
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold">{attachment.original_name}</p>
                    <p className="mt-1 text-xs text-ink-3">{formatVisaAttachmentSize(Number(attachment.size_bytes))}</p>
                  </div>
                </div>
                {attachment.viewUrl ? (
                  <a href={attachment.viewUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary underline underline-offset-4">
                    <ExternalLink className="size-3.5" />파일 열기
                  </a>
                ) : <p className="mt-3 text-xs text-destructive">파일 링크를 생성하지 못했습니다.</p>}
              </article>
            ))}
          </div>
        ) : <p className="mt-4 text-sm text-ink-3">첨부된 파일이 없습니다.</p>}
      </section>
    </div>
  );
}
