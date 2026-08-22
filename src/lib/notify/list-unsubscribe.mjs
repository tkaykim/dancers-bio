/**
 * List-Unsubscribe / List-Unsubscribe-Post 헤더 정본.
 *
 * ⚠ 이 파일은 **앱(TS)과 발송 스크립트(.mjs)가 함께 쓰는 유일한 구현**이다.
 *   - 앱:      src/lib/gmail.ts 가 import (allowJs)
 *   - 스크립트: scripts/lib/list-unsubscribe.mjs 재수출 → `./lib/list-unsubscribe.mjs`
 *   같은 헤더 문자열을 다른 곳에 복붙하지 말 것. 여기만 고친다.
 *
 * 왜 필요한가 (2026-08-22):
 *   deetz.kr 은 2026-08 개설한 신생 도메인이라 발신 평판이 없다.
 *   그 상태에서 8일간 600통 넘게 나갔고 일부가 스팸함으로 분류됐다.
 *   SPF/DKIM/DMARC 는 이미 정상이라 남은 지렛대가 수신거부 헤더다.
 *   Gmail 대량 발신자 기준에서 안내성 메일의 List-Unsubscribe 는 사실상 필수고,
 *   원클릭(RFC 8058)까지 되어야 감점이 없다.
 *
 * RFC 8058 준수 (중요):
 *   List-Unsubscribe-Post 는 **HTTPS URI 가 있을 때만** 붙인다.
 *   mailto 밖에 없는 수신자(계정 미연결 = 토큰 없음)에게 One-Click 을 선언하면
 *   규격 위반이라 오히려 감점이다. 그 경우엔 mailto 만 남긴다.
 *
 * 헤더의 URL 은 POST 요청에도 동작해야 한다.
 *   GET  /unsubscribe/<token> → 확인 버튼이 있는 페이지 (스캐너 프리페치 방지)
 *   POST /unsubscribe/<token> → 즉시 수신거부 (middleware 가 API 라우트로 rewrite)
 */

/** 수신거부 링크가 사는 오리진. www 정본(비-www 는 리다이렉트라 원클릭 POST 가 깨진다). */
export const UNSUBSCRIBE_ORIGIN = "https://www.deetz.kr";

/** mailto 수신거부 수신함. 사람이 실제로 보는 주소여야 한다. */
export const UNSUBSCRIBE_MAILBOX = "contact@deetz.kr";

/** notification_preferences.unsubscribe_token 으로 만드는 착지 URL. */
export function unsubscribeUrl(token) {
  return `${UNSUBSCRIBE_ORIGIN}/unsubscribe/${encodeURIComponent(String(token))}`;
}

/**
 * 안내성(bulk) 메일에 붙일 수신거부 헤더.
 *
 * `{ prepared: true }` 로 넘기는 이유:
 *   URL + mailto 를 합치면 78자를 넘어서 nodemailer 가 RFC 5322 folding 을 한다.
 *   접히면 `List-Unsubscribe:` 뒤가 비고 값이 다음 줄로 내려가는데, 규격상 적법해도
 *   실제 대형 발신자(ESP)는 전부 한 줄로 내보낸다. 파서 호환성을 넓게 가져가려고
 *   folding 을 끄고 한 줄로 낸다(998자 하드 리밋에는 한참 못 미친다).
 *
 * @param {string | null | undefined} token
 *   notification_preferences.unsubscribe_token. 계정이 없는 수신자(콜드 아웃리치 등)는 null.
 * @returns {Record<string, { prepared: true, value: string }>}
 *   nodemailer `headers` 에 그대로 넘길 객체.
 */
export function listUnsubscribeHeaders(token) {
  /** @type {(value: string) => { prepared: true, value: string }} */
  const h = (value) => ({ prepared: true, value });

  const mailto = `<mailto:${UNSUBSCRIBE_MAILBOX}?subject=unsubscribe>`;
  if (!token) {
    // HTTPS URI 가 없으면 원클릭을 선언할 수 없다 (RFC 8058 §3.1).
    return { "List-Unsubscribe": h(mailto) };
  }
  return {
    "List-Unsubscribe": h(`<${unsubscribeUrl(token)}>, ${mailto}`),
    "List-Unsubscribe-Post": h("List-Unsubscribe=One-Click"),
  };
}

/**
 * 여러 user_id 의 수신거부 토큰을 한 번에 확보한다.
 *
 * 행이 없는 유저는 기본값(전체 수신)으로 만들어 준다 — 토큰은 컬럼 default(gen_random_uuid())가 채운다.
 * 실측(2026-08-22) auth.users 1211명 중 notification_preferences 행은 598개뿐이라,
 * upsert 없이 select 만 하면 절반 가까이 토큰 없이(=mailto 만) 나간다.
 *
 * supabase 클라이언트를 인자로 받아 앱/스크립트 양쪽에서 같은 코드를 쓴다.
 *
 * @param {{ from: (t: string) => any }} db service-role supabase 클라이언트
 * @param {Array<string | null | undefined>} userIds
 * @returns {Promise<Map<string, { token: string, unsubscribedAll: boolean }>>}
 */
export async function fetchUnsubscribePrefs(db, userIds) {
  const ids = [...new Set((userIds ?? []).filter(Boolean))];
  const out = new Map();
  if (!ids.length) return out;

  // 없는 행만 기본값으로 생성. 이미 있으면 건드리지 않는다(수신거부 상태를 덮으면 안 된다).
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    await db
      .from("notification_preferences")
      .upsert(
        chunk.map((user_id) => ({ user_id })),
        { onConflict: "user_id", ignoreDuplicates: true },
      );
    const { data } = await db
      .from("notification_preferences")
      .select("user_id, unsubscribe_token, email_unsubscribed_all")
      .in("user_id", chunk);
    for (const r of data ?? []) {
      out.set(r.user_id, {
        token: r.unsubscribe_token,
        unsubscribedAll: Boolean(r.email_unsubscribed_all),
      });
    }
  }
  return out;
}
