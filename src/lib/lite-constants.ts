// Lite MVP 공용 상수. server action / client 컴포넌트 양쪽에서 import 가능.

// applyToProjectAction이 dancer 프로필 부재 시 반환하는 sentinel error 문자열.
// 클라이언트는 이 값을 보고 onboarding 유도 모달/리다이렉트로 분기.
export const NEEDS_DANCER_ERROR = "NEEDS_DANCER";
