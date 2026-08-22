import "server-only";
import type { Locale } from "./locale";
import { interpolate } from "./interpolate";

/**
 * 지원자에게 나가는 프로젝트 메일 문구 사전.
 *
 * 왜 화면 사전(messages.ts)과 나눠 두나
 *   화면 사전은 클라이언트 컴포넌트가 import 한다. 메일 문구까지 거기 넣으면
 *   지원자 브라우저가 쓰지도 않는 메일 본문을 통째로 내려받는다.
 *
 * 왜 필요한가
 *   영문 전용 공고 4wbhr5(China Tour, "Applicants with Korean or Japanese
 *   nationality are not eligible")에서 이미 한국어 메일 45통이 나갔다.
 *   불합격 35 · 1차 합격 7 · 최종 합격 3 — 전원 한국어를 못 읽는 대상이다.
 *
 * 여기 없는 것
 *   - 운영자에게 가는 메일(합격자 포기 알림 등)은 한국어 고정이다.
 *   - 공고별 덮어쓰기 문구(round_messages.body/note)와 round_labels 는
 *     운영자가 직접 쓴 글이라 그대로 통과시킨다. 번역하지 않는다.
 *
 * 마크업은 담지 않는다. <strong> 같은 강조는 렌더러 쪽에서 감싼다 —
 * 그래야 같은 문장을 HTML 과 text 본문에 함께 쓸 수 있다.
 */

