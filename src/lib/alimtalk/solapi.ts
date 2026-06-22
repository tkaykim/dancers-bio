import "server-only";

// solapi.ts — 솔라피(Solapi) 카카오 알림톡 발송 (deetz 앱 전용, fetch + HMAC).
//
// 카카오 알림톡은 카카오에 직접 못 보내고 인증 대행사(솔라피)를 거친다.
// 솔라피 REST v4(/messages/v4/send)를 HMAC-SHA256 인증으로 직접 호출한다.
// (modoo 워커 worker/src/tools/solapi.ts 검증 구현을 deetz 앱으로 포팅 — 같은 솔라피 계정 재사용)
//
// 필요한 환경변수:
//   SOLAPI_API_KEY        솔라피 API 키 (modoo와 동일 계정)
//   SOLAPI_API_SECRET     솔라피 API 시크릿
//   SOLAPI_PFID_DEETZ     deetz 카카오 발신프로필 ID(@deetz)
//   SOLAPI_SENDER         (선택) 대체발송 SMS용 발신번호
//
// 정책상 알림톡 본문은 "카카오 사전승인 템플릿"만 발송 가능 → templateId 로 지정.
// 미설정(키/PFID/templateId 없음) 시 graceful no-op → 기존 흐름을 막지 않는다.
import crypto from "crypto";

const SOLAPI_BASE = "https://api.solapi.com";

export function defaultPfId(): string | undefined {
  return process.env.SOLAPI_PFID_DEETZ;
}

export function alimtalkConfigured(pfId = defaultPfId()): boolean {
  return Boolean(
    process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && pfId,
  );
}

function authHeader(): string {
  const key = process.env.SOLAPI_API_KEY as string;
  const secret = process.env.SOLAPI_API_SECRET as string;
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString("hex");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(date + salt)
    .digest("hex");
  return `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}`;
}

// 템플릿 변수 키를 솔라피 형식(#{name})으로 정규화.
function normalizeVars(
  vars?: Record<string, string | number | null | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars ?? {})) {
    if (v == null) continue;
    const key = k.startsWith("#{") ? k : `#{${k}}`;
    out[key] = String(v);
  }
  return out;
}

/** 휴대폰번호 정규화 → 숫자만. 유효(10자리+)하면 반환, 아니면 null. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const p = (raw || "").replace(/[^0-9]/g, "");
  return p.length >= 10 ? p : null;
}

export interface AlimtalkParams {
  to: string; // 수신 휴대폰번호 (하이픈 무관)
  templateId: string; // 카카오 승인 템플릿 ID
  variables?: Record<string, string | number | null | undefined>;
  fallbackText?: string; // 지정 시 알림톡 실패하면 SMS 대체발송
  pfId?: string; // 미지정=SOLAPI_PFID_DEETZ
  sender?: string; // 미지정=SOLAPI_SENDER
}

export interface AlimtalkResult {
  ok: boolean;
  skipped?: boolean; // 환경변수/템플릿ID 미설정으로 보내지 않음
  messageId?: string;
  error?: string;
  raw?: unknown;
}

export async function sendAlimtalk(p: AlimtalkParams): Promise<AlimtalkResult> {
  const pfId = p.pfId ?? defaultPfId();
  if (!alimtalkConfigured(pfId)) {
    return { ok: false, skipped: true, error: "SOLAPI env not configured" };
  }
  if (!p.templateId) {
    return {
      ok: false,
      skipped: true,
      error: "templateId missing (template not yet registered/approved)",
    };
  }
  const phone = normalizePhone(p.to);
  if (!phone) return { ok: false, error: "invalid phone" };

  const message: Record<string, unknown> = {
    to: phone,
    from:
      (p.sender || process.env.SOLAPI_SENDER || "").replace(/[^0-9]/g, "") ||
      undefined,
    kakaoOptions: {
      pfId,
      templateId: p.templateId,
      variables: normalizeVars(p.variables),
      disableSms: !p.fallbackText,
    },
  };
  if (p.fallbackText) message.text = p.fallbackText;

  try {
    const res = await fetch(`${SOLAPI_BASE}/messages/v4/send`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });
    const data: Record<string, unknown> = await res
      .json()
      .catch(() => ({}) as Record<string, unknown>);
    const failedList = data?.failedMessageList;
    const failed = Array.isArray(failedList) && failedList.length > 0;
    const statusCode = data?.statusCode;
    if (
      !res.ok ||
      failed ||
      (statusCode && String(statusCode)[0] !== "2")
    ) {
      const err =
        (Array.isArray(failedList) &&
          (failedList[0] as Record<string, unknown>)?.statusMessage) ||
        data?.errorMessage ||
        data?.statusMessage ||
        `HTTP ${res.status}`;
      return { ok: false, error: String(err).slice(0, 300), raw: data };
    }
    const groupInfo = data?.groupInfo as Record<string, unknown> | undefined;
    return {
      ok: true,
      messageId:
        (data?.messageId as string) || (groupInfo?.groupId as string),
      raw: data,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
