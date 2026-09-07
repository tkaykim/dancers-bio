import { notFound } from "next/navigation";
import { loadPublishedReport } from "@/lib/campaign/report-data";
import { ResultsReport } from "@/components/campaign/ResultsReport";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "캠페인 성과 보고서 | deetz",
  robots: {
    index: false,
    follow: false,
  },
};
export default async function ResultsPage({
  params,
}: {
  params: Promise<{
    code: string;
  }>;
}) {
  const { code } = await params;
  const report = await loadPublishedReport(code);
  if (!report) notFound();
  return <ResultsReport report={report} />;
}
