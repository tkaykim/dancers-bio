import Script from "next/script";

/**
 * 토큰이 담긴 경로를 GA 로 보내지 않는다.
 *
 * gtag('config') 는 page_location 기본값이 document.location 이라, 그냥 두면
 * /submit/<token> · /s/<token> 같은 1회용 자격증명이 그대로 Google Analytics 에 적재된다.
 * 업로드 토큰은 bearer credential 이므로 세그먼트를 마스킹해서 보낸다.
 * (Codex 교차검토 2026-08-14 지적)
 */
const MASK_FN = `
function __deetzMaskPath(p){
  return String(p||'').replace(/^\\/(submit|s|sr|sz|w|fit|cast|unsubscribe|visa\\/case)\\/[^/]+/, '/$1/[token]');
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
