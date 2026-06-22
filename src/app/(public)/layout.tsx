import { BottomTabBar } from "@/components/layout/BottomTabBar";
import { TopNav } from "@/components/layout/TopNav";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Lite: 비로그인에게도 4탭 노출. 인증 필요 탭(/me, /applications, /feed) 클릭 시
  // 해당 (app) 라우트의 requireUser 가드가 자동으로 /login으로 redirect.
  // 모바일: 하단 탭바 + 페이지별 max-w-md. 데스크톱(lg+): 상단 헤더 + 페이지별 확장 폭.
  return (
    <div className="relative flex min-h-svh w-full flex-col bg-background">
      <TopNav />
      <main className="flex-1 pb-24 lg:pb-16">{children}</main>
      <BottomTabBar />
    </div>
  );
}
