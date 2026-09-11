import type { Metadata } from "next";

import { WorkshopsLanding } from "@/components/workshops/WorkshopsLanding";
import type { Lang } from "@/components/workshops/copy";
import { getUser } from "@/lib/auth/guard";
import { getRequestedLocale } from "@/lib/i18n/server";
import { listPublicWorkshopArtists, listRequestedArtists } from "@/lib/workshops/queries";
import { listOpenEvents } from "@/lib/workshops/event-queries";

// deetz Workshop — 수요 기반 안무가 초청 (ko/en/ja).
// village 와 같은 셸 없는 풀블리드 랜딩. 공개 카드는 anon+RLS, 희망 목록은 최소 필드만 서버에서 내려준다.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "deetz Workshop — 다음 워크샵, 어떤 안무가와 하고 싶나요?",
  description:
    "deetz는 주기적으로 워크샵을 운영합니다. 배우고 싶은 안무가를 제안해 주세요. 여러분의 수요가 다음 워크샵 라인업이 됩니다.",
  alternates: { canonical: "/workshops" },
};

export default async function WorkshopsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  // ko·en·ja 는 미들웨어가 `?lang=` 을 요청 언어로 바꿔 준다.
  // 태국어(th)는 전역 Locale 모델 밖이라 이 화면에서만 `?lang=th` 로 직접 받는다(방콕 캠페인).
  const [{ lang }, requestedLocale] = await Promise.all([searchParams, getRequestedLocale()]);
  const initialLang: Lang = lang === "th" ? "th" : requestedLocale;

  const [artists, requested, openEvents, user] = await Promise.all([
    listPublicWorkshopArtists(),
    listRequestedArtists(),
    listOpenEvents(),
    getUser(),
  ]);
  const recruiting = artists.filter((a) => a.status === "recruiting");

  return (
    <WorkshopsLanding
      recruiting={recruiting}
      requested={requested}
      openEvents={openEvents}
      isLoggedIn={!!user}
      initialLang={initialLang}
    />
  );
}
