import { PublicShell } from "@/components/layout/PublicShell";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Lite: 비로그인에게도 동일 내비 노출. 인증 필요 탭(/me, /applications) 클릭 시
  // 해당 (app) 라우트의 requireUser 가드가 자동으로 /login으로 redirect.
  // 셸 통일: 모바일 = 하단 탭바 + max-w-md 컬럼 / 데스크톱(lg+) = 좌측 사이드바 내비.
  return <PublicShell>{children}</PublicShell>;
}
