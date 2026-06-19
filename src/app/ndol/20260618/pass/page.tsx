import type { Metadata } from "next";
import { SelfPassClient } from "./SelfPassClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NDOL 현장 접수 QR · deetz",
  robots: { index: false, follow: false },
};

export default function NdolSelfPassPage() {
  return <SelfPassClient />;
}
