import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { loadVisaDocumentIntakeContext } from "@/lib/visa/document-intake";
import { VisaDocumentIntakeForm } from "@/components/visa/VisaDocumentIntakeForm";

export const metadata = { title: "Visa documents | deetz" };

export default async function VisaDocumentIntakePage() {
  const user = await requireUser();
  const context = await loadVisaDocumentIntakeContext(user.id);
  if (!context) redirect("/me/visa");

  return (
    <div className="mx-auto max-w-3xl px-5 pb-20 pt-6 md:px-6">
      <Link href="/me/visa" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-foreground">
        <ArrowLeft className="size-4" />
        Visa &amp; Korea
      </Link>
      <header className="mt-6 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-6 md:p-8">
        <div className="flex items-center gap-2 text-primary">
          <LockKeyhole className="size-5" />
          <p className="text-xs font-bold uppercase tracking-[0.16em]">Secure document intake</p>
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">Visa document information</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-2">
          Enter the information needed to prepare your Korean visa documents.
          Your draft is saved quietly while you work, and passport and national identification numbers are encrypted before storage.
        </p>
      </header>
      <VisaDocumentIntakeForm context={context} />
    </div>
  );
}
