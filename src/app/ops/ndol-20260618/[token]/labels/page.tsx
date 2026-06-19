import type { Metadata } from "next";
import { LabelPrintClient } from "./LabelPrintClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NDOL 번호표 출력 · deetz",
  robots: { index: false, follow: false },
};

export default async function NdolLabelsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <LabelPrintClient token={token} />;
}
