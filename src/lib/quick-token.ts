import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// 로그인 없이 특정 댄서의 키·신발만 빠르게 받기 위한 서명 토큰.
// token = base64url(dancer_id).HMAC-SHA256(SUPABASE_SERVICE_ROLE_KEY, dancer_id)
// (이메일 열람추적과 동일한 서명 키·방식)

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function makeHeightToken(dancerId: string): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 미설정");
  return `${Buffer.from(dancerId, "utf8").toString("base64url")}.${sign(dancerId, key)}`;
}

export function verifyHeightToken(token: string): string | null {
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key || !token) return null;
    const dot = token.lastIndexOf(".");
    if (dot < 1) return null;
    const idPart = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const dancerId = Buffer.from(idPart, "base64url").toString("utf8");
    if (!dancerId) return null;
    const expected = sign(dancerId, key);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return dancerId;
  } catch {
    return null;
  }
}

// 일정 가능여부 "프로젝트 단위" 개인 매직링크 토큰 — payload = `ps:${projectId}:${dancerId}`
// 메일로 발송. 로그인 없이 본인(dancer)으로 식별돼 프로젝트 전체 일정에 응답.
// (단톡방 공유는 토큰 대신 projects.schedule_survey_code 짧은 코드 — /sr/<code>, 로그인 필요)
export function makeProjectSurveyToken(
  projectId: string,
  dancerId: string,
): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 미설정");
  const payload = `ps:${projectId}:${dancerId}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload, key)}`;
}

export function verifyProjectSurveyToken(
  token: string,
): { projectId: string; dancerId: string } | null {
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key || !token) return null;
    const dot = token.lastIndexOf(".");
    if (dot < 1) return null;
    const payload = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
    const sig = token.slice(dot + 1);
    const expected = sign(payload, key);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const parts = payload.split(":");
    if (parts[0] !== "ps" || !parts[1] || !parts[2]) return null;
    return { projectId: parts[1], dancerId: parts[2] };
  } catch {
    return null;
  }
}

// 비자 프로그램 신청자 전용 케이스 포털 토큰.
// payload에 vc: prefix를 붙여 다른 매직링크 토큰과 용도를 분리한다.
export function makeVisaCaseToken(applicationId: string): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 미설정");
  const payload = `vc:${applicationId}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload, key)}`;
}

export function verifyVisaCaseToken(token: string): string | null {
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key || !token) return null;
    const dot = token.lastIndexOf(".");
    if (dot < 1) return null;
    const payload = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
    const sig = token.slice(dot + 1);
    const expected = sign(payload, key);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const applicationId = payload.startsWith("vc:") ? payload.slice(3) : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)) {
      return null;
    }
    return applicationId;
  } catch {
    return null;
  }
}
