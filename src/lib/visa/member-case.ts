import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isPaidVisaDocumentCase } from "./document-products";

type PrivateNationality = {
  dancer_id: string;
  nationality_code: string | null;
  is_korean_national: boolean | null;
};

type PrivateVisaRow = PrivateNationality & {
  has_visa: boolean | null;
  visa_type: string | null;
  visa_type_other: string | null;
  visa_expiry: string | null;
};

export type MemberVisaDetails = {
  hasVisa: boolean | null;
  visaType: string | null;
  visaTypeOther: string | null;
  visaExpiry: string | null;
};

export type MemberVisaApplication = Record<string, unknown> & {
  id: string;
  email: string;
  dancer_id: string | null;
  preferred_lang: string | null;
  case_stage: string | null;
  audition_result: string | null;
  monthly_evaluation_result: string | null;
  contract_status: string | null;
  basic_documents_status: string | null;
  detailed_documents_status: string | null;
  visa_issued_at: string | null;
  payment_status: string | null;
  payment_meta: Record<string, unknown> | null;
  source: string | null;
  external_training_order_id: string | null;
  program_product_slug: string | null;
  created_at: string;
};

export type MemberVisaAccess = {
  eligible: boolean;
  application: MemberVisaApplication | null;
  dancerName: string | null;
  visa: MemberVisaDetails | null;
};

function nationalitySignal(row: PrivateNationality | undefined): "kr" | "foreign" | "unknown" {
  if (!row) return "unknown";
  if (row.is_korean_national === true || row.nationality_code?.toUpperCase() === "KR") return "kr";
  if (row.is_korean_national === false) return "foreign";
  if (row.nationality_code?.trim()) return "foreign";
  return "unknown";
}

async function claimMemberVisaApplications({
  admin,
  userId,
  email,
}: {
  admin: ReturnType<typeof createAdminClient>;
  userId: string;
  email: string;
}) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return;

  // 내부 메모가 있는 신청 테이블에 회원 SELECT 정책을 열지 않는다.
  // 서버에서 미연결 후보의 최소 컬럼만 읽고 이메일은 JS에서 완전 일치로 비교한다.
  const { data: candidatesRaw } = await admin
    .from("dancer_visa_applications")
    .select(
      "id, email, dancer_id, source, payment_status, payment_meta, external_training_order_id, program_product_slug",
    )
    .is("applicant_profile_id", null)
    .order("created_at", { ascending: false })
    .limit(1000);
  const candidates = (candidatesRaw ?? []) as unknown as Array<{
    id: string;
    email: string;
    dancer_id: string | null;
    source: string | null;
    payment_status: string | null;
    payment_meta: Record<string, unknown> | null;
    external_training_order_id: string | null;
    program_product_slug: string | null;
  }>;
  const emailMatches = candidates.filter(
    (application) => application.email.trim().toLowerCase() === normalizedEmail,
  );
  const dancerIds = Array.from(new Set(
    emailMatches.map((application) => application.dancer_id).filter((id): id is string => Boolean(id)),
  ));
  let privateRows: PrivateNationality[] = [];
  if (dancerIds.length > 0) {
    const { data } = await admin
      .from("dancer_private_info")
      .select("dancer_id, nationality_code, is_korean_national")
      .in("dancer_id", dancerIds);
    privateRows = (data ?? []) as unknown as PrivateNationality[];
  }
  const foreignDancerIds = new Set(
    privateRows
      .filter((row) => nationalitySignal(row) === "foreign")
      .map((row) => row.dancer_id),
  );
  const applicationIds = emailMatches
    .filter((application) => (
      (application.dancer_id && foreignDancerIds.has(application.dancer_id)) ||
      isPaidVisaDocumentCase(application)
    ))
    .map((application) => application.id);
  if (applicationIds.length === 0) return;

  await admin
    .from("dancer_visa_applications")
    .update({ applicant_profile_id: userId })
    .in("id", applicationIds)
    .is("applicant_profile_id", null);
}

