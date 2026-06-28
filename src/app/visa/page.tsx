import type { Metadata } from "next";
import { VisaLanding } from "@/components/visa/VisaLanding";

export const metadata: Metadata = {
  title: "Dance in Korea — E-6-1 visa support | deetz",
  description:
    "Want to work as a dancer in Korea? You need an E-6-1 (Arts & Entertainment) visa. deetz helps you assess your case, prepare the right documents, and support your application.",
  alternates: { canonical: "/visa" },
};

export default function VisaLandingPage() {
  return <VisaLanding />;
}
