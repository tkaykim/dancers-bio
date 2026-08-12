export const ROSTER_ACCESS_PURPOSES = [
  {
    value: "profile_check",
    label: "내 프로필이 잘 등록되었는지 확인하고 싶어요",
    description: "내 공개 프로필 링크를 확인하고 SNS에 공유할 수 있어요.",
  },
  {
    value: "casting",
    label: "캐스팅·섭외할 댄서나 팀을 찾고 있어요",
    description: "프로젝트와 찾는 조건을 남겨주시면 검토 후 연락드려요.",
  },
  {
    value: "collaboration",
    label: "협업·제휴를 제안하고 싶어요",
    description: "제안 내용을 남겨주시면 담당자가 확인 후 연락드려요.",
  },
] as const;

export type RosterAccessPurpose =
  (typeof ROSTER_ACCESS_PURPOSES)[number]["value"];

export function rosterAccessPurposeLabel(purpose: RosterAccessPurpose): string {
  return (
    ROSTER_ACCESS_PURPOSES.find((item) => item.value === purpose)?.label ??
    purpose
  );
}
