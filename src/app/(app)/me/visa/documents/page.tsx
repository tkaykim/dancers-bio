import { redirect } from "next/navigation";
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
      <VisaDocumentIntakeForm context={context} />
    </div>
  );
}
