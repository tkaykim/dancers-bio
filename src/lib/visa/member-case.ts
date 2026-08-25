import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type PrivateNationality = {
  dancer_id: string;
  nationality_code: string | null;
  is_korean_national: boolean | null;
};

export type MemberVisaApplication = Record<string, unknown> & {
  id: string;
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
  created_at: string;
};

export type MemberVisaAccess = {
  eligible: boolean;
  application: MemberVisaApplication | null;
  dancerName: string | null;
};

function nationalitySignal(row: PrivateNationality | undefined): "kr" | "foreign" | "unknown" {
  if (!row) return "unknown";
  if (row.is_korean_national === true || row.nationality_code?.toUpperCase() === "KR") return "kr";
  if (row.is_korean_national === false) return "foreign";
  if (row.nationality_code?.trim()) return "foreign";
  return "unknown";
}

export async function loadMemberVisaAccess(userId: string): Promise<MemberVisaAccess> {
  const supabase = await createClient();
  // 기존 공개 신청과 새 로그인 계정을 인증 이메일로 연결한다.
  // RPC는 명시적 외국인 신청만 현재 auth.uid()에 연결한다.
  await supabase.rpc("claim_my_visa_applications");

  const admin = createAdminClient();
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

  const privateMap = new Map<string, PrivateNationality>();
  const dancerNameMap = new Map<string, { stage_name: string | null; korean_name: string | null }>();
  for (const dancer of ownedDancers) {
    dancerNameMap.set(dancer.id, dancer);
  }
  if (dancerIds.length > 0) {
    const [{ data: privateRows }, { data: dancerRows }] = await Promise.all([
      admin
        .from("dancer_private_info")
        .select("dancer_id, nationality_code, is_korean_national")
        .in("dancer_id", dancerIds),
      admin
        .from("dancers")
        .select("id, stage_name, korean_name")
        .in("id", dancerIds),
    ]);
    for (const row of (privateRows ?? []) as unknown as PrivateNationality[]) {
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
  if (hasKoreanSignal) return { eligible: false, application: null, dancerName: null };

  const application = applications.find(
    (item) => item.dancer_id && nationalitySignal(privateMap.get(item.dancer_id)) === "foreign",
  ) ?? null;
  const hasForeignProfile = ownedDancers.some(
    (dancer) => nationalitySignal(privateMap.get(dancer.id)) === "foreign",
  );
  const applicationDancer = application?.dancer_id
    ? dancerNameMap.get(application.dancer_id)
    : null;
  const firstDancer = applicationDancer ?? ownedDancers[0] ?? null;

  return {
    eligible: Boolean(application || hasForeignProfile),
    application,
    dancerName: firstDancer?.stage_name ?? firstDancer?.korean_name ?? null,
  };
}
