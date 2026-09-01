import "server-only";

// 기능 차단기 3종 — NEXT_PUBLIC_* 는 UI 노출용일 뿐 차단기가 아니다(빌드 산출물에 포함).
// 서버 액션·route handler 는 반드시 이 서버 플래그로 막는다.

/** 메시지 센터 서버 기능 전체. off 면 모든 액션·조회 route 가 거부한다. */
export function messagingEnabled(): boolean {
  return process.env.MESSAGING_ENABLED === "true";
}

/** 외부 발송(메일 등). off 면 잡 핸들러가 발송하지 않고 종료한다 — 배포 순서로 인한 밀린 잡 일괄 발송 사고 방지. */
export function messagingExternalEnabled(): boolean {
  return messagingEnabled() && process.env.MESSAGING_EXTERNAL_NOTIFICATIONS_ENABLED === "true";
}

export const MESSAGING_DISABLED_ERROR = "메시지 기능이 아직 열리지 않았습니다.";
