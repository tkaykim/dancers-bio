import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
import { translator } from "@/lib/i18n/t";
import actions from "@/lib/i18n/messages/actions";

/**
 * Supabase / Postgres 에러를 사용자 메시지로 변환.
 *
 * 주의: 여기 매핑은 DB 트리거의 RAISE EXCEPTION 영문 문구를 그대로 substring 매치한다.
 * 트리거 본문을 변경할 때 이 매핑도 함께 갱신해야 한다.
 * 문구는 `actions` 사전의 `db.*` 키다. locale 은 마지막 선택 인자(기본 ko — 관리자 호출처 무변경).
 */
export function humanizeDbError(
  message: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const t = translator(actions, locale);
  const m = message ?? "";
  if (!m) return t("db.generic");

  // applications_prevent_self (마이그 003 / 005 / 006)
  if (m.includes("apply with your own dancer to your own project")) return t("db.self_apply_dancer");
  if (m.includes("same dancer that owns this project")) return t("db.owner_dancer");
  if (m.includes("team led by the project owner")) return t("db.own_team_lead");
  if (m.includes("same team that owns this project")) return t("db.owner_team");
  if (m.includes("Cannot apply to or propose for your own project")) return t("db.own_project");

  // team_members_protect_lead
  if (m.includes("Cannot remove team lead from members")) return t("db.remove_team_lead");

  // verification RPC
  if (m === "admin only") return t("db.admin_only");
  if (m.includes("verification not found or already processed")) return t("db.verification_gone");

  // 일반 PostgREST/PG 코드 패턴
  if (m.includes("violates row-level security policy")) return t("db.rls_denied");
  if (m.includes("duplicate key value")) return t("db.duplicate");

  return m;
}
