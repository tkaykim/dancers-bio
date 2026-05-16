import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guard";
import { LlmConsole } from "./LlmConsole";

export default async function AdminLlmPage() {
  await requireAdmin();
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <Link
        href="/admin"
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← 관리자 콘솔
      </Link>
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ LLM</p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          LLM Provider 설정
        </h1>
        <p className="text-sm text-ink-2">
          공고 자동 추출에 사용할 LLM provider 를 선택하고, 연결 상태와 응답 품질을
          이 화면에서 확인합니다.
        </p>
      </header>
      <LlmConsole />
    </div>
  );
}
