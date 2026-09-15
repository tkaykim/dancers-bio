import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublishedReport } from "@/lib/campaign/report-data";
import { ResultsReport } from "@/components/campaign/ResultsReport";
export const dynamic = "force-dynamic";
const loadReport = cache(loadPublishedReport);
// Shared links show the published report title; `absolute` keeps the root "· deetz" template from repeating.
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const report = await loadReport(code);
  const title = `${report?.title?.trim() || "캠페인 결과 보고서"} · deetz`;
  const description = "deetz 캠페인 결과 보고서";
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description },
    twitter: { title, description },
    robots: { index: false, follow: false },
  };
}
export default async function ResultsPage({
  params,
}: {
  params: Promise<{
    code: string;
  }>;
}) {
  const { code } = await params;
  const report = await loadReport(code);
  if (!report) notFound();
  return <ResultsReport report={report} />;
}
