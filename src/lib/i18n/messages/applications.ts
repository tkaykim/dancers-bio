import type { Messages } from "../t";

/**
 * 내 지원(/applications) · 받은 제안(/proposals) · 본인인증(/verify-instagram) 화면 문구.
 *
 * 선발 단계 enum 라벨은 labels.ts(labelFor) 를 쓰고, 여기에는 이 화면에서만 쓰는
 * 그룹 머리글(group.*)·안내 문장(stage.*)만 둔다. 두 곳의 표현이 서로 다르기 때문이다.
 * 키 이름은 `<화면>.<요소>[.<상태>]` (docs/design-i18n-ui.md 부록 C).
 */
const ko = {
  // ── /applications ────────────────────────────────────────
  "list.eyebrow": "↳ 지원 / 제안",
  "list.title": "내 지원",
  "list.total_one": "총 {count}건",
  "list.total_other": "총 {count}건",
  "list.message": "메시지",
  "list.empty": "아직 지원한 프로젝트가 없습니다.",
  "list.browse_feed": "↳ 피드 보기",
  "list.project_deleted": "(삭제된 프로젝트)",
  "list.source.apply": "지원",
  "list.source.direct_proposal": "받은 제안",
  "list.campaign.title": "참여 중인 챌린지 · 게시물 제출",
  "list.campaign.item": "{title} · 링크 제출·확인 →",
  "list.campaign.untitled": "확정 참여 챌린지",
  "list.submit.open": "영상 제출하기 →",
  "list.submit.done": "제출한 영상 확인 · 다시 올리기",

  // 그룹 머리글 — labels.ts 의 stage.* 와 표현이 달라 화면 전용으로 둔다.
  "group.heading": "{label} ({count})",
  "group.final": "최종 합격",
  "group.in_progress": "선발 진행 중",
  "group.pending": "검토 중",
  "group.rejected": "불합격",
  "group.declined": "포기함",
  "group.withdrawn": "취소·만료",

  // 단계 안내 — application-stage.ts 의 한국어 출력과 글자까지 같아야 한다.
  "stage.accepted_pending_confirm": "합격 (최종 확정 대기)",
  "stage.not_final_caveat":
    "아직 최종 합격이 아닙니다. 다음 단계({stage}) 결과에 따라 최종 진행이 되지 않을 수 있습니다.",
  "stage.decline_hint": "일정에 변동이 있으시다면 참여 포기로 미리 반영 부탁드립니다.",
  "stage.decline_hint_emphasis": "참여 포기",
  "stage.final.confirmed": "최종 합격이 확정되었습니다.",
  "stage.final.locked":
    "이 단계부터는 직접 포기가 불가능합니다. 부득이한 사정은 contact@deetz.kr로 연락해 주세요.",

  // ── /proposals ───────────────────────────────────────────
  "proposals.title": "받은 제안",
  "proposals.subtitle": "나에게 도착한 캐스팅 제안을 확인하고 응답하세요.",
  "proposals.empty": "아직 받은 제안이 없습니다.",
  "proposals.section.pending": "응답 대기 {count}",
  "proposals.section.resolved": "처리됨 {count}",
  "proposals.card.from": "{name} 님의 제안",
  "proposals.card.project_fallback": "프로젝트",
  "proposals.card.owner_fallback": "프로젝트 개설자",
  "proposals.card.accepted_note": "수락했습니다 · 프로젝트 페이지에서 상세를 확인하세요.",
  "proposals.status.pending": "응답 대기",
  "proposals.status.accepted": "수락함",
  "proposals.status.declined": "거절함",
  "proposals.status.rejected": "거절됨",
  "proposals.status.withdrawn": "철회됨",
  "proposals.status.expired": "만료됨",

  // ── /verify-instagram ────────────────────────────────────
  "verify.eyebrow": "↳ 본인인증",
  "verify.title": "인스타그램으로 본인 확인",
  "verify.title.claim": "프로필 본인 확인",
  "verify.claim.heading": "{name} 프로필 본인 인증",
  "verify.claim.desc": "인스타그램 DM 1회로 신원을 확인하면 즉시 본인 프로필로 연결됩니다.",
  "verify.intro":
    "프로젝트를 개설하고 다이렉트 제안을 보내려면 본인 인증이 필요합니다. 인스타그램 DM 1회로 끝납니다.",
  "verify.reject.title": "이전 요청 반려",
  "verify.back.portfolio": "← 내 포트폴리오로",
  "verify.back.profile": "← 내 프로필로",

  "verify.code.eyebrow": "↳ 인증 코드",
  "verify.dm.instruction":
    "아래 메시지를 {account}로 DM 보내주세요. 관리자가 매칭되는 코드를 확인하고 승인합니다 (보통 1영업일 이내).",
  "verify.dm.message": "dancers.bio 본인인증\n@{handle}\n코드: {code}",
  "verify.copy": "메시지 복사",
  "verify.copied": "복사됨!",
  "verify.dm_link": "인스타그램에서 DM 보내기 →",
  "verify.expires": "만료: {date}",
  "verify.retry": "다른 핸들로 다시 시도",
  "verify.handle_label": "인스타그램 핸들",
  "verify.handle_placeholder": "your_handle (@ 빼고)",
  "verify.handle_help":
    "본인의 공개 인스타그램 핸들을 입력하면 6자리 코드를 발급합니다. 발급된 코드와 본인 핸들을 {account}로 DM 보내면 관리자가 매칭 후 인증 처리합니다.",
  "verify.submit": "인증 코드 받기",
  "verify.submitting": "발급 중...",
} as const;