export async function loadMemberVisaAccess(userId: string): Promise<MemberVisaAccess> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: authData } = await supabase.auth.getUser();
  const account = authData.user;
  if (
    account?.id === userId &&
    account.email &&
    account.email_confirmed_at
  ) {
    await claimMemberVisaApplications({ admin, userId, email: account.email });
  }

  const [{ data: applicationsRaw }, { data: ownedDancersRaw }] = await Promise.all([
    admin
      .from("dancer_visa_applications")
      .select("*")
      .eq("applicant_profile_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("dancers")
      .select("id, stage_name, korean_name")
      .eq("profile_id", userId)
      .order("created_at", { ascending: true })
      .limit(20),
  ]);

  const applications = (applicationsRaw ?? []) as unknown as MemberVisaApplication[];
  const ownedDancers = (ownedDancersRaw ?? []) as unknown as Array<{
    id: string;
    stage_name: string | null;
    korean_name: string | null;
  }>;
  const dancerIds = Array.from(new Set([
    ...ownedDancers.map((dancer) => dancer.id),
    ...applications.map((application) => application.dancer_id).filter((id): id is string => Boolean(id)),
  ]));

  const privateMap = new Map<string, PrivateVisaRow>();
  const dancerNameMap = new Map<string, { stage_name: string | null; korean_name: string | null }>();
  for (const dancer of ownedDancers) {
    dancerNameMap.set(dancer.id, dancer);
  }
  if (dancerIds.length > 0) {
    const [{ data: privateRows }, { data: dancerRows }] = await Promise.all([
      admin
        .from("dancer_private_info")
        .select("dancer_id, nationality_code, is_korean_national, has_visa, visa_type, visa_type_other, visa_expiry")
        .in("dancer_id", dancerIds),
      admin
        .from("dancers")
        .select("id, stage_name, korean_name")
        .in("id", dancerIds),
    ]);
    for (const row of (privateRows ?? []) as unknown as PrivateVisaRow[]) {
      privateMap.set(row.dancer_id, row);
    }
    for (const dancer of (dancerRows ?? []) as unknown as Array<{
      id: string;
      stage_name: string | null;
      korean_name: string | null;
    }>) {
      dancerNameMap.set(dancer.id, dancer);
    }
  }

  // 본인 소유 프로필에 한국 국적 신호가 하나라도 있으면 비자 메뉴를 강제로 숨긴다.
  const hasKoreanSignal = ownedDancers.some(
    (dancer) => nationalitySignal(privateMap.get(dancer.id)) === "kr",
  );
  if (hasKoreanSignal) return { eligible: false, application: null, dancerName: null, visa: null };

  const application = applications.find(
    (item) =>
      (item.dancer_id && nationalitySignal(privateMap.get(item.dancer_id)) === "foreign") ||
      isPaidVisaDocumentCase(item),
  ) ?? null;
  const hasForeignProfile = ownedDancers.some(
    (dancer) => nationalitySignal(privateMap.get(dancer.id)) === "foreign",
  );
  const applicationDancer = application?.dancer_id
    ? dancerNameMap.get(application.dancer_id)
    : null;
  const firstDancer = applicationDancer ?? ownedDancers[0] ?? null;
  const visaDancerId = application?.dancer_id ?? ownedDancers.find(
    (dancer) => nationalitySignal(privateMap.get(dancer.id)) === "foreign",
  )?.id ?? null;
  const visaRow = visaDancerId ? privateMap.get(visaDancerId) : null;
  const paymentMeta = application?.payment_meta ?? {};
  const paidCustomerName = typeof paymentMeta.customer_name === "string"
    ? paymentMeta.customer_name.trim()
    : null;

  return {
    eligible: Boolean(application || hasForeignProfile),
    application,
    dancerName: firstDancer?.stage_name ?? firstDancer?.korean_name ?? paidCustomerName ?? null,
    visa: visaRow ? {
      hasVisa: visaRow.has_visa,
      visaType: visaRow.visa_type,
      visaTypeOther: visaRow.visa_type_other,
      visaExpiry: visaRow.visa_expiry,
    } : null,
  };
}
