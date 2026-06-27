import "server-only";

// 클라이언트에게 보내는 캐스팅 보드 안내 메일 (deetz 560px 카드 양식).
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildCastingBoardEmail(params: {
  boardTitle: string | null;
  boardUrl: string;
  recipientName: string | null;
  message: string | null;
}): { subject: string; text: string; html: string } {
  const title = params.boardTitle?.trim() || "캐스팅 명단";
  const hello = params.recipientName?.trim() ? `${params.recipientName.trim()}님, 안녕하세요.` : "안녕하세요.";
  const msg = params.message?.trim() || "요청하신 캐스팅 후보 명단을 보내드립니다.\n아래 버튼에서 프로필을 확인해 주세요.";

  const subject = `[deetz] ${title}`;
  const text = [
    hello,
    "",
    msg,
    "",
    `캐스팅 보드 보기: ${params.boardUrl}`,
    "",
    "본 자료는 캐스팅 검토용이며, 무단 외부 공유 및 소속 댄서에 대한 직접 섭외를 금합니다.",
    "",
    "deetz · 댄서 매거진 & 캐스팅 플랫폼",
    "deetz.kr · dancers.bio.kr@gmail.com",
  ].join("\n");

  const msgHtml = esc(msg).replace(/\n/g, "<br>");
  const html = `<html lang="ko"><body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="58" height="28" style="display:block;height:28px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin-top:10px;">댄서 매거진 &amp; 캐스팅 플랫폼</div></td></tr>
<tr><td style="padding:30px 32px 8px;color:#111111;">
  <span style="display:inline-block;background:#f1f1f3;color:#6b7280;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">캐스팅 안내</span>
  <p style="font-size:18px;font-weight:700;margin:18px 0 4px;line-height:1.5;">${esc(title)}</p>
  <p style="font-size:15px;line-height:1.75;color:#33363b;margin:8px 0 0;">${esc(hello)}<br>${msgHtml}</p></td></tr>
<tr><td style="padding:18px 32px 24px;">
  <a href="${esc(params.boardUrl)}" style="display:block;background:#111111;color:#ffffff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">캐스팅 보드 보기 →</a></td></tr>
<tr><td style="padding:0 32px 18px;">
  <div style="background:#f6f6f7;border:1px solid #ececef;border-radius:12px;padding:12px 16px;font-size:12px;color:#6b7280;line-height:1.6;">본 자료는 캐스팅 검토용입니다.<br>무단 외부 공유 및 소속 댄서에 대한 직접 섭외를 금합니다.</div></td></tr>
<tr><td style="padding:18px 32px 26px;border-top:1px solid #ececef;background:#fafafa;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="41" height="20" style="display:block;height:20px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;line-height:1.9;margin-top:8px;">
    <a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:dancers.bio.kr@gmail.com" style="color:#44474d;text-decoration:none;">dancers.bio.kr@gmail.com</a></div>
  <div style="font-size:11px;color:#a1a1aa;margin-top:10px;">© 2026 deetz. All rights reserved.</div></td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text, html };
}
