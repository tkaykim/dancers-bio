import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { providerConfigured, type LlmProvider } from "@/lib/llm";
import { PasteForm } from "./PasteForm";

type IngestionRow = {
  id: string;
  source_url: string | null;
  status: string;
  created_at: string;
  llm_provider: string | null;
  parse_error: string | null;
  parsed_json: { title?: string } | null;
};

function fmt(d: string): string {
  const dt = new Date(d);
  return dt.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_LABEL: Record<string, string> = {
  draft: "검토 대기",
  published: "발행됨",
  merged: "병합됨",
  dismissed: "무시",
};

export default async function AdminImportPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: cfg } = await supabase
    .from("app_config")
    .select("default_llm_provider")
    .eq("id", true)
    .maybeSingle();

  const defaultProvider =
    ((cfg?.default_llm_provider as LlmProvider | undefined) ?? "gemini");

  const anthropicAvailable = providerConfigured("anthropic");
  const geminiAvailable = providerConfigured("gemini");

  const { data: recent } = await supabase
    .from("project_ingestions")
    .select(
      "id, source_url, status, created_at, llm_provider, parse_error, parsed_json",
    )
    .order("created_at", { ascending: false })
    .limit(20);

  const list = (recent ?? []) as IngestionRow[];

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <Link
        href="/admin"
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← 관리자 콘솔
      </Link>
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 외부 공고 수집
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          공고 텍스트 붙여넣기
        </h1>
        <p className="text-sm text-ink-2">
          외부 채널(인스타·카페·디시·카톡 등)에서 본 공고 텍스트를 붙여넣으면
          LLM 이 구조화하고, 중복 후보를 확인한 뒤 발행할 수 있습니다.
        </p>
      </header>

      {!anthropicAvailable && !geminiAvailable ? (
        <div className="rounded-2xl border border-warn/30 bg-warn/5 p-4 text-sm text-warn">
          LLM provider 가 하나도 설정되지 않았습니다. 먼저{" "}
          <Link href="/admin/llm" className="underline">
            /admin/llm
          </Link>{" "}
          에서 API 키 상태를 확인해 주세요.
        </div>
      ) : (
        <PasteForm
          defaultProvider={defaultProvider}
          anthropicAvailable={anthropicAvailable}
          geminiAvailable={geminiAvailable}
        />
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-2">최근 수집</h2>
        {list.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-ink-3">
            아직 수집한 공고가 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((row) => {
              const title = row.parsed_json?.title ?? "(파싱 실패)";
              return (
                <li key={row.id}>
                  <Link
                    href={`/admin/projects/import/${row.id}`}
                    className="flex flex-col gap-1 rounded-md border border-border bg-card p-3 hover:bg-secondary"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-medium">
                        {title}
                      </p>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-3">
                        {STATUS_LABEL[row.status] ?? row.status}
                      </span>
                    </div>
                    <p className="flex items-center gap-2 font-mono text-[11px] text-ink-3">
                      <span>{fmt(row.created_at)}</span>
                      {row.llm_provider ? <span>· {row.llm_provider}</span> : null}
                      {row.parse_error ? (
                        <span className="text-destructive">· 파싱 오류</span>
                      ) : null}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
