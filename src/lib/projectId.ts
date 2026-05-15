// projects 식별자 helper.
// /projects/[id] 라우트는 UUID와 6자 short_code 양쪽을 수용한다.
// 내부 로직은 항상 UUID(canonical) 기준으로 작동하며, 외부 노출용 URL은 short_code 선호.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_CODE_RE = /^[a-z0-9]{6}$/;

export function classifyProjectIdentifier(
  raw: string,
): { kind: "uuid"; value: string } | { kind: "short_code"; value: string } | null {
  if (!raw) return null;
  if (UUID_RE.test(raw)) return { kind: "uuid", value: raw };
  if (SHORT_CODE_RE.test(raw)) return { kind: "short_code", value: raw };
  return null;
}
