import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { findDuplicateCandidates } from "@/app/actions/ingestions";
import { providerConfigured } from "@/lib/llm";
import type { ProjectIngestionData } from "@/lib/llm/schema";
import { ReviewForm } from "./ReviewForm";

export default async function ReviewIngestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdmin();
  const supabase = await createClient();

  const { data: ingestion } = await supabase
    .from("project_ingestions")
    .select(
      "id, source_url, source_raw, parsed_json, parse_error, llm_provider, llm_model, status, published_project_id, merged_into_project_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (!ingestion) notFound();

  const candidates = await findDuplicateCandidates(id);

  const anthropicAvailable = providerConfigured("anthropic");
  const geminiAvailable = providerConfigured("gemini");

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <Link
        href="/admin/projects/import"
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← 공고 수집
      </Link>
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 수집 검토
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          공고 발행 검토
        </h1>
        <p className="text-sm text-ink-2">
          LLM 이 추출한 결과를 확인하고 필요하면 수정한 뒤 발행하세요.
        </p>
      </header>

      {ingestion.status !== "draft" ? (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-ink-2">
          이 항목은 이미 처리되었습니다 (상태: <code>{ingestion.status}</code>).
          {ingestion.published_project_id ? (
            <>
              {" "}
              <Link
                href={`/projects/${ingestion.published_project_id}`}
                className="underline"
              >
                발행된 공고 보기 →
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      <ReviewForm
        ingestionId={ingestion.id as string}
        parsed={(ingestion.parsed_json as ProjectIngestionData | null) ?? null}
        duplicateCandidates={candidates}
        parseError={(ingestion.parse_error as string | null) ?? null}
        sourceRaw={(ingestion.source_raw as string) ?? ""}
        sourceUrl={(ingestion.source_url as string | null) ?? null}
        llmProvider={(ingestion.llm_provider as string | null) ?? null}
        llmModel={(ingestion.llm_model as string | null) ?? null}
        anthropicAvailable={anthropicAvailable}
        geminiAvailable={geminiAvailable}
      />
    </div>
  );
}
