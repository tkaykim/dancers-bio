import { BottomTabBar } from "@/components/layout/BottomTabBar";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Lite: 비로그인에게도 4탭 노출. 인증 필요 탭(/me, /applications, /feed) 클릭 시
  // 해당 (app) 라우트의 requireUser 가드가 자동으로 /login으로 redirect.
  return (
    <div className="relative mx-auto flex min-h-svh w-full max-w-md flex-col bg-background">
      <main className="flex-1 pb-24">{children}</main>
      <BottomTabBar />
    </div>
  );
}
