/**
 * {name} 자리를 vars 로 채운다.
 *
 * 화면 사전(messages/*)과 메일 사전(mail-messages.ts)이 함께 쓴다.
 * 사전은 나눠 두었다 — 메일 문구까지 화면 사전에 넣으면 클라이언트 번들에 실린다.
 *
 * 검사 규칙 (docs/design-i18n-ui.md §3.4)
 *   - 원본 템플릿에서 자리표시자를 뽑고 `Object.hasOwn(vars, name)` 으로 제공 여부를 본다.
 *     `in` 은 상속 속성(toString 등)도 인정해서 쓰지 않는다.
 *   - 치환 결과에서 `{` 를 찾는 방식은 이용자 값에 든 중괄호를 누락으로 오인하므로 쓰지 않는다.
 *   - 누락이면 개발 모드에서 console.error 를 내고 자리표시자를 그대로 둔다. 운영에서는 조용히 그대로 둔다.
 */
const PLACEHOLDER = /\{(\w+)\}/g;

export function interpolate(
  raw: string,
  vars?: Record<string, string | number>,
): string {
  const provided = vars ?? {};
  return raw.replace(PLACEHOLDER, (whole, name: string) => {
    if (Object.hasOwn(provided, name)) return String(provided[name]);
    if (process.env.NODE_ENV !== "production") {
      console.error(`[i18n] placeholder {${name}} not provided for: ${raw}`);
    }
    return whole;
  });
}

/** 템플릿이 요구하는 자리표시자 이름 집합(단위 테스트·검수용). */
export function placeholdersOf(raw: string): Set<string> {
  const names = new Set<string>();
  for (const m of raw.matchAll(PLACEHOLDER)) names.add(m[1]);
  return names;
}
