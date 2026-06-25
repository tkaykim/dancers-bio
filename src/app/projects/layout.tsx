import { getUser } from "@/lib/auth/guard";
import { BottomTabBar } from "@/components/layout/BottomTabBar";

// /projects/* 는 (app) 그룹 밖에 위치해서 익명도 상세를 열람할 수 있다.
// 로그인 상태면 하단 탭바를 유지해 (app) 페이지들과 동일한 네비를 제공한다.
export default async function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  // 모바일 = 폰 폭(max-w-md) 셸 유지. 데스크톱(lg+) = 폭 제한 해제 → 각 페이지가
  // 자체 max-w로 폭을 결정(대부분 max-w-md 유지, 관리 페이지는 넓은 대시보드).
  return (
    <div className="relative mx-auto flex min-h-svh w-full max-w-md flex-col bg-background lg:max-w-none">
      <main className={"flex-1 " + (user ? "pb-24 lg:pb-10" : "pb-10")}>
        {children}
      </main>
      {user ? <BottomTabBar /> : null}
    </div>
  );
}
