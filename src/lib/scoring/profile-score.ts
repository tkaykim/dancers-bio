/**
 * 프로필 완성도 점수 (P, 0~20).
 *
 * ⚠️ 이 점수는 **댄서 본인에게 공개해도 되는 유일한 점수**다.
 *   - 내부 평가(경력점수 dancer_scores, 현장 신뢰도, 종합 DQS)는 절대 공개 금지.
 *   - 여기 담긴 건 "본인이 입력했거나 입력하지 않은 사실"뿐이라 다툼의 여지가 없고,
 *     오히려 보여줘야 프로필을 채운다.
 * 자세한 정책은 docs/QUALITY_PLAN.md §4 (노출 정책) 참조.
 *
 * 순수 함수 — DB/네트워크 접근 없음.
 */

export type ProfileScoreInput = {
  profileImg: string | null;
  genres: string[] | null;
  bio: string | null;
  socialLinks: Record<string, unknown> | null;
  careerCount: number;
  /** details->>'link' 가 있는 경력 수 (영상 있는 경력) */
  careerWithVideoCount: number;
  hasPhone: boolean;
};

export type ProfileScoreItem = {
  key: string;
  label: string;
  /** 이 항목 만점 */
  max: number;
  /** 획득 점수 (부분 점수 가능) */
  earned: number;
  /** 미완료 시 본인에게 보여줄 안내 문구 */
  hint: string;
};

export type ProfileScoreResult = {
  score: number;
  max: number;
  /** 0~100 백분율 (UI 표시용) */
  percent: number;
  items: ProfileScoreItem[];
  /** 아직 못 채운 항목 (점수 높은 순) */
  missing: ProfileScoreItem[];
};

export const PROFILE_SCORE_MAX = 20;

function hasText(v: string | null, min = 1): boolean {
  return !!v && v.trim().length >= min;
}

function socialCount(links: Record<string, unknown> | null): number {
  if (!links) return 0;
  return Object.values(links).filter(
    (v) => typeof v === "string" && v.trim().length > 0,
  ).length;
}

/**
 * 항목별 배점은 "캐스팅 전환에 실제로 영향을 주는 순서"로 설계했다.
 * 사진 없는 프로필은 목록에서 사실상 클릭되지 않고(=승인 하드게이트),
 * 영상 있는 경력은 섭외 결정에 가장 크게 작용한다.
 */
export function scoreProfile(input: ProfileScoreInput): ProfileScoreResult {
  const items: ProfileScoreItem[] = [];

  items.push({
    key: "photo",
    label: "프로필 사진",
    max: 4,
    earned: hasText(input.profileImg) ? 4 : 0,
    hint: "얼굴이 잘 보이는 사진을 올려주세요. 사진이 없으면 목록에 노출되지 않습니다.",
  });

  items.push({
    key: "genres",
    label: "장르",
    max: 2,
    earned: (input.genres?.length ?? 0) > 0 ? 2 : 0,
    hint: "주력 장르를 1개 이상 선택하면 맞는 공고 알림을 받을 수 있어요.",
  });

  items.push({
    key: "bio",
    label: "소개글",
    max: 2,
    earned: hasText(input.bio, 20) ? 2 : 0,
    hint: "20자 이상으로 본인을 소개해 주세요.",
  });

  const sns = socialCount(input.socialLinks);
  items.push({
    key: "social",
    label: "SNS 링크",
    max: 2,
    earned: sns > 0 ? 2 : 0,
    hint: "인스타그램 등 활동 계정을 연결해 주세요.",
  });

  // 경력은 단계 점수 — 1건만 있어도 절반은 인정한다(첫 등록 진입장벽 완화).
  const careerEarned = input.careerCount >= 3 ? 4 : input.careerCount >= 1 ? 2 : 0;
  items.push({
    key: "careers",
    label: "경력 3건 이상",
    max: 4,
    earned: careerEarned,
    hint:
      input.careerCount === 0
        ? "참여한 작업을 경력으로 등록해 주세요."
        : "경력을 3건 이상 채우면 점수가 올라갑니다.",
  });

  items.push({
    key: "video",
    label: "영상이 있는 경력",
    max: 3,
    earned: input.careerWithVideoCount >= 1 ? 3 : 0,
    hint: "경력에 영상 링크를 1개 이상 추가해 주세요. 섭외에 가장 큰 영향을 줍니다.",
  });

  items.push({
    key: "phone",
    label: "연락처",
    max: 3,
    earned: input.hasPhone ? 3 : 0,
    hint: "휴대폰 번호를 등록해야 캐스팅 연락과 알림을 받을 수 있어요.",
  });

  const score = items.reduce((sum, it) => sum + it.earned, 0);
  const max = items.reduce((sum, it) => sum + it.max, 0);

  return {
    score,
    max,
    percent: max > 0 ? Math.round((score / max) * 100) : 0,
    items,
    missing: items
      .filter((it) => it.earned < it.max)
      .sort((a, b) => b.max - a.max),
  };
}
