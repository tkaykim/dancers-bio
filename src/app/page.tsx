import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/guard";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const user = await getUser();
  if (user) redirect("/me");

  return (
    <div className="relative mx-auto flex min-h-svh w-full max-w-md flex-col px-6 pb-10 pt-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: `radial-gradient(ellipse at 20% 10%, rgba(217,255,60,0.18), transparent 55%)`,
        }}
      />

      <div className="flex items-baseline gap-2">
        <h1 className="text-5xl font-extrabold tracking-tighter leading-none">
          Cue
        </h1>
        <span className="h-3 w-3 rounded-full bg-primary" aria-hidden />
      </div>

      <p className="mt-6 text-2xl font-bold tracking-tight leading-tight">
        K-pop 댄스 신의
        <br />
        캐스팅 플랫폼.
      </p>

      <p className="mt-4 text-base leading-relaxed text-ink-2">
        포트폴리오를 만들고, 캐스팅에 지원하고,
        <br />
        팀원을 모집하세요.
      </p>

      <div className="mt-auto flex flex-col gap-3 pt-12">
        <Link href="/signup">
          <Button className="h-14 w-full rounded-2xl text-base font-semibold">
            시작하기
          </Button>
        </Link>
        <Link href="/login">
          <Button
            variant="outline"
            className="h-14 w-full rounded-2xl border-hairline-2 text-base font-medium"
          >
            로그인
          </Button>
        </Link>
        <p className="mt-2 text-center text-xs text-ink-3">
          이미 등록된 댄서{" "}
          <Link href="/d/babysleek" className="text-foreground underline">
            포트폴리오 둘러보기
          </Link>
        </p>
      </div>
    </div>
  );
}
