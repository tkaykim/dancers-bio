export const RECRUITMENT_ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const COOKIE_PREFIX = "deetz_rc_";
const SHARE_CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type RecruitmentChannelProjectRef = {
  project_id: string | null;
  legacy_project_id: string | null;
  status: string;
};

export type RecruitmentAttributionSource =
  | { kind: "id"; value: string }
  | { kind: "share_code"; value: string };

export function recruitmentAttributionCookieName(projectId: string): string {
  return `${COOKIE_PREFIX}${projectId}`;
}

export function normalizeRecruitmentShareCode(
  value: string | null | undefined,
): string | null {
  const normalized = (value ?? "").trim();
  return SHARE_CODE_PATTERN.test(normalized) ? normalized : null;
}

export function chooseRecruitmentAttributionSource({
  requestedChannelId,
  storedShareCode,
}: {
  requestedChannelId: string | null | undefined;
  storedShareCode: string | null | undefined;
}): RecruitmentAttributionSource | null {
  const channelId = (requestedChannelId ?? "").trim();
  if (channelId) return { kind: "id", value: channelId };

  const shareCode = normalizeRecruitmentShareCode(storedShareCode);
  return shareCode ? { kind: "share_code", value: shareCode } : null;
}

export function recruitmentChannelMatchesProject(
  channel: RecruitmentChannelProjectRef | null | undefined,
  projectId: string,
): boolean {
  if (!channel || channel.status !== "active") return false;
  return (
    channel.project_id === projectId || channel.legacy_project_id === projectId
  );
}
