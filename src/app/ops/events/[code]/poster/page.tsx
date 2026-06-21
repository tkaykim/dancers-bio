import type { Metadata } from "next";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { createAdminClient } from "@/lib/supabase/admin";
import { PrintPosterButton } from "./PrintPosterButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "입구 QR · deetz",
  robots: { index: false, follow: false },
};

const FALLBACK_ORIGIN = "https://www.deetz.kr";

async function resolveOrigin() {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return FALLBACK_ORIGIN;
    const proto = h.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  } catch {
    return FALLBACK_ORIGIN;
  }
}

export default async function EventSelfPassPosterPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const opsCode = (code ?? "").trim();

  const admin = createAdminClient();
  const { data: eventData } = await admin
    .from("project_events")
    .select("name, starts_at, project_id")
    .eq("ops_code", opsCode)
    .maybeSingle();

  let eventLabel = "현장 접수";
  if (eventData) {
    const event = eventData as { name: string | null; project_id: string };
    const { data: projectData } = await admin
      .from("projects")
      .select("title")
      .eq("id", event.project_id)
      .maybeSingle();
    eventLabel =
      (projectData as { title: string | null } | null)?.title ??
      event.name ??
      "현장 접수";
  }

  const origin = await resolveOrigin();
  const selfPassUrl = `${origin}/ops/events/${opsCode}/pass`;
  const qrDataUrl = await QRCode.toDataURL(selfPassUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    scale: 12,
    color: { dark: "#17140f", light: "#ffffff" },
  });

  return (
    <main className="min-h-svh bg-[#f7f7f4] p-5 text-[#17140f]">
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .poster {
            min-height: calc(100vh - 24mm) !important;
            margin: 12mm !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-[760px] justify-end">
        <PrintPosterButton />
      </div>

      <section className="poster mx-auto flex max-w-[760px] flex-col items-center justify-between border border-black bg-white p-8 text-center shadow-sm">
        <div className="w-full">
          <div
            aria-label="dee'tz"
            className="text-right text-3xl font-black leading-none text-black"
          >
            dee&apos;tz
          </div>
          <p className="mt-8 text-sm font-black uppercase tracking-[0.18em] text-black/45">
            {eventLabel}
          </p>
          <h1 className="mt-3 text-5xl font-black tracking-tight">현장 접수 QR</h1>
          <p className="mt-4 text-xl font-bold leading-relaxed text-black/65">
            QR을 스캔하고 본인 확인 후<br />
            접수 데스크에 개인 QR을 보여주세요.
          </p>
        </div>

        <div className="my-10 rounded-2xl border border-black p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="현장 접수 링크 QR" className="h-80 w-80" />
        </div>

        <div className="w-full border-t border-black/10 pt-6">
          <p className="text-base font-bold text-black/65">
            이름/활동명과 전화번호 뒤 4자리를 입력하면 본인 QR이 표시됩니다.
          </p>
          <p className="mt-2 break-all text-sm font-semibold text-black/40">
            {selfPassUrl}
          </p>
        </div>
      </section>
    </main>
  );
}
