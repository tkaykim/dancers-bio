import { notFound } from "next/navigation";
import { resolvePayeeToken } from "@/app/actions/payee-collect";
import { PayeeCollectForm } from "@/components/settlement/PayeeCollectForm";
import { DeetzLogo } from "@/components/brand/DeetzLogo";

export const dynamic = "force-dynamic";

export const metadata = {
  title: { absolute: "지급 정보 제출 · deetz" },
  robots: { index: false, follow: false },
};

// 일회성 수취인(계정 없음) 지급정보 수집 — 1회용 opaque 토큰(설계 §3.7).
// 로그인 없이 열리는 대신 토큰이 수취인 1명·1회·7일로 한정된다.
export default async function PayeeCollectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token) notFound();

  const info = await resolvePayeeToken(token);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-6 py-10">
      <header className="flex flex-col items-start gap-3">
        <DeetzLogo className="h-6 w-auto self-start" />
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold tracking-tight">지급 정보 제출</h1>
          {info ? (
            <p className="text-sm text-ink-3">
              {info.name}님의 정산 지급을 위한 계좌 정보를 받고 있어요.
            </p>
          ) : null}
        </div>
      </header>

      {info ? (
        <PayeeCollectForm
          token={token}
          payeeName={info.name}
          taxMode={info.taxMode}
          hasBrn={info.hasBrn}
        />
      ) : (
        <div className="rounded-2xl border border-warn/30 bg-warn/10 p-5 text-center text-sm text-ink-2">
          링크가 만료됐거나 이미 사용됐어요.
          <br />
          담당자에게 새 링크를 요청해 주세요.
        </div>
      )}
    </div>
  );
}
