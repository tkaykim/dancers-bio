import "server-only";
import { createHmac } from "node:crypto";
import { sendGmailEmail } from "@/lib/gmail";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreatePrefs } from "@/lib/notify/notification-preferences";

/**
 * 릴스 챌린지 참여 확정 안내 + 제작 가이드라인 메일.
 *
 * 왜 앱에 있나
 *   원래는 30분마다 도는 오토파일럿(scripts/send-challenge-guideline.mjs)이 보냈다.
 *   확정은 지원과 동시에 되는데 메일만 최대 30분 늦어, 어떻게 찍어야 하는지 모른 채
 *   기다리다 이탈하는 사례가 나왔다. 그래서 확정 시점에 이 자리에서 바로 보낸다.
 *
 * 오토파일럿은 안전망으로 그대로 둔다.
 *   멱등 키가 project_notification_log(project_id, recipient_id, channel) 로 같아서,
 *   여기서 보내고 로그를 남기면 오토파일럿은 그 사람을 건너뛴다.
 *   반대로 여기서 발송이 실패하면 오토파일럿이 다음 회차에 주워 간다.
 *
 * ⚠ 본문 정본은 이 파일과 scripts/send-challenge-guideline.mjs 두 곳에 있다.
 *   문구를 고칠 때 한쪽만 고치면 사람마다 다른 안내를 받는다. 반드시 같이 고칠 것.
 */

const CHANNEL = "challenge_guideline_mail";
const CAMPAIGN = "challenge-guideline-2026-08";
const SITE = "https://www.deetz.kr";
const SUBJECT = "[deetz] 릴스 챌린지 참여 확정 — 제작 가이드라인 및 영상 업로드 안내";

const esc = (v: string) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function sections(guideUrl: string): Array<[string, string[]]> {
  return [
    ["일정", [
      "영상 원본 제출 : 8월 23일(일) 23:59까지 (최종 마감 — 이 이상 연장되지 않습니다)",
      "인스타그램 릴스 업로드 : 8월 24일(월)",
      "   검수 소요 시간에 따라 8월 25일(화)로 변경될 가능성이 있습니다.",
      "",
      "안내된 8/24~8/25 외 일정에 게시되면 광고 건으로 인정되지 않을 수 있습니다.",
    ]],
    ["제작 가이드 (촬영 전 필독)", [
      "음원, 활용 안무, 촬영 유의사항이 모두 정리되어 있습니다.",
      guideUrl,
    ]],
    ["광고 인정 기준 (지키지 않으면 인정되지 않을 수 있습니다)", [
      "1. 인스타그램 오디오 탭에서 캠페인 공식 음원을 직접 선택해 주세요.",
      "   곡명 : AI-DOL I Wash",
      "   검색이 안 되면 'AI DOL' 또는 'ai dol I wash' 로 찾아주세요.",
      "2. 음원 볼륨을 1 이상으로 설정해 주세요.",
      "   볼륨이 너무 작으면 시스템이 음원 사용으로 인식하지 못합니다. 잘 들리도록 설정해 주세요.",
      "3. 필수 해시태그를 넣어주세요.",
      "   #광고 #iwash #aidol",
      "   #aidol 은 게시글과 댓글 중 어디에 넣으셔도 괜찮습니다.",
      "4. 브랜드 계정을 태그해 주세요.",
      "   @awc.ent",
      "5. 8월 24일(월)에 업로드해 주세요.",
      "   검수 일정에 따라 8월 25일(화)로 변경될 수 있으며, 변경되면 따로 안내드립니다.",
      "   안내된 날짜 외에 게시되면 광고 건으로 인정되지 않을 수 있습니다.",
    ]],
    ["촬영 방향", [
      "세로형으로 촬영해 주세요. 릴스로 올라가는 영상이라 세로 화면이어야 합니다.",
      "전면 카메라와 후면 카메라 중 어느 쪽을 쓰셔도 괜찮습니다.",
      "좌우반전도 신경 쓰지 않으셔도 됩니다.",
    ]],
    ["표기하시면 안 되는 것", [
      "영상 자막, 게시글, 댓글 어디에도 아래 내용을 넣지 말아 주세요.",
      "",
      "AI WashCombo, AI 워시콤보 등 공식 음원 가사",
      "브랜드명과 제품명",
      "",
      "'I Wash' 는 사용하셔도 됩니다.",
    ]],
    ["영상에 담기면 안 되는 것", [
      "업로드 전 광고주 브랜드 검수가 진행됩니다.",
      "아래에 해당하면 수정 요청을 드릴 수 있습니다.",
      "",
      "선정적이거나 과도한 노출, 폭력적이거나 위협적인 장면",
      "정치·종교·사회적 갈등, 혐오·비하·차별 표현",
      "위험 행위나 안전사고 우려가 있는 연출",
      "음주·흡연·도박·약물",
      "미성년자·아동·반려동물에게 무리한 연출",
      "타 브랜드 비방, 운전 중 촬영",
      "촬영 동의를 받지 않은 타인의 얼굴이 명확히 노출되는 장면",
    ]],
    ["촬영 팁", [
      "가급적 자연광이 드는 야외나 댄스스튜디오, 연습실에서 촬영해 주세요.",
      "집에서 촬영하시더라도 앵글에 신경 써서 '대충 찍은 영상'처럼 보이지 않도록 부탁드립니다.",
    ]],
  ];
}

