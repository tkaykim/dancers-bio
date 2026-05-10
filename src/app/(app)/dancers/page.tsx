import { requireUser } from "@/lib/auth/guard";
import { Input } from "@/components/ui/input";
import { DancerInfiniteGrid } from "@/components/dancers/DancerInfiniteGrid";
import { DANCER_PAGE_SIZE, fetchDancerPage } from "@/lib/data/dancers";

export default async function DancersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const q = (params.q ?? "").trim();

  const initialDancers = await fetchDancerPage({ q, offset: 0 });
  const initialHasMore = initialDancers.length === DANCER_PAGE_SIZE;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 댄서 디렉토리
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          댄서 찾기
        </h1>
      </header>

      <form className="flex flex-col gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder="활동명, 한글 이름 검색"
          autoComplete="off"
        />
      </form>

      {/*
        key={q} ensures the client grid resets state when the search changes.
        The page itself re-renders with a fresh initialDancers fetch since q is
        in the URL.
      */}
      <DancerInfiniteGrid
        key={q}
        q={q}
        initialDancers={initialDancers}
        initialHasMore={initialHasMore}
      />
    </div>
  );
}
