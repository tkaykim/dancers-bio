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

// 일정 가능여부 응답용 토큰 — payload = `${scheduleId}:${dancerId}`
export function makeScheduleToken(scheduleId: string, dancerId: string): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 미설정");
  const payload = `${scheduleId}:${dancerId}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload, key)}`;
}

// 단톡방 공유용 일정 토큰 — 특정 댄서 없이 일정만 식별(payload = `sg:${scheduleId}`).
// 응답자는 페이지에서 로그인(세션)으로 신원확인.
export function makeScheduleGroupToken(scheduleId: string): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 미설정");
  const payload = `sg:${scheduleId}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload, key)}`;
}

export function verifyScheduleGroupToken(token: string): string | null {
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
    if (!payload.startsWith("sg:")) return null;
    const scheduleId = payload.slice(3);
    return scheduleId || null;
  } catch {
    return null;
  }
}

export function verifyScheduleToken(
  token: string,
): { scheduleId: string; dancerId: string } | null {
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
    const [scheduleId, dancerId] = payload.split(":");
    if (!scheduleId || !dancerId) return null;
    return { scheduleId, dancerId };
  } catch {
    return null;
  }
}