const ko = {
  // ── 공통 껍데기 ────────────────────────────────────────────
  "mail.brand.tagline": "댄서 매거진 & 캐스팅 플랫폼",
  "mail.brand.sent_notice": "이 메일은 deetz에 지원하신 주소로 발송되었습니다.",
  "mail.recipient.fallback_name": "지원자",
  "mail.text.greeting": "안녕하세요 {name}님,",
  "mail.common.hello": "{name}님, 안녕하세요.",
  "mail.common.project": "프로젝트",
  "mail.text.important_prefix": "[중요] ",
  "mail.signature.line1": "deetz · 댄서 매거진 & 캐스팅 플랫폼",
  "mail.signature.line2": "deetz.kr · contact@deetz.kr",
  "mail.signature.social":
    "Instagram instagram.com/deetz.kr · YouTube youtube.com/@deetzmagazine",


  // ── 단계 통과 안내 ─────────────────────────────────────────
  "mail.stage.subject_final": "[deetz] 최종 합격 안내",
  "mail.stage.subject_round": "[deetz] {label} 안내 (최종 확정 아님)",
  "mail.stage.pill_not_final": "{label} (최종 확정 아님)",
  "mail.stage.heading_final": "{name}님, 최종 합격하셨습니다.",
  "mail.stage.heading_round": "{name}님, {label}을 안내드립니다.",
  "mail.stage.body_final_1": "모든 선발 절차가 끝나 최종 합격하셨음을 안내드립니다.",
  "mail.stage.body_final_2": "함께하게 되어 반갑습니다.",
  "mail.stage.body_round_1": "deetz를 통해 지원해 주셔서 감사합니다.",
  "mail.stage.body_round_2": "보내주신 프로필을 검토한 결과, {label}하셨습니다.",
  "mail.stage.row_project": "지원 프로젝트",
  "mail.stage.row_stage": "현재 단계",
  "mail.stage.stage_value": "{label} ({round}/{total}단계)",
  "mail.stage.notice_final_1": "이 단계부터는 앱에서 직접 포기하실 수 없습니다.",
  "mail.stage.notice_final_2":
    "부득이한 사정이 생기면 즉시 contact@deetz.kr 로 알려주세요.",
  "mail.stage.notice_final_3":
    "확정 이후의 이탈은 클라이언트 일정과 다른 참여자에게 영향을 줍니다.",
  "mail.stage.notice_round_1": "이번 안내는 최종 합격이 아닙니다.",
  "mail.stage.notice_round_2":
    "다음 단계({next}) 결과에 따라 최종 진행이 되지 않을 수 있습니다.",
  "mail.stage.notice_round_3":
    "결과가 나오는 대로 합격·불합격 여부와 관계없이 다시 안내드립니다.",
  "mail.stage.footer_round_1":
    "일정이나 사정상 참여가 어려우시면, 내 지원 현황에서 직접 포기하실 수 있습니다.",
  "mail.stage.footer_round_2":
    "최종 합격으로 확정된 경우에는 포기가 어려우니, 일정에 변동이 있으시다면 미리 반영 부탁드립니다.",
  "mail.stage.cta": "내 지원 현황 보기",
  "mail.stage.text_applications": "내 지원 현황",

  // ── 지원 결과(불합격) 안내 ─────────────────────────────────
  "mail.reject.subject": "[deetz] 지원 결과 안내",
  "mail.reject.pill": "지원 결과 안내",
  "mail.reject.body_1": "deetz를 통해 지원해 주셔서 진심으로 감사합니다.",
  "mail.reject.body_2":
    "신중히 검토했지만, 아쉽게도 이번 프로젝트에서는 함께하지 못하게 되었습니다.",
  "mail.reject.notice_1":
    "프로필을 채워두시면 다음 캐스팅에서 성사될 확률이 올라갑니다.",
  "mail.reject.notice_2":
    "프로필 사진, 주요 경력, 춤 영상, 인스타그램 연결이 특히 큰 영향을 줍니다.",
  "mail.reject.notice_3":
    "캐스팅을 의뢰하는 클라이언트가 이 정보를 보고 후보를 추리기 때문입니다.",
  "mail.reject.footer_1": "직접 정리하시기 번거로우시면, 이 메일로 회신만 주셔도 됩니다.",
  "mail.reject.footer_2":
    "프로필 사진, 포트폴리오 파일, 또는 경력을 정리한 텍스트를 보내주시면 저희가 프로필에 대신 업데이트해 드립니다.",
  "mail.reject.footer_3":
    "보내주신 관심과 노력에 깊이 감사드리며, 더 좋은 기회로 다시 만나뵙기를 바랍니다.",
  "mail.reject.cta": "내 프로필 채우러 가기",
  "mail.reject.text_profile": "내 프로필",
  "mail.reject.text_feed": "다른 캐스팅 둘러보기",

  // ── 공지(본문은 전부 운영자 작성 — 껍데기만 번역한다) ──────
  "mail.announce.pill": "공지",
  "mail.announce.subject_fallback": "공지",
  "mail.announce.heading_fallback": "{name}님께 안내드립니다.",
  "mail.announce.empty": "(내용 없음)",

  // ── 일정 참석 가능 여부 요청 ───────────────────────────────
  "mail.schedule.subject": "[deetz] {name}님, 일정 {count}건 참석 가능 여부를 알려주세요",
  "mail.schedule.pill": "일정 안내",
  "mail.schedule.intro": "{project} 프로젝트의 일정이 잡혀 안내드립니다.",
  "mail.schedule.instruct": "아래 {count}개 일정의 참석 가능 여부를 눌러 한 번에 제출해 주세요.",
  "mail.schedule.text_instruct":
    "아래 링크에서 로그인 없이 각 일정의 참석 가능 여부만 눌러 한 번에 제출해 주세요. (가능 / 시간 일부 / 불가)",
  "mail.schedule.when": "일시",
  "mail.schedule.where": "장소",
  "mail.schedule.cta": "참석 가능 여부 알려주기",
  "mail.schedule.cta_note": "로그인 없이 30초면 끝나요 (가능 / 시간 일부 / 불가)",

  // ── 정산 확정·출금 안내 ────────────────────────────────────
  "mail.settle.subject": "[deetz] {name}님, 정산 금액이 확정되었어요 — 출금 신청 안내",
  "mail.settle.pill": "정산 안내",
  "mail.settle.intro": "{project} 프로젝트의 정산 금액이 확정되어 안내드립니다.",
  "mail.settle.row_gross": "세전 금액",
  "mail.settle.row_tax": "원천징수 (3.3%)",
  "mail.settle.row_net": "실수령액",
  "mail.settle.text_instruct_1":
    "아래 링크에서 로그인 후 계좌를 확인하고 출금 신청을 눌러 주세요.",
  "mail.settle.text_instruct_2":
    "신청하시면 원천징수 3.3%를 제외한 {net}이 등록된 계좌로 입금됩니다.",
  "mail.settle.cta": "출금 신청하러 가기",
  "mail.settle.cta_note": "로그인 후 계좌 확인 → 출금 신청 (원천징수 3.3% 제외 입금)",
} as const;

export type MailKey = keyof typeof ko;

