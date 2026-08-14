/**
 * 승인 트리아지 — pending 댄서를 A/B/C/REVIEW 로 자동 분류한다.
 *
 * 원칙 (docs/QUALITY_PLAN.md §2):
 *   - 승인 게이트는 "명단에 올릴 최소 자격"만 본다. 실제 퀄리티 관리는 DQS(추천·정렬)로.
 *   - "미달"은 거절이 아니다. rejected 는 사칭·중복·본인요청 등 되돌릴 이유 없는 경우만.
 *   - 중복계정 후보는 등급과 무관하게 자동 승인에서 제외한다(승인하면 명단·추천·정산이 갈라짐).
 *
 * 순수 함수 — DB/네트워크 접근 없음.
 */

export type TriageTier = "A" | "B" | "C" | "REVIEW";

export type TriageInput = {
  stageName: string | null;
  profileImg: string | null;
  genres: string[] | null;
  socialLinks: Record<string, unknown> | null;
  careerCount: number;
  isVerified: boolean | null;
  hasAccount: boolean;
  /**
   * 강한 중복 신호 — 연락처가 다른 댄서와 완전히 일치.
   * 실측상 거의 전부 진짜 중복이라 승인 자체를 막는다.
   */
  duplicateStrong: boolean;
  /**
   * 약한 중복 신호 — 활동명만 겹침.
   * 댄스 신에서 활동명 충돌(채원·Minseo 등)이 흔해 동명이인이 많다.
   * 등급은 그대로 두고 배지만 달아, 관리자가 눈으로 거를 수 있게 한다.
   */
  duplicateWeak: boolean;
};

export type TriageResult = {
  tier: TriageTier;
  /** 관리자 화면에 그대로 노출할 사유 (한 줄씩) */
  reasons: string[];
  /** 일괄 승인 대상에 포함해도 되는가 (서버 권한 판정) */
  autoApprovable: boolean;
  /** 동명 프로필이 있어 기본 선택에서 빼야 하는가 (UI 기본값) */
  needsEyeball: boolean;
  label: string;
};

const TIER_LABEL: Record<TriageTier, string> = {
  A: "자동 승인 후보",
  B: "보완 요청",
  C: "정보 부족",
  REVIEW: "확인 필요",
};

function hasText(v: string | null): boolean {
  return !!v && v.trim().length > 0;
}

function socialCount(links: Record<string, unknown> | null): number {
  if (!links) return 0;
  return Object.values(links).filter(
    (v) => typeof v === "string" && v.trim().length > 0,
  ).length;
}

export function triageDancer(input: TriageInput): TriageResult {
  const reasons: string[] = [];
  const hasImg = hasText(input.profileImg);
  const hasGenre = (input.genres?.length ?? 0) > 0;
  const hasName = hasText(input.stageName);
  const sns = socialCount(input.socialLinks);

  // ① 연락처가 겹치는 중복은 무엇보다 먼저 걸러낸다 — 승인하면 되돌리기 어려운 오염이 된다.
  if (input.duplicateStrong) {
    reasons.push("연락처가 같은 프로필이 있음 — 병합 여부 확인 후 승인");
    return {
      tier: "REVIEW",
      reasons,
      autoApprovable: false,
      needsEyeball: true,
      label: TIER_LABEL.REVIEW,
    };
  }

  const needsEyeball = input.duplicateWeak;
  if (needsEyeball) reasons.push("동명 프로필 있음 — 동일인 여부 확인");

  // ② 하드 게이트 — 이게 없으면 명단에 올려도 아무도 클릭하지 않는다.
  if (!hasName) reasons.push("활동명 없음");
  if (!hasImg) reasons.push("프로필 사진 없음");
  if (!hasGenre) reasons.push("장르 없음");
  if (!hasName || !hasImg || !hasGenre) {
    return {
      tier: "C",
      reasons,
      autoApprovable: false,
      needsEyeball,
      label: TIER_LABEL.C,
    };
  }

  // ③ 실재성 — 경력이 있거나 관리자가 검증한 프로필이면 자동 승인 후보.
  //    SNS 링크 "존재"만으로는 실재성을 인정하지 않는다(대부분이 갖고 있어 게이트 역할을 못 함).
  if (input.careerCount >= 1) {
    reasons.push(`경력 ${input.careerCount}건`);
    return {
      tier: "A",
      reasons,
      autoApprovable: true,
      needsEyeball,
      label: TIER_LABEL.A,
    };
  }
  if (input.isVerified) {
    reasons.push("관리자 검증(is_verified) 프로필");
    return {
      tier: "A",
      reasons,
      autoApprovable: true,
      needsEyeball,
      label: TIER_LABEL.A,
    };
  }

  // ④ 사진·장르는 있으나 경력 0 — 거절이 아니라 보완 요청 대상.
  reasons.push("경력 0건 — 보완 요청 후 재판정");
  if (sns > 0) reasons.push(`SNS ${sns}건 연결됨`);
  if (!input.hasAccount) reasons.push("가입 계정 없음(큐레이션 프로필)");
  return {
    tier: "B",
    reasons,
    autoApprovable: false,
    needsEyeball,
    label: TIER_LABEL.B,
  };
}

/** 활동명 정규화 — 중복 후보 탐지용. 공백·기호·대소문자 차이를 지운다. */
export function normalizeName(name: string | null): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[\s._\-()[\]]/g, "")
    .trim();
}
