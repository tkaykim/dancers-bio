import Script from "next/script";

/**
 * `/submit/<token>` 만 GA 에서 마스킹한다.
 *
 * 이 경로는 로그인이 없는 대신 URL 자체가 업로드 자격증명이라 예외를 뒀다.
 * 나머지 코드 경로(s·cast·w 등)는 마스킹하지 않는다 — 그쪽까지 뭉개면
 * 정산·캐스팅보드 유입 통계가 한 덩어리가 돼서, 막는 위험보다 잃는 게 크다.
 * (2026-08-14 대표 지시: 과도한 보안으로 기존 동작을 해치지 말 것)
 */
const MASK_FN = `
function __deetzMaskPath(p){
  return String(p||'').replace(/^\\/submit\\/[^/]+/, '/submit/[token]');
}
function __deetzMaskUrl(u){
  try { var x = new URL(u); return x.origin + __deetzMaskPath(x.pathname); } catch(e){ return u; }
}`;

function getMeasurementId() {
  const value = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  return value && /^G-[A-Z0-9]+$/.test(value) ? value : null;
}

export function GoogleAnalytics() {
  const measurementId = getMeasurementId();

  if (!measurementId) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
        strategy="afterInteractive"
      />
      <Script
        id="google-analytics"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
${MASK_FN}
gtag('config', '${measurementId}', {
  page_location: __deetzMaskUrl(location.href),
  page_path: __deetzMaskPath(location.pathname)
});
`,
        }}
      />
    </>
  );
}
