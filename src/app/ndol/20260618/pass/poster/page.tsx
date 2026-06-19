import type { Metadata } from "next";
import QRCode from "qrcode";
import { PrintPosterButton } from "./PrintPosterButton";

export const dynamic = "force-dynamic";

const SELF_PASS_URL = "https://www.deetz.kr/ndol/20260618/pass";

export const metadata: Metadata = {
  title: "NDOL 입구 QR · deetz",
  robots: { index: false, follow: false },
};

export default async function NdolSelfPassPosterPage() {
  const qrDataUrl = await QRCode.toDataURL(SELF_PASS_URL, {
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
            NDOL 2026.06.18
          </p>
          <h1 className="mt-3 text-5xl font-black tracking-tight">
            현장 접수 QR
          </h1>
          <p className="mt-4 text-xl font-bold leading-relaxed text-black/65">
            QR을 스캔하고 본인 확인 후<br />
            접수 데스크에 개인 QR을 보여주세요.
          </p>
        </div>

        <div className="my-10 rounded-2xl border border-black p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="NDOL 현장 접수 링크 QR" className="h-80 w-80" />
        </div>

        <div className="w-full border-t border-black/10 pt-6">
          <p className="text-base font-bold text-black/65">
            이름/활동명과 전화번호 뒤 4자리를 입력하면 본인 QR이 표시됩니다.
          </p>
          <p className="mt-2 break-all text-sm font-semibold text-black/40">
            {SELF_PASS_URL}
          </p>
        </div>
      </section>
    </main>
  );
}
