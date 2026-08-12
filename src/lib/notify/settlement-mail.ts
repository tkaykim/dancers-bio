import "server-only";

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// deetz 공식 메일 양식(560px 카드 + SNS 푸터) 출금신청 안내 메일.
// 정산 금액이 확정(정산완료)되어, 댄서가 로그인 후 출금 신청하도록 안내.
export function buildWithdrawalRequestEmail(params: {
  name: string;
  projectTitle: string;
  grossText: string;
  taxText: string;
  netText: string;
  url: string;
}): { subject: string; text: string; html: string } {
  const { name, projectTitle, grossText, taxText, netText, url } = params;
  const subject = `[deetz] ${name}님, 정산 금액이 확정되었어요 — 출금 신청 안내`;

  const text = [
    `${name}님, 안녕하세요.`,
    ``,
    `참여하신 프로젝트(${projectTitle})의 정산 금액이 확정되어 안내드립니다.`,
    ``,
    `· 세전 금액: ${grossText}`,
    `· 원천징수(3.3%): -${taxText}`,
    `· 실수령액: ${netText}`,
    ``,
    `아래 링크에서 로그인 후 계좌를 확인하고 '출금 신청'을 눌러 주세요.`,
    `신청하시면 원천징수 3.3%를 제외한 ${netText}이 등록된 계좌로 입금됩니다.`,
    `${url}`,
    ``,
    `deetz · 댄서 매거진 & 캐스팅 플랫폼`,
    `deetz.kr · contact@deetz.kr`,
  ].join("\n");

  const html = `<html lang="ko"><body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;"><img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="58" height="28" style="display:block;height:28px;width:auto;border:0;"><div style="font-size:12px;color:#6b7280;margin-top:10px;">댄서 매거진 &amp; 캐스팅 플랫폼</div></td></tr>
<tr><td style="padding:30px 32px 8px;color:#111;"><span style="display:inline-block;background:#ecfdf5;color:#047857;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">정산 안내</span>
<p style="font-size:18px;font-weight:700;margin:18px 0 4px;line-height:1.5;">${esc(name)}님, 안녕하세요.</p>
<p style="font-size:15px;line-height:1.75;color:#33363b;margin:0;"><b>${esc(projectTitle)}</b> 프로젝트의 정산 금액이 확정되어 안내드립니다.</p></td></tr>
<tr><td style="padding:16px 32px 6px;"><div style="border:1px solid #ececef;border-radius:12px;padding:14px 16px;background:#fafafa;">
<div style="display:flex;justify-content:space-between;font-size:13px;color:#6b7280;padding:3px 0;"><span>세전 금액</span><span style="color:#33363b;">${esc(grossText)}</span></div>
<div style="display:flex;justify-content:space-between;font-size:13px;color:#6b7280;padding:3px 0;"><span>원천징수 (3.3%)</span><span style="color:#33363b;">- ${esc(taxText)}</span></div>
<div style="border-top:1px solid #ececef;margin:8px 0;"></div>
<div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;color:#111;padding:3px 0;"><span>실수령액</span><span>${esc(netText)}</span></div>
</div></td></tr>
<tr><td style="padding:10px 32px 24px;"><a href="${url}" style="display:block;background:#111;color:#fff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">출금 신청하러 가기 →</a>
<p style="font-size:12px;color:#9ca3af;text-align:center;margin:10px 0 0;">로그인 후 계좌 확인 → 출금 신청 (원천징수 3.3% 제외 입금)</p></td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;"><img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="41" height="20" style="display:block;height:20px;width:auto;border:0;"><div style="font-size:12px;color:#6b7280;margin:10px 0 14px;">댄서 매거진 &amp; 캐스팅 플랫폼</div>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding-right:10px;"><a href="https://www.youtube.com/@deetzmagazine"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/youtube.png" width="30" height="30" alt="YouTube" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td><td><a href="https://www.instagram.com/deetz_magazine/"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/instagram.png" width="30" height="30" alt="Instagram" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td></tr></table>
<div style="font-size:12px;color:#6b7280;line-height:1.9;margin-top:14px;"><a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:contact@deetz.kr" style="color:#44474d;text-decoration:none;">contact@deetz.kr</a></div>
<div style="font-size:11px;color:#a1a1aa;margin-top:12px;line-height:1.6;">© 2026 deetz. All rights reserved.</div></td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text, html };
}