type Key = keyof typeof ko;

const en: Record<Key, string> = {
  "list.eyebrow": "↳ Applications / offers",
  "list.title": "My applications",
  "list.total_one": "{count} application",
  "list.total_other": "{count} applications",
  "list.message": "Message",
  "list.empty": "You have not applied to any projects yet.",
  "list.browse_feed": "↳ Browse the feed",
  "list.project_deleted": "(Deleted project)",
  "list.source.apply": "Applied",
  "list.source.direct_proposal": "Direct offer",
  "list.campaign.title": "Challenges you joined · Submit your post",
  "list.campaign.item": "{title} · Submit or check your link →",
  "list.campaign.untitled": "Confirmed challenge",
  "list.submit.open": "Submit your video →",
  "list.submit.done": "Check or re-upload your video",

  "group.heading": "{label} ({count})",
  "group.final": "Final selection",
  "group.in_progress": "In selection",
  "group.pending": "Under review",
  "group.rejected": "Not selected",
  "group.declined": "Declined",
  "group.withdrawn": "Cancelled / expired",

  "stage.accepted_pending_confirm": "Passed (awaiting final confirmation)",
  "stage.not_final_caveat":
    "This is not the final selection yet. Depending on the result of the next step ({stage}), you may not move forward.",
  "stage.decline_hint": "If your schedule changes, please let us know in advance using Decline.",
  "stage.decline_hint_emphasis": "Decline",
  "stage.final.confirmed": "Your final selection is confirmed.",
  "stage.final.locked":
    "From this point you cannot decline on your own. If something unavoidable comes up, please contact contact@deetz.kr.",

  "proposals.title": "Direct offers",
  "proposals.subtitle": "Review the casting offers you received and respond.",
  "proposals.empty": "You have not received any offers yet.",
  "proposals.section.pending": "Awaiting reply {count}",
  "proposals.section.resolved": "Handled {count}",
  "proposals.card.from": "Offer from {name}",
  "proposals.card.project_fallback": "Project",
  "proposals.card.owner_fallback": "Project owner",
  "proposals.card.accepted_note": "Accepted · See the details on the project page.",
  "proposals.status.pending": "Awaiting reply",
  "proposals.status.accepted": "Accepted",
  "proposals.status.declined": "Declined",
  "proposals.status.rejected": "Not selected",
  "proposals.status.withdrawn": "Withdrawn",
  "proposals.status.expired": "Expired",

  "verify.eyebrow": "↳ Identity verification",
  "verify.title": "Verify your identity with Instagram",
  "verify.title.claim": "Verify this profile is yours",
  "verify.claim.heading": "Verify that the {name} profile is yours",
  "verify.claim.desc":
    "One Instagram DM confirms your identity and links the profile to you right away.",
  "verify.intro":
    "To post projects and send direct offers you need to verify your identity. One Instagram DM is all it takes.",
  "verify.reject.title": "Previous request rejected",
  "verify.back.portfolio": "← Back to my portfolio",
  "verify.back.profile": "← Back to my profile",

  "verify.code.eyebrow": "↳ Verification code",
  "verify.dm.instruction":
    "Send the message below as a DM to {account}. Our team checks the matching code and approves it, usually within one business day.",
  "verify.dm.message": "dancers.bio identity verification\n@{handle}\nCode: {code}",
  "verify.copy": "Copy message",
  "verify.copied": "Copied!",
  "verify.dm_link": "Send a DM on Instagram →",
  "verify.expires": "Expires: {date}",
  "verify.retry": "Try a different handle",
  "verify.handle_label": "Instagram handle",
  "verify.handle_placeholder": "your_handle (without @)",
  "verify.handle_help":
    "Enter your public Instagram handle and we will issue a 6-digit code. DM that code and your handle to {account}, and our team verifies you once they match.",
  "verify.submit": "Get a verification code",
  "verify.submitting": "Issuing...",
};

