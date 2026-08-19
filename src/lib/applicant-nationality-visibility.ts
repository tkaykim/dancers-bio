export type ApplicantNationalityAccess =
  | "consented"
  | "platform_admin"
  | "not_disclosed";

/**
 * 지원서별 공개 동의를 우선하고, 미동의·기능 도입 전 지원서는 플랫폼
 * 슈퍼관리자에게만 현재 비공개 프로필 국적을 보여준다.
 */
export function resolveApplicantNationalityAccess(
  hasApplicationConsent: boolean,
  isPlatformAdmin: boolean,
): ApplicantNationalityAccess {
  if (hasApplicationConsent) return "consented";
  if (isPlatformAdmin) return "platform_admin";
  return "not_disclosed";
}
