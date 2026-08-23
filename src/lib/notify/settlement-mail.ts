import "server-only";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
import { mailTranslator } from "@/lib/i18n/mail-messages";

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
  /** 공고 언어. 호출부가 projectLocale() 로 구해 넘긴다. */
  locale?: Locale;
}): { subject: string; text: string; html: string } {
  const {
    name,
    projectTitle,
    grossText,
    taxText,
    netText,
    url,
    locale = DEFAULT_LOCALE,
  } = params;
  const mt = mailTranslator(locale);
  const subject = mt("mail.settle.subject", { name });

  const text = [
    mt("mail.common.hello", { name }),
    ``,
    mt("mail.settle.intro", { project: projectTitle }),
    ``,
    `· ${mt("mail.settle.row_gross")}: ${grossText}`,
    `· ${mt("mail.settle.row_tax")}: -${taxText}`,
    `· ${mt("mail.settle.row_net")}: ${netText}`,
    ``,
    mt("mail.settle.text_instruct_1"),
    mt("mail.settle.text_instruct_2", { net: netText }),
    `${url}`,
    ``,
    mt("mail.signature.line1"),
    mt("mail.signature.line2"),
  ].join("\n");

  const html = `<html lang="${locale}"><body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;"><img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="58" height="28" style="display:block;height:28px;width:auto;border:0;"><div style="font-size:12px;color:#6b7280;margin-top:10px;">${esc(mt("mail.brand.tagline"))}</div></td></tr>
<tr><td style="padding:30px 32px 8px;color:#111;"><span style="display:inline-block;background:#ecfdf5;color:#047857;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">${esc(mt("mail.settle.pill"))}</span>
<p style="font-size:18px;font-weight:700;margin:18px 0 4px;line-height:1.5;">${esc(mt("mail.common.hello", { name }))}</p>
<p style="font-size:15px;line-height:1.75;color:#33363b;margin:0;">${mt("mail.settle.intro", { project: `<b>${esc(projectTitle)}</b>` })}</p></td></tr>
<tr><td style="padding:16px 32px 6px;"><div style="border:1px solid #ececef;border-radius:12px;padding:14px 16px;background:#fafafa;">
<div style="display:flex;justify-content:space-between;font-size:13px;color:#6b7280;padding:3px 0;"><span>${esc(mt("mail.settle.row_gross"))}</span><span style="color:#33363b;">${esc(grossText)}</span></div>
<div style="display:flex;justify-content:space-between;font-size:13px;color:#6b7280;padding:3px 0;"><span>${esc(mt("mail.settle.row_tax"))}</span><span style="color:#33363b;">- ${esc(taxText)}</span></div>
<div style="border-top:1px solid #ececef;margin:8px 0;"></div>
<div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;color:#111;padding:3px 0;"><span>${esc(mt("mail.settle.row_net"))}</span><span>${esc(netText)}</span></div>
</div></td></tr>
<tr><td style="padding:10px 32px 24px;"><a href="${url}" style="display:block;background:#111;color:#fff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">${esc(mt("mail.settle.cta"))} →</a>
<p style="font-size:12px;color:#9ca3af;text-align:center;margin:10px 0 0;">${esc(mt("mail.settle.cta_note"))}</p></td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;"><img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="41" height="20" style="display:block;height:20px;width:auto;border:0;"><div style="font-size:12px;color:#6b7280;margin:10px 0 14px;">${esc(mt("mail.brand.tagline"))}</div>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding-right:10px;"><a href="https://www.youtube.com/@deetzmagazine"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/youtube.png" width="30" height="30" alt="YouTube" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td><td><a href="https://www.instagram.com/deetz.kr/"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/instagram.png" width="30" height="30" alt="Instagram" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td></tr></table>
<div style="font-size:12px;color:#6b7280;line-height:1.9;margin-top:14px;"><a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:contact@deetz.kr" style="color:#44474d;text-decoration:none;">contact@deetz.kr</a></div>
<div style="font-size:11px;color:#a1a1aa;margin-top:12px;line-height:1.6;">© 2026 deetz. All rights reserved.</div></td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text, html };
}
