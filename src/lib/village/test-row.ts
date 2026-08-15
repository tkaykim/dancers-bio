/**
 * E2E 테스트로 만든 deetz Village 수요조사 행 판별.
 * /admin/visa 와 같은 규칙(`[E2E TEST` 표기)을 쓴다 — 목록에는 남기되 수요 집계에서만 뺀다.
 *
 * 서버 컴포넌트(집계)와 클라이언트 목록이 함께 쓰므로 "use client" 모듈 밖에 둔다.
 */
export function isVillageTestRow(row: {
  name: string | null;
  message: string | null;
  decline_reason_detail: string | null;
  memo: string | null;
}): boolean {
  return [row.name, row.message, row.decline_reason_detail, row.memo].some((v) =>
    (v ?? "").toUpperCase().includes("[E2E TEST"),
  );
}
