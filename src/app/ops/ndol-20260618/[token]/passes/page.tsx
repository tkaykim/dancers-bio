import type { Metadata } from "next";
import { QrPassClient } from "./QrPassClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NDOL QR 출입증 · deetz",
  robots: { index: false, follow: false },
};

export default async function NdolQrPassesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <QrPassClient token={token} />;
}