const CLOSING = [
  "전달드리는 음원과 안무 자료는 대외비입니다.",
  "외부 공유 및 유출은 엄격히 금지되어 있습니다.",
  "",
  "가이드라인에서 크게 벗어나 광고주 측에서 인정하지 않는 경우 페이 지급이 어려울 수 있습니다.",
  "궁금하신 점은 이 메일로 회신 주시면 안내드리겠습니다.",
];

const lines = (arr: string[]) =>
  arr
    .map((l) =>
      l.trim() === ""
        ? `<div style="height:12px;line-height:12px;">&nbsp;</div>`
        : `<div style="font-size:15px;line-height:1.75;color:#33363b;">${esc(l)}</div>`,
    )
    .join("");

const section = (t: string, b: string[]) =>
  `<div style="margin:24px 0 0;"><div style="font-size:13px;font-weight:800;color:#111;margin-bottom:8px;">${esc(t)}</div>${lines(b)}</div>`;

/** 기존 인프라 재사용: GET /api/track/open?c&e&s → email_opens 적재. */
function trackingPixel(email: string): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return "";
  const e = Buffer.from(email, "utf8").toString("base64url");
  const s = createHmac("sha256", key).update(`${CAMPAIGN}|${email}`).digest("base64url");
  const url = `${SITE}/api/track/open?c=${encodeURIComponent(CAMPAIGN)}&e=${e}&s=${s}`;
  return `<img src="${url}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;">`;
}

function buildText(name: string, handle: string, token: string, guideUrl: string): string {
  const out = [
    `${name}님, 안녕하세요.`,
    "deetz 입니다.",
    "",
    "릴스 챌린지 참여가 확정되어 제작 가이드라인과 영상 업로드 방법을 안내드립니다.",
    "",
  ];
  for (const [t, b] of sections(guideUrl)) out.push(`[${t}]`, ...b, "");
  out.push(
    "[영상 업로드 - 본인 전용 링크]",
    "위 가이드를 모두 확인하신 뒤 아래 링크로 올려주세요.",
    `${SITE}/submit/${token}`,
    "로그인이나 회원가입은 필요 없습니다.",
    `파일 이름은 자동으로 ${handle} 으로 저장됩니다.`,
    "",
    ...CLOSING,
  );
  return out.join("\n");
}

