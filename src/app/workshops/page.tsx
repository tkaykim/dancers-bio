import type { Metadata } from "next";

import { WorkshopsLanding } from "@/components/workshops/WorkshopsLanding";
import { getUser } from "@/lib/auth/guard";
import { listPublicWorkshopArtists } from "@/lib/workshops/queries";

// deetz Workshop — 수요 기반 해외 안무가 초청.
// village 와 같은 셸 없는 풀블리드 랜딩. 데이터는 service-role 로 읽어 내려준다.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "deetz Workshop — 수요 기반 안무가 초청 워크샵",
  description:
    "배우고 싶은 해외 안무가를 제안하고, 수요가 모이면 deetz가 한국으로 초청합니다. 예약금은 최소 인원 미달 시 전액 환불됩니다.",
  alternates: { canonical: "/workshops" },
};

export default async function WorkshopsPage() {
  const [artists, user] = await Promise.all([listPublicWorkshopArtists(), getUser()]);
  const recruiting = artists.filter((a) => a.status === "recruiting");
  const candidates = artists.filter((a) => a.status !== "recruiting");
  return <WorkshopsLanding recruiting={recruiting} candidates={candidates} isLoggedIn={!!user} />;
}
