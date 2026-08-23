/**
 * {name} 자리를 vars 로 채운다. 채울 값이 없으면 자리표시자를 그대로 둔다.
 *
 * 화면 사전(messages.ts)과 메일 사전(mail-messages.ts)이 함께 쓴다.
 * 사전은 둘로 나눠 두었다 — 메일 문구까지 화면 사전에 넣으면 클라이언트 번들에 실린다.
 */
export function interpolate(
  raw: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}
