export const EVENT_QR_PREFIX = "DEETZ-EVENT";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const BIB_PATTERN = /^[A-Z]-\d{1,3}$/i;

export function buildEventQrPayload(opsCode: string, passToken: string) {
  return `${EVENT_QR_PREFIX}:${opsCode}:${passToken}`;
}

export function extractEventQrCandidates(rawValue: string) {
  const value = rawValue.trim();
  const candidates = new Set<string>();

  if (!value) return [];

  candidates.add(value);

  const prefixMatch = value.match(new RegExp(`^${EVENT_QR_PREFIX}:[^:]+:(.+)$`, "i"));
  if (prefixMatch?.[1]) candidates.add(prefixMatch[1].trim());

  const uuidMatch = value.match(UUID_PATTERN);
  if (uuidMatch?.[0]) candidates.add(uuidMatch[0]);

  if (BIB_PATTERN.test(value)) candidates.add(value.toUpperCase());

  try {
    const url = new URL(value);
    for (const key of ["id", "participant", "participantId", "pass", "token", "qr", "code"]) {
      const param = url.searchParams.get(key);
      if (param) candidates.add(param.trim());
    }

    const hash = url.hash.replace(/^#/, "").trim();
    if (hash) candidates.add(hash);

    const segments = url.pathname.split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1];
    if (lastSegment) candidates.add(lastSegment.trim());

    const pathUuid = url.pathname.match(UUID_PATTERN);
    if (pathUuid?.[0]) candidates.add(pathUuid[0]);
  } catch {
    // Plain QR payloads are expected; URL parsing is only a convenience.
  }

  return [...candidates].filter(Boolean);
}
