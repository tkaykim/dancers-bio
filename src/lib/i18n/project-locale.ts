import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectLocaleFromText, DEFAULT_LOCALE, type Locale } from "./locale";

/**
 * 공고 하나의 언어. 제목·본문의 한글 비중으로 판별한다(@/lib/i18n/locale).
 *
 * 메일에는 Accept-Language 를 쓰지 않는다.
 *   메일은 수신자가 요청을 보내는 게 아니라 우리가 밀어 넣는 것이라, 발송 시점의
 *   HTTP 헤더는 지원자가 아니라 운영자(또는 크론)의 것이다. 그걸 따르면
 *   영문 공고 지원자에게 운영자 브라우저 언어로 메일이 나간다.
 *   공고 본문만 보고 정하고, 판단이 안 서면 한국어로 간다.
 *
 * 조회 실패도 한국어로 떨어뜨린다 — 메일 언어 하나 때문에 발송을 막지 않는다.
 */
export async function projectLocale(
  projectId: string | null | undefined,
): Promise<Locale> {
  if (!projectId) return DEFAULT_LOCALE;
  try {
    const { data } = await createAdminClient()
      .from("projects")
      .select("title, description")
      .eq("id", projectId)
      .maybeSingle();
    return (
      detectLocaleFromText(
        data?.title as string | null,
        data?.description as string | null,
      ) ?? DEFAULT_LOCALE
    );
  } catch (e) {
    // 조용히 한국어로 떨어지면 영문 공고에 한국어 메일이 나가도 아무도 모른다.
    console.error("[project-locale] 공고 언어 판별 실패:", e);
    return DEFAULT_LOCALE;
  }
}
