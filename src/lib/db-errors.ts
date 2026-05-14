/**
 * Supabase / Postgres 에러를 한국어 사용자 메시지로 변환.
 *
 * 주의: 여기 매핑은 DB 트리거의 RAISE EXCEPTION 영문 문구를 그대로 substring 매치한다.
 * 트리거 본문을 변경할 때 이 매핑도 함께 갱신해야 한다.
 */
export function humanizeDbError(message: string | null | undefined): string {
  const m = message ?? "";
  if (!m) return "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";

  // applications_prevent_self (마이그 003 / 005 / 006)
  if (m.includes("apply with your own dancer to your own project")) {
    return "본인이 만든 프로젝트에 본인 댄서로는 지원할 수 없습니다.";
  }
  if (m.includes("same dancer that owns this project")) {
    return "프로젝트 소유 댄서로는 같은 프로젝트에 지원할 수 없습니다.";
  }
  if (m.includes("team led by the project owner")) {
    return "본인 팀(팀장 본인)이 만든 프로젝트에는 지원할 수 없습니다.";
  }
  if (m.includes("same team that owns this project")) {
    return "프로젝트 소유 팀으로는 같은 프로젝트에 지원할 수 없습니다.";
  }
  if (m.includes("Cannot apply to or propose for your own project")) {
    return "본인이 만든 프로젝트에는 지원·제안을 보낼 수 없습니다.";
  }

  // team_members_protect_lead
  if (m.includes("Cannot remove team lead from members")) {
    return "팀장은 멤버에서 직접 제외할 수 없습니다. 팀장을 이양하거나 팀을 해체하세요.";
  }

  // verification RPC
  if (m === "admin only") {
    return "관리자 권한 확인에 실패했습니다. 다시 로그인해 주세요.";
  }
  if (m.includes("verification not found or already processed")) {
    return "이미 처리되었거나 존재하지 않는 인증 요청입니다.";
  }

  // 일반 PostgREST/PG 코드 패턴
  if (m.includes("violates row-level security policy")) {
    return "권한이 없거나 보안 정책에 의해 거부되었습니다.";
  }
  if (m.includes("duplicate key value")) {
    return "이미 등록된 항목입니다.";
  }

  return m;
}