const ja: Record<Key, string> = {
  "list.eyebrow": "↳ 応募 / オファー",
  "list.title": "応募履歴",
  "list.total_one": "全{count}件",
  "list.total_other": "全{count}件",
  "list.message": "メッセージ",
  "list.empty": "まだ応募したプロジェクトはありません。",
  "list.browse_feed": "↳ フィードを見る",
  "list.project_deleted": "（削除されたプロジェクト）",
  "list.source.apply": "応募",
  "list.source.direct_proposal": "直接オファー",
  "list.campaign.title": "参加中のチャレンジ・投稿の提出",
  "list.campaign.item": "{title} · リンクの提出・確認 →",
  "list.campaign.untitled": "参加が確定したチャレンジ",
  "list.submit.open": "動画を提出する →",
  "list.submit.done": "提出した動画の確認・再アップロード",

  "group.heading": "{label}（{count}）",
  "group.final": "最終合格",
  "group.in_progress": "選考中",
  "group.pending": "審査中",
  "group.rejected": "不合格",
  "group.declined": "辞退",
  "group.withdrawn": "取消・期限切れ",

  "stage.accepted_pending_confirm": "合格（最終確定待ち）",
  "stage.not_final_caveat":
    "まだ最終合格ではありません。次の段階（{stage}）の結果によっては、最終的に進まない場合があります。",
  "stage.decline_hint": "スケジュールに変更がある場合は、早めに「参加を辞退」の操作を行ってください。",
  "stage.decline_hint_emphasis": "参加を辞退",
  "stage.final.confirmed": "最終合格が確定しました。",
  "stage.final.locked":
    "この段階からはご自身で辞退することはできません。やむを得ない事情がある場合は contact@deetz.kr までご連絡ください。",

  "proposals.title": "直接オファー",
  "proposals.subtitle": "届いたキャスティングオファーを確認して返信しましょう。",
  "proposals.empty": "まだ届いたオファーはありません。",
  "proposals.section.pending": "返信待ち {count}",
  "proposals.section.resolved": "対応済み {count}",
  "proposals.card.from": "{name}さんからのオファー",
  "proposals.card.project_fallback": "プロジェクト",
  "proposals.card.owner_fallback": "プロジェクト作成者",
  "proposals.card.accepted_note": "承諾しました。プロジェクトページで詳細をご確認ください。",
  "proposals.status.pending": "返信待ち",
  "proposals.status.accepted": "承諾",
  "proposals.status.declined": "辞退",
  "proposals.status.rejected": "見送り",
  "proposals.status.withdrawn": "取り下げ",
  "proposals.status.expired": "期限切れ",

  "verify.eyebrow": "↳ 本人確認",
  "verify.title": "Instagramで本人確認",
  "verify.title.claim": "プロフィールの本人確認",
  "verify.claim.heading": "{name} プロフィールの本人確認",
  "verify.claim.desc":
    "Instagramのダイレクトメッセージ1通で本人確認ができ、すぐにご自身のプロフィールに紐づきます。",
  "verify.intro":
    "プロジェクトを作成して直接オファーを送るには本人確認が必要です。Instagramのダイレクトメッセージ1通で完了します。",
  "verify.reject.title": "前回の申請は却下されました",
  "verify.back.portfolio": "← マイポートフォリオへ",
  "verify.back.profile": "← マイプロフィールへ",

  "verify.code.eyebrow": "↳ 認証コード",
  "verify.dm.instruction":
    "下のメッセージを {account} へDMで送ってください。運営が一致するコードを確認して承認します（通常1営業日以内）。",
  "verify.dm.message": "dancers.bio 本人確認\n@{handle}\nコード: {code}",
  "verify.copy": "メッセージをコピー",
  "verify.copied": "コピーしました！",
  "verify.dm_link": "InstagramでDMを送る →",
  "verify.expires": "有効期限：{date}",
  "verify.retry": "別のユーザー名で再試行",
  "verify.handle_label": "Instagramのユーザー名",
  "verify.handle_placeholder": "your_handle（@なし）",
  "verify.handle_help":
    "ご自身の公開Instagramアカウントのユーザー名を入力すると6桁のコードを発行します。発行されたコードとご自身のユーザー名を {account} へDMで送ると、運営が照合して本人確認を行います。",
  "verify.submit": "認証コードを受け取る",
  "verify.submitting": "発行中…",
};

const messages = { ko, en, ja } satisfies Messages<Key>;
export default messages;
