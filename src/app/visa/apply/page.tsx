import type { Metadata } from "next";
import { VisaApplyWizard } from "@/components/visa/VisaApplyWizard";

export const metadata: Metadata = {
  title: "Apply — E-6-1 visa support | deetz",
  description: "Tell us about your dance background and visa status so deetz can help you prepare.",
  robots: { index: false, follow: false },
};

export default function VisaApplyPage() {
  return <VisaApplyWizard initialLang="en" />;
}