function buildHtml(name: string, handle: string, token: string, guideUrl: string, email: string): string {
  const intro = lines([
    `${name}님, 안녕하세요.`,
    "deetz 입니다.",
    "",
    "릴스 챌린지 참여가 확정되어 제작 가이드라인과 영상 업로드 방법을 안내드립니다.",
    "촬영 전에 아래 내용을 꼭 끝까지 읽어봐 주세요.",
  ]);

  // 업로드 버튼은 가이드·필수사항·금지사항을 전부 지난 뒤에 나온다.
  // 위에 두면 가이드를 안 읽고 올려버린다(대표 피드백 2026-08-14).
  const uploadBox = `<div style="margin:26px 0 0;padding:18px;border:1px solid #ececef;border-radius:14px;background:#fafafa;">
<div style="font-size:13px;font-weight:800;color:#111;margin-bottom:8px;">영상 업로드 (본인 전용 링크)</div>
<div style="font-size:14px;line-height:1.7;color:#33363b;">위 가이드를 모두 확인하셨다면 아래 버튼으로 영상을 올려주세요.</div>
<div style="font-size:14px;line-height:1.7;color:#33363b;">로그인이나 회원가입은 필요 없습니다.</div>
<div style="font-size:14px;line-height:1.7;color:#33363b;">파일 이름은 자동으로 <b>${esc(handle)}</b> 으로 저장되니 직접 바꾸실 필요 없습니다.</div>
<div style="margin-top:14px;"><a href="${SITE}/submit/${esc(token)}" style="display:block;background:#111;color:#fff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">영상 올리러 가기</a></div>
<div style="font-size:12px;color:#6b7280;margin-top:10px;">본인에게만 발급된 링크입니다. 다른 분과 공유하지 말아 주세요.</div>
</div>`;

  const body =
    intro + sections(guideUrl).map(([t, b]) => section(t, b)).join("") + uploadBox + section("안내", CLOSING);

  // 외부 이미지 없음 (2026-08-06 Storage egress 사고 이후 방침)
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;"><div style="font-size:26px;font-weight:800;color:#111;line-height:1;">deetz<span style="color:#d4d4d8;">.</span></div><div style="font-size:12px;color:#6b7280;margin-top:6px;">댄서 매거진 &amp; 캐스팅 플랫폼</div></td></tr>
<tr><td style="padding:30px 32px 28px;color:#111;"><span style="display:inline-block;background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">참여 확정 안내</span>${body}</td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;"><div style="font-size:16px;font-weight:800;color:#111;">deetz<span style="color:#d4d4d8;">.</span></div>
<div style="font-size:12px;color:#6b7280;margin:6px 0 14px;">댄서 매거진 &amp; 캐스팅 플랫폼</div>
<div style="font-size:12px;color:#6b7280;line-height:1.9;"><a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:contact@deetz.kr" style="color:#44474d;text-decoration:none;">contact@deetz.kr</a></div>
<div style="font-size:11px;color:#a1a1aa;margin-top:12px;">© 2026 deetz. All rights reserved.</div></td></tr>
</table></td></tr></table>${trackingPixel(email)}</body></html>`;
}

export interface ChallengeGuidelineResult {
  ok: boolean;
  skipped?: "already_sent" | "no_guide" | "no_email" | "no_token";
  error?: string;
}

/**
 * 확정 직후 가이드라인 메일을 보낸다.
 *
 * 실패해도 지원 자체는 성공으로 둔다 — 메일 하나 때문에 접수를 되돌리면 손해가 크고,
 * 오토파일럿이 다음 회차에 다시 시도한다. 그래서 호출부는 결과를 보고만 하면 된다.
 */
export async function sendChallengeGuidelineMail(opts: {
  projectId: string;
  recipientId: string;
  email: string;
  name: string;
  instagramHandle: string;
  token: string;
  guideUrl: string | null;
}): Promise<ChallengeGuidelineResult> {
  const { projectId, recipientId, email, name, instagramHandle, token, guideUrl } = opts;
  if (!guideUrl) return { ok: false, skipped: "no_guide" };
  if (!email) return { ok: false, skipped: "no_email" };
  if (!token) return { ok: false, skipped: "no_token" };

  const admin = createAdminClient();

  // 로그를 먼저 선점한다. 같은 사람이 동시에 두 번 들어와도 한 통만 나가게.
  // ignoreDuplicates 라 이미 있으면 아무 행도 안 돌아온다 = 이미 보냈다는 뜻.
  const { data: claimed, error: claimErr } = await admin
    .from("project_notification_log")
    .upsert(
      { project_id: projectId, recipient_id: recipientId, channel: CHANNEL },
      { onConflict: "project_id,recipient_id,channel", ignoreDuplicates: true },
    )
    .select("recipient_id");

  if (claimErr) return { ok: false, error: claimErr.message };
  if (!claimed?.length) return { ok: true, skipped: "already_sent" };

  // 안내성(bulk) 메일 — List-Unsubscribe 헤더를 붙인다.
  // 이 캠페인은 8일간 600통 넘게 나가면서 일부가 스팸함으로 분류됐다(docs/EMAIL_DELIVERABILITY.md).
  // 토큰 조회가 실패해도 발송은 막지 않는다 — 그 경우 mailto 수신거부만 붙는다.
  let unsubscribeToken: string | null = null;
  try {
    unsubscribeToken = (await getOrCreatePrefs(recipientId)).unsubscribe_token;
  } catch {
    // 무시 — 헤더 하나 때문에 확정 안내를 못 보내는 게 더 나쁘다.
  }

  const res = await sendGmailEmail({
    to: email,
    subject: SUBJECT,
    text: buildText(name, instagramHandle, token, guideUrl),
    html: buildHtml(name, instagramHandle, token, guideUrl, email),
    bulk: true,
    unsubscribeToken,
  });

  if (!res.ok) {
    // 선점해 둔 로그를 되돌린다. 안 그러면 오토파일럿도 건너뛰어 영영 안 나간다.
    await admin
      .from("project_notification_log")
      .delete()
      .eq("project_id", projectId)
      .eq("recipient_id", recipientId)
      .eq("channel", CHANNEL);
    return { ok: false, error: res.error };
  }

  return { ok: true };
}
