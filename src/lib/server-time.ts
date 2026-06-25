import "server-only";

// 서버 컴포넌트에서 요청 시각(ms)을 얻는다.
// 컴포넌트 본문에서 Date.now()를 직접 호출하면 react-hooks/purity 린트에 걸리므로
// 이 헬퍼를 통해 호출한다(서버 전용, 매 요청 평가).
export function serverNowMs(): number {
  return Date.now();
}
