import type { Messages } from "../t";

/**
 * 프로필 만들기 온보딩(`/onboarding/*`) 문구.
 * 위저드 컴포넌트(`components/portfolio/onboarding/*`)의 문구는 S3 에서 이 네임스페이스로 옮긴다.
 * `meta.create_grigo` 는 GRIGO 화이트라벨 호스트에서만 쓰는 탭 제목이다(brandMetadata).
 */
const ko = {
  "meta.create_grigo": "GRIGO ENT 정산 · 프로필 만들기",
} as const;

type Key = keyof typeof ko;

const en: Record<Key, string> = {
  "meta.create_grigo": "GRIGO ENT payouts · Create your profile",
};

const ja: Record<Key, string> = {
  "meta.create_grigo": "GRIGO ENT 精算 · プロフィール作成",
};

const messages = { ko, en, ja } satisfies Messages<Key>;
export default messages;
