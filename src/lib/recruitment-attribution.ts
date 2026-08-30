export const RECRUITMENT_ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const COOKIE_PREFIX = "deetz_rc_";
const SHARE_CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type RecruitmentChannelProjectRef = {
  project_id: string | null;
  legacy_project_id: string | null;
  status: string;
};

type RecruitmentChannelLinkRecord = RecruitmentChannelProjectRef & {
  share_code: string;
};

type RecruitmentProjectLinkRecord = {
  short_code: string;
  deleted_at: string | null;
};

export type RecruitmentChannelDestination = {
  projectId: string;
  projectShortCode: string;
  shareCode: string;
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

export function shouldStoreRecruitmentAttributionCookie({
  storedShareCode,
  incomingShareCode,
}: {
  storedShareCode: string | null | undefined;
  incomingShareCode: string;
}): boolean {
  const stored = normalizeRecruitmentShareCode(storedShareCode);
  return stored !== incomingShareCode;
}

export async function resolveRecruitmentChannelDestination({
  shareCode,
  findChannel,
  findProject,
}: {
  shareCode: string | null | undefined;
  findChannel: (
    normalizedShareCode: string,
  ) => Promise<RecruitmentChannelLinkRecord | null>;
  findProject: (
    projectId: string,
  ) => Promise<RecruitmentProjectLinkRecord | null>;
}): Promise<RecruitmentChannelDestination | null> {
  const normalizedShareCode = normalizeRecruitmentShareCode(shareCode);
  if (!normalizedShareCode) return null;

  const channel = await findChannel(normalizedShareCode);
  if (!channel || channel.status !== "active") return null;

  const projectId = channel.legacy_project_id || channel.project_id;
  if (!projectId) return null;

  const project = await findProject(projectId);
  if (!project || project.deleted_at) return null;

  return {
    projectId,
    projectShortCode: project.short_code,
    shareCode: normalizedShareCode,
  };
}