/** ko 와 키가 어긋나면 여기서 타입 에러가 난다 — 번역 누락 방지. */
const en: Record<MailKey, string> = {
  "mail.brand.tagline": "Dance magazine & casting platform",
  "mail.brand.sent_notice":
    "This email was sent to the address you applied with on deetz.",
  "mail.recipient.fallback_name": "Applicant",
  "mail.text.greeting": "Hello {name},",
  "mail.common.hello": "Hello {name},",
  "mail.common.project": "Project",
  "mail.text.important_prefix": "[IMPORTANT] ",
  "mail.signature.line1": "deetz · Dance magazine & casting platform",
  "mail.signature.line2": "deetz.kr · contact@deetz.kr",
  "mail.signature.social":
    "Instagram instagram.com/deetz.kr · YouTube youtube.com/@deetzmagazine",


  "mail.stage.subject_final": "[deetz] You have been selected",
  "mail.stage.subject_round": "[deetz] {label} — not final yet",
  "mail.stage.pill_not_final": "{label} (not final)",
  "mail.stage.heading_final": "{name}, you have been selected.",
  "mail.stage.heading_round": "{name}, here is an update on your application.",
  "mail.stage.body_final_1":
    "All selection rounds are complete, and you have been selected for this project.",
  "mail.stage.body_final_2": "We are glad to have you on board.",
  "mail.stage.body_round_1": "Thank you for applying through deetz.",
  "mail.stage.body_round_2":
    "After reviewing your profile, we are moving you forward: {label}.",
  "mail.stage.row_project": "Project",
  "mail.stage.row_stage": "Current stage",
  "mail.stage.stage_value": "{label} ({round} of {total})",
  "mail.stage.notice_final_1":
    "From this point on you cannot withdraw yourself in the app.",
  "mail.stage.notice_final_2":
    "If something unavoidable comes up, tell us right away at contact@deetz.kr.",
  "mail.stage.notice_final_3":
    "Dropping out after confirmation affects the client's schedule and the other dancers.",
  "mail.stage.notice_round_1": "This is not the final decision.",
  "mail.stage.notice_round_2":
    "Depending on the next round ({next}), you may not be selected in the end.",
  "mail.stage.notice_round_3":
    "We will let you know either way as soon as the result is in.",
  "mail.stage.footer_round_1":
    "If your schedule no longer allows it, you can withdraw yourself from My applications.",
  "mail.stage.footer_round_2":
    "Withdrawing is not possible once you are finally selected, so please tell us early if your schedule changes.",
  "mail.stage.cta": "View my applications",
  "mail.stage.text_applications": "My applications",

  "mail.reject.subject": "[deetz] Result of your application",
  "mail.reject.pill": "Application result",
  "mail.reject.body_1": "Thank you sincerely for applying through deetz.",
  "mail.reject.body_2":
    "We reviewed your application carefully, but we will not be moving forward together on this project.",
  "mail.reject.notice_1":
    "Filling out your profile raises your chances on the next casting.",
  "mail.reject.notice_2":
    "A profile photo, key credits, dance videos and a linked Instagram make the biggest difference.",
  "mail.reject.notice_3":
    "Clients shortlist candidates by looking at exactly this information.",
  "mail.reject.footer_1":
    "If putting it together is a hassle, just reply to this email.",
  "mail.reject.footer_2":
    "Send us a profile photo, a portfolio file, or your credits as plain text, and we will update your profile for you.",
  "mail.reject.footer_3":
    "Thank you for your interest and effort. We hope to work with you on a better-fitting project.",
  "mail.reject.cta": "Fill out my profile",
  "mail.reject.text_profile": "My profile",
  "mail.reject.text_feed": "Browse other castings",

  "mail.announce.pill": "Announcement",
  "mail.announce.subject_fallback": "Announcement",
  "mail.announce.heading_fallback": "A message for you, {name}.",
  "mail.announce.empty": "(no content)",

  "mail.schedule.subject":
    "[deetz] {name}, please confirm your availability for {count} date(s)",
  "mail.schedule.pill": "Schedule",
  "mail.schedule.intro": "Dates have been set for the project {project}.",
  "mail.schedule.instruct":
    "Tell us whether you are available for each of the {count} dates below, all in one go.",
  "mail.schedule.text_instruct":
    "Open the link below and mark your availability for each date. No login needed. (available / partly / unavailable)",
  "mail.schedule.when": "When",
  "mail.schedule.where": "Where",
  "mail.schedule.cta": "Confirm your availability",
  "mail.schedule.cta_note":
    "No login, about 30 seconds (available / partly / unavailable)",

  "mail.settle.subject":
    "[deetz] {name}, your payment amount is confirmed — how to withdraw",
  "mail.settle.pill": "Payment",
  "mail.settle.intro":
    "The payment amount for the project {project} has been confirmed.",
  "mail.settle.row_gross": "Gross amount",
  "mail.settle.row_tax": "Withholding tax (3.3%)",
  "mail.settle.row_net": "Net payout",
  "mail.settle.text_instruct_1":
    "Sign in through the link below, check your bank account, and press Request withdrawal.",
  "mail.settle.text_instruct_2":
    "Once you request it, {net} is transferred to your registered account after the 3.3% withholding tax.",
  "mail.settle.cta": "Request a withdrawal",
  "mail.settle.cta_note":
    "Sign in, check your account, then request the withdrawal (paid out after 3.3% withholding tax)",
};

const MAIL_MESSAGES: Record<Locale, Record<MailKey, string>> = { ko, en };

export function mailT(
  locale: Locale,
  key: MailKey,
  vars?: Record<string, string | number>,
): string {
  return interpolate(MAIL_MESSAGES[locale][key], vars);
}

/** 메일 하나를 만드는 동안 locale 을 계속 들고 다니지 않도록 묶는다. */
export function mailTranslator(locale: Locale) {
  return (key: MailKey, vars?: Record<string, string | number>) =>
    mailT(locale, key, vars);
}
