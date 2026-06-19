export const NDOL_QR_PREFIX = "NDOL-20260618";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const BIB_PATTERN = /^[A-Z]-\d{1,2}$/i;

export function buildNdolQrPayload(contactId: string) {
  return `${NDOL_QR_PREFIX}:${contactId}`;
}

export function extractNdolQrCandidates(rawValue: string) {
  const value = rawValue.trim();
  const candidates = new Set<string>();

  if (!value) return [];

  candidates.add(value);

  const prefixMatch = value.match(new RegExp(`^${NDOL_QR_PREFIX}:(.+)$`, "i"));
  if (prefixMatch?.[1]) candidates.add(prefixMatch[1].trim());

  const uuidMatch = value.match(UUID_PATTERN);
  if (uuidMatch?.[0]) candidates.add(uuidMatch[0]);

  if (BIB_PATTERN.test(value)) candidates.add(value.toUpperCase());

  try {
    const url = new URL(value);
    for (const key of ["id", "contact", "contactId", "c", "qr", "code"]) {
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
    // Plain QR payloads are expected; URL parsing is just a convenience.
  }

  return [...candidates].filter(Boolean);
}
