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

// deetz 공식 메일 양식(560px 카드 + SNS 푸터) 일정 가능여부 요청 메일.
// 프로젝트의 후보 일정 전체를 한 통에 담아, 한 링크로 일괄 응답하도록 안내.
export function buildScheduleRequestEmail(params: {
  name: string;
  projectTitle: string;
  schedules: Array<{ label: string; whenText: string; locationText?: string | null }>;
  url: string;
  /** 공고 언어. 호출부가 projectLocale() 로 구해 넘긴다. */
  locale?: Locale;
}): { subject: string; text: string; html: string } {
  const { name, projectTitle, schedules, url, locale = DEFAULT_LOCALE } = params;
  const mt = mailTranslator(locale);
  const n = schedules.length;
  const subject = mt("mail.schedule.subject", { name, count: n });

  const text = [
    mt("mail.common.hello", { name }),
    ``,
    mt("mail.schedule.intro", { project: projectTitle }),
    ``,
    ...schedules.flatMap((s) => [
      `· ${s.label}`,
      `  ${mt("mail.schedule.when")}: ${s.whenText}`,
      ...(s.locationText ? [`  ${mt("mail.schedule.where")}: ${s.locationText}`] : []),
    ]),
    ``,
    mt("mail.schedule.text_instruct"),
    `${url}`,
    ``,
    mt("mail.signature.line1"),
    mt("mail.signature.line2"),
  ].join("\n");

  const rows = schedules
    .map(
      (s) => `<div style="border:1px solid #ececef;border-radius:12px;padding:12px 14px;margin-bottom:8px;">
<div style="font-size:14px;font-weight:700;color:#111;">${esc(s.label)}</div>
<div style="font-size:13px;color:#33363b;margin-top:3px;">${esc(s.whenText)}</div>
${s.locationText ? `<div style="font-size:13px;color:#6b7280;margin-top:4px;"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/mappin.png" width="12" height="12" alt="" style="vertical-align:-1px;margin-right:4px;">${esc(s.locationText)}</div>` : ""}
</div>`,
    )
    .join("");

  const html = `<html lang="${locale}"><body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;"><img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="58" height="28" style="display:block;height:28px;width:auto;border:0;"><div style="font-size:12px;color:#6b7280;margin-top:10px;">${esc(mt("mail.brand.tagline"))}</div></td></tr>
<tr><td style="padding:30px 32px 8px;color:#111;"><span style="display:inline-block;background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">${esc(mt("mail.schedule.pill"))}</span>
<p style="font-size:18px;font-weight:700;margin:18px 0 4px;line-height:1.5;">${esc(mt("mail.common.hello", { name }))}</p>
<p style="font-size:15px;line-height:1.75;color:#33363b;margin:0;">${mt("mail.schedule.intro", { project: `<b>${esc(projectTitle)}</b>` })}<br>${esc(mt("mail.schedule.instruct", { count: n }))}</p></td></tr>
<tr><td style="padding:18px 32px 6px;">${rows}</td></tr>
<tr><td style="padding:10px 32px 24px;"><a href="${url}" style="display:block;background:#111;color:#fff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">${esc(mt("mail.schedule.cta"))} →</a>
<p style="font-size:12px;color:#9ca3af;text-align:center;margin:10px 0 0;">${esc(mt("mail.schedule.cta_note"))}</p></td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;"><img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="41" height="20" style="display:block;height:20px;width:auto;border:0;"><div style="font-size:12px;color:#6b7280;margin:10px 0 14px;">${esc(mt("mail.brand.tagline"))}</div>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding-right:10px;"><a href="https://www.youtube.com/@deetzmagazine"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/youtube.png" width="30" height="30" alt="YouTube" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td><td><a href="https://www.instagram.com/deetz.kr/"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/instagram.png" width="30" height="30" alt="Instagram" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td></tr></table>
<div style="font-size:12px;color:#6b7280;line-height:1.9;margin-top:14px;"><a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:contact@deetz.kr" style="color:#44474d;text-decoration:none;">contact@deetz.kr</a></div>
<div style="font-size:11px;color:#a1a1aa;margin-top:12px;line-height:1.6;">© 2026 deetz. All rights reserved.</div></td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text, html };
}
