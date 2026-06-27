import { PublicShell } from "@/components/layout/PublicShell";

// /projects/* 는 (app) 그룹 밖에 위치해서 익명도 상세를 열람할 수 있다.
// 셸 통일: (public)/(app)과 동일한 PublicShell — 모바일 하단 탭바 + 데스크톱(lg+) 좌측 사이드바.
// 익명도 /feed처럼 동일 내비를 보며, 인증 필요 탭 클릭 시 가드가 /login으로 보낸다.
export default async function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PublicShell>{children}</PublicShell>;
}
