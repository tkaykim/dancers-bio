import type { Messages } from "../t";

/**
 * 공고 상세(`/projects/[id]`)·지원 폼·제안 응답·공유 문구
 * (docs/design-i18n-ui.md §3.4 "project"). 피드 목록·카드는 `feed` 네임스페이스다.
 * 공고 제목·본문은 이용자 작성 원문이라 번역하지 않고 `data-ugc` 로 표시한다.
 */
const ko = {
  "meta.not_found": "프로젝트를 찾을 수 없습니다",
  "meta.private_title": "비공개 프로젝트 · deetz",
  "meta.private_description": "초대 링크로만 확인할 수 있는 deetz 비공개 프로젝트입니다.",
  "meta.fallback_description": "댄서 캐스팅 공고",
  "meta.og_title": "{title} · deetz",

  "nav.back_feed": "캐스팅 피드",

  "badge.standing": "상시 모집",

  "stat.pay": "페이",
  "stat.recruit": "모집",
  "stat.deadline": "마감",
  "stat.recruit_unlimited": "제한 없음",
  "stat.recruit_count_one": "{count}명",
  "stat.recruit_count_other": "{count}명",
  "stat.deadline_standing": "상시",

  "pay.none": "별도 페이 없음",
  "pay.negotiable": "협의",
  "pay.amount": "₩ {amount}",
  "pay.amount_per_session": "₩ {amount} · 회차당",

  "section.description": "↳ 상세 설명",
  "section.attachments": "↳ 참고자료 ({count})",
  "section.announcements": "↳ 공지 ({count})",
  "section.sessions": "↳ 일정 ({count})",
  "section.manage": "↳ 운영",
  "section.my_application": "↳ 내 지원 상태",

  "attachment.file": "파일",
  "attachment.open": "열기 →",

  "announcement.pinned": "고정",

  "session.confirmed": "확정",
  "session.cancelled": "취소됨",
  "session.undecided": "미정",

  "manage.applicants": "지원자 보기 →",
  "manage.edit": "공고 수정",

  "closed.expired": "지원 마감일이 지났습니다.",
  "closed.closed": "현재 모집이 닫혀 있습니다.",

  "guest.quick_hint": "회원가입 없이 이름과 연락처만으로 바로 접수할 수 있어요.",
  "guest.quick_cta": "회원가입 없이 접수하기 →",
  "guest.have_account": "이미 deetz 계정이 있어요",
  "guest.login_hint": "지원하려면 로그인 또는 회원가입이 필요해요.",
  "guest.login_cta": "로그인하고 지원하기 →",
  "guest.signup_cta": "회원가입",

  "mine.link": "지원 목록에서 보기 →",

  "media.section": "공고 사진과 영상",
  "media.open_original": "{name} 원본 이미지 열기",
  "media.video_unsupported": "이 브라우저에서는 영상을 재생할 수 없습니다.",

  "share.label": "공유",
  "share.aria": "공고 공유",
  "share.copied_toast": "링크를 복사했습니다",
  "share.copy_failed": "복사하지 못했습니다",

  "proposal.pending": "처리 중…",
  "proposal.accept": "수락",
  "proposal.decline": "거절",

  "apply.needs_dancer_title": "지원하려면 먼저 댄서 프로필이 필요합니다.",
  "apply.needs_dancer_hint": "30초만에 만들 수 있어요. 만들고 나면 이 공고로 자동 복귀합니다.",
  "apply.needs_dancer_cta": "댄서 프로필 만들기 →",
  "apply.error_schedule_required": "참석 가능한 일정을 하나 이상 선택해 주세요.",
  "apply.error_fee_required": "러프한 금액이라도 제안 단가를 입력해 주세요.",
  "apply.success_accepted": "지원이 완료됐습니다. 바로 진행하시면 됩니다.",
  "apply.success": "지원이 완료됐습니다.",
  "apply.cover_label": "↳ 한 줄 자기소개 (선택)",
  "apply.cover_label_companion": "↳ 지원 한마디 (선택)",
  "apply.companion_hint": "동반인이 있다면 Instagram 핸들(@인스타그램아이디)을 남겨 주세요.",
  "apply.channel_label": "모집채널:",
  "apply.cover_placeholder": "예: 무대 댄서 7년차, K-pop 다수 경험 보유. 빠른 캐치 자신 있어요.",
  "apply.cover_placeholder_companion": "예: 함께 참여할 동반인 @instagram_id",

  "apply.availability_legend": "참석 가능한 일정 (필수)",
  "apply.availability_hint":
    "참석 가능한 일정을 모두 선택해 주세요. 선택하지 않은 일정은 참여 불가로 제출됩니다.",
  "apply.availability_select_all": "전체 선택",
  "apply.availability_clear_all": "전체 해제",

  "apply.casting_legend": "상세 지원 정보",
  "apply.casting_hint":
    "회원 프로필에 등록된 정보는 자동으로 불러왔습니다. 비어 있거나 달라진 내용은 여기서 바로 수정해 제출해 주세요.",
  "apply.name": "이름 *",
  "apply.birth_year": "출생연도 *",
  "apply.birth_year_placeholder": "예: 1998",
  "apply.height": "키(cm) *",
  "apply.height_placeholder": "예: 165",
  "apply.primary_genre": "주 장르 *",
  "apply.primary_genre_placeholder": "예: K-POP, 코레오그래피",
  "apply.dance_video": "춤 영상 링크 *",
  "apply.dance_video_placeholder": "YouTube·Vimeo·Drive·SNS 영상 링크",
  "apply.backup_history": "백업댄서 이력 *",
  "apply.backup_history_placeholder":
    "아티스트·공연명·연도·역할을 적어 주세요. 경력이 없으면 '없음'이라고 입력해 주세요.",
  "apply.personal_profile": "개인 프로필 링크 (보유 시)",
  "apply.personal_profile_placeholder": "프로필 파일·소개 페이지·포트폴리오 링크",

  "apply.fee_legend": "↳ 제안 단가 (필수)",
  "apply.fee_private": "운영자만 봅니다",
  "apply.fee_hint": "정확한 금액이 아니어도 괜찮습니다. 가능한 범위의 러프한 금액을 먼저 입력해 주세요.",
  "apply.fee_currency": "통화",
  "apply.fee_unit": "단위",
  "apply.fee_amount_placeholder": "예: 1,500,000",
  "apply.fee_negotiable": "입력한 금액을 기준으로 세부 조건은 협의 가능합니다.",
  "apply.fee_unit_session": "회당",
  "apply.fee_unit_day": "일당",
  "apply.fee_unit_job": "건당",
  "apply.fee_unit_total": "총액",

  "apply.nationality_legend": "국적 공개 동의 (선택)",
  "apply.nationality_hint":
    "공개 프로필에는 표시되지 않습니다. 이 지원서의 프로젝트 담당자에게만 아래 국적을 공개합니다.",
  "apply.nationality_consent": "이 지원서의 담당자에게 국적을 공개하는 데 동의합니다.",

  "apply.guide_title": "제작 가이드를 지금 확인하세요",
  "apply.guide_body1": "음원·해시태그·계정 태그가 하나라도 빠지면 광고 건으로 인정되지 않습니다.",
  "apply.guide_body2": "같은 내용을 메일로도 보내드립니다.",
  "apply.guide_cta": "제작 가이드 열기 →",

  "apply.submitting": "지원하는 중...",
  "apply.submit": "지원하기",

  "withdraw.confirm": "지원을 취소하시겠습니까?",
  "withdraw.pending": "취소 중...",
  "withdraw.label": "지원 취소",

  "decline.confirm":
    "이 프로젝트 참여를 포기하시겠습니까?\n포기하면 이번 캐스팅 검토 대상에서 제외되며, 되돌릴 수 없습니다.",
  "decline.reason_required": "포기 사유를 남겨주세요. (필수)",
  "decline.reason_optional": "포기 사유를 남겨주세요. (선택)",
  "decline.reason_missing": "이 단계에서는 포기 사유를 남겨주셔야 합니다.",
  "decline.pending": "처리 중...",
  "decline.label": "참여 포기",
} as const;

type Key = keyof typeof ko;

const en: Record<Key, string> = {
  "meta.not_found": "Casting call not found",
  "meta.private_title": "Private project · deetz",
  "meta.private_description": "A private deetz project that only an invite link can open.",
  "meta.fallback_description": "Dancer casting call",
  "meta.og_title": "{title} · deetz",

  "nav.back_feed": "Casting feed",

  "badge.standing": "Always open",

  "stat.pay": "Pay",
  "stat.recruit": "Openings",
  "stat.deadline": "Closes",
  "stat.recruit_unlimited": "No limit",
  "stat.recruit_count_one": "{count} person",
  "stat.recruit_count_other": "{count} people",
  "stat.deadline_standing": "Open",

  "pay.none": "No separate pay",
  "pay.negotiable": "Negotiable",
  "pay.amount": "₩ {amount}",
  "pay.amount_per_session": "₩ {amount} · per session",

  "section.description": "↳ Details",
  "section.attachments": "↳ Attachments ({count})",
  "section.announcements": "↳ Announcements ({count})",
  "section.sessions": "↳ Schedule ({count})",
  "section.manage": "↳ Manage",
  "section.my_application": "↳ My application",

  "attachment.file": "File",
  "attachment.open": "Open →",

  "announcement.pinned": "Pinned",

  "session.confirmed": "Confirmed",
  "session.cancelled": "Cancelled",
  "session.undecided": "TBD",

  "manage.applicants": "View applicants →",
  "manage.edit": "Edit casting call",

  "closed.expired": "The application deadline has passed.",
  "closed.closed": "This casting call is closed right now.",

  "guest.quick_hint": "You can apply with just your name and contact — no account needed.",
  "guest.quick_cta": "Apply without an account →",
  "guest.have_account": "I already have a deetz account",
  "guest.login_hint": "Log in or sign up to apply.",
  "guest.login_cta": "Log in and apply →",
  "guest.signup_cta": "Sign up",

  "mine.link": "See it in my applications →",

  "media.section": "Casting call photos and videos",
  "media.open_original": "Open the full-size image of {name}",
  "media.video_unsupported": "This browser cannot play the video.",

  "share.label": "Share",
  "share.aria": "Share this casting call",
  "share.copied_toast": "Link copied",
  "share.copy_failed": "We could not copy that",

  "proposal.pending": "Working…",
  "proposal.accept": "Accept",
  "proposal.decline": "Decline",

  "apply.needs_dancer_title": "You need a dancer profile before you can apply.",
  "apply.needs_dancer_hint":
    "It takes 30 seconds. We bring you straight back to this casting call afterwards.",
  "apply.needs_dancer_cta": "Create a dancer profile →",
  "apply.error_schedule_required": "Select at least one session you can attend.",
  "apply.error_fee_required": "Enter your rate, even a rough number.",
  "apply.success_accepted": "Your application is in. You can go ahead.",
  "apply.success": "Your application is in.",
  "apply.cover_label": "↳ One-line intro (optional)",
  "apply.cover_label_companion": "↳ A note with your application (optional)",
  "apply.companion_hint":
    "If someone is coming with you, leave their Instagram handle (@username).",
  "apply.channel_label": "Channel:",
  "apply.cover_placeholder":
    "e.g. 7 years as a stage dancer, lots of K-pop work, quick to pick up choreography.",
  "apply.cover_placeholder_companion": "e.g. coming with @instagram_id",

  "apply.availability_legend": "Sessions you can attend (required)",
  "apply.availability_hint":
    "Select every session you can attend. Sessions you leave unchecked are submitted as unavailable.",
  "apply.availability_select_all": "Select all",
  "apply.availability_clear_all": "Clear all",

  "apply.casting_legend": "Application details",
  "apply.casting_hint":
    "We filled this in from your profile. Edit anything that is empty or out of date before you submit.",
  "apply.name": "Name *",
  "apply.birth_year": "Year of birth *",
  "apply.birth_year_placeholder": "e.g. 1998",
  "apply.height": "Height (cm) *",
  "apply.height_placeholder": "e.g. 165",
  "apply.primary_genre": "Main genre *",
  "apply.primary_genre_placeholder": "e.g. K-POP, choreography",
  "apply.dance_video": "Dance video link *",
  "apply.dance_video_placeholder": "YouTube, Vimeo, Drive or social video link",
  "apply.backup_history": "Backup dancer credits *",
  "apply.backup_history_placeholder":
    "List artists, shows, years and your role. Write 'none' if you have no credits yet.",
  "apply.personal_profile": "Personal profile link (if you have one)",
  "apply.personal_profile_placeholder": "Profile file, about page or portfolio link",

  "apply.fee_legend": "↳ Your rate (required)",
  "apply.fee_private": "Only the organiser sees this",
  "apply.fee_hint":
    "It does not have to be exact. Start with a rough number in the range you can work for.",
  "apply.fee_currency": "Currency",
  "apply.fee_unit": "Unit",
  "apply.fee_amount_placeholder": "e.g. 1,500,000",
  "apply.fee_negotiable": "The details are negotiable around the amount I entered.",
  "apply.fee_unit_session": "Per session",
  "apply.fee_unit_day": "Per day",
  "apply.fee_unit_job": "Per job",
  "apply.fee_unit_total": "Total",

  "apply.nationality_legend": "Nationality disclosure (optional)",
  "apply.nationality_hint":
    "This is never shown on your public profile. Only the organiser of this casting call sees the nationalities below.",
  "apply.nationality_consent":
    "I agree to share my nationality with the organiser of this casting call.",

  "apply.guide_title": "Read the production guide now",
  "apply.guide_body1":
    "If the track, hashtags or account tags are missing, the post does not count towards the campaign.",
  "apply.guide_body2": "We send you the same guide by email.",
  "apply.guide_cta": "Open the production guide →",

  "apply.submitting": "Applying...",
  "apply.submit": "Apply",

  "withdraw.confirm": "Withdraw your application?",
  "withdraw.pending": "Withdrawing...",
  "withdraw.label": "Withdraw application",

  "decline.confirm":
    "Give up your place on this project?\nYou will be removed from this casting round, and this cannot be undone.",
  "decline.reason_required": "Tell us why you are giving up your place. (required)",
  "decline.reason_optional": "Tell us why you are giving up your place. (optional)",
  "decline.reason_missing": "At this stage you have to give a reason.",
  "decline.pending": "Working...",
  "decline.label": "Give up my place",
};

const ja: Record<Key, string> = {
  "meta.not_found": "募集が見つかりません",
  "meta.private_title": "非公開プロジェクト · deetz",
  "meta.private_description": "招待リンクからのみ確認できるdeetzの非公開プロジェクトです。",
  "meta.fallback_description": "ダンサーキャスティング募集",
  "meta.og_title": "{title} · deetz",

  "nav.back_feed": "キャスティングフィード",

  "badge.standing": "常時募集",

  "stat.pay": "出演料",
  "stat.recruit": "募集人数",
  "stat.deadline": "締切",
  "stat.recruit_unlimited": "制限なし",
  "stat.recruit_count_one": "{count}名",
  "stat.recruit_count_other": "{count}名",
  "stat.deadline_standing": "常時",

  "pay.none": "出演料なし",
  "pay.negotiable": "応相談",
  "pay.amount": "₩ {amount}",
  "pay.amount_per_session": "₩ {amount} · 1回あたり",

  "section.description": "↳ 詳細",
  "section.attachments": "↳ 参考資料（{count}）",
  "section.announcements": "↳ お知らせ（{count}）",
  "section.sessions": "↳ 日程（{count}）",
  "section.manage": "↳ 運営",
  "section.my_application": "↳ 応募状況",

  "attachment.file": "ファイル",
  "attachment.open": "開く →",

  "announcement.pinned": "固定",

  "session.confirmed": "確定",
  "session.cancelled": "取消",
  "session.undecided": "未定",

  "manage.applicants": "応募者を見る →",
  "manage.edit": "募集を編集",

  "closed.expired": "応募の締切日が過ぎました。",
  "closed.closed": "現在この募集は締め切っています。",

  "guest.quick_hint": "会員登録なしで、お名前と連絡先だけですぐに応募できます。",
  "guest.quick_cta": "会員登録なしで応募する →",
  "guest.have_account": "すでにdeetzのアカウントがあります",
  "guest.login_hint": "応募するにはログインまたは会員登録が必要です。",
  "guest.login_cta": "ログインして応募する →",
  "guest.signup_cta": "会員登録",

  "mine.link": "応募一覧で見る →",

  "media.section": "募集の写真と映像",
  "media.open_original": "{name} の元画像を開く",
  "media.video_unsupported": "このブラウザでは映像を再生できません。",

  "share.label": "共有",
  "share.aria": "募集を共有",
  "share.copied_toast": "リンクをコピーしました",
  "share.copy_failed": "コピーできませんでした",

  "proposal.pending": "処理中…",
  "proposal.accept": "受ける",
  "proposal.decline": "辞退",

  "apply.needs_dancer_title": "応募するには、まずダンサープロフィールが必要です。",
  "apply.needs_dancer_hint": "30秒で作成できます。作成後はこの募集に自動で戻ります。",
  "apply.needs_dancer_cta": "ダンサープロフィールを作る →",
  "apply.error_schedule_required": "参加できる日程を1つ以上選んでください。",
  "apply.error_fee_required": "おおよその金額でかまいませんので、希望出演料をご入力ください。",
  "apply.success_accepted": "応募が完了しました。このまま進めてください。",
  "apply.success": "応募が完了しました。",
  "apply.cover_label": "↳ 一言自己紹介（任意）",
  "apply.cover_label_companion": "↳ 応募メッセージ（任意）",
  "apply.companion_hint":
    "同行者がいる場合は、Instagramのアカウント（@ユーザー名）をご記入ください。",
  "apply.channel_label": "募集チャネル:",
  "apply.cover_placeholder":
    "例: ステージダンサー7年目。K-POPの経験多数。振り入れの速さに自信があります。",
  "apply.cover_placeholder_companion": "例: 一緒に参加する同行者 @instagram_id",

  "apply.availability_legend": "参加できる日程（必須）",
  "apply.availability_hint":
    "参加できる日程をすべて選んでください。選ばなかった日程は参加不可として送信されます。",
  "apply.availability_select_all": "すべて選択",
  "apply.availability_clear_all": "すべて解除",

  "apply.casting_legend": "詳細な応募情報",
  "apply.casting_hint":
    "会員プロフィールに登録された情報を自動で読み込みました。空欄や変更がある項目は、ここで修正してから送信してください。",
  "apply.name": "氏名 *",
  "apply.birth_year": "生年 *",
  "apply.birth_year_placeholder": "例: 1998",
  "apply.height": "身長(cm) *",
  "apply.height_placeholder": "例: 165",
  "apply.primary_genre": "メインジャンル *",
  "apply.primary_genre_placeholder": "例: K-POP、コレオグラフィー",
  "apply.dance_video": "ダンス映像のリンク *",
  "apply.dance_video_placeholder": "YouTube・Vimeo・Drive・SNSの映像リンク",
  "apply.backup_history": "バックダンサーの経歴 *",
  "apply.backup_history_placeholder":
    "アーティスト・公演名・年・役割をご記入ください。経歴がない場合は「なし」とご入力ください。",
  "apply.personal_profile": "個人プロフィールのリンク（お持ちの場合）",
  "apply.personal_profile_placeholder": "プロフィールファイル・紹介ページ・ポートフォリオのリンク",

  "apply.fee_legend": "↳ 希望出演料（必須）",
  "apply.fee_private": "運営のみが確認します",
  "apply.fee_hint":
    "正確な金額でなくてかまいません。対応可能な範囲のおおよその金額をご入力ください。",
  "apply.fee_currency": "通貨",
  "apply.fee_unit": "単位",
  "apply.fee_amount_placeholder": "例: 1,500,000",
  "apply.fee_negotiable": "入力した金額を基準に、細かい条件は相談可能です。",
  "apply.fee_unit_session": "1回あたり",
  "apply.fee_unit_day": "1日あたり",
  "apply.fee_unit_job": "1件あたり",
  "apply.fee_unit_total": "総額",

  "apply.nationality_legend": "国籍の開示同意（任意）",
  "apply.nationality_hint":
    "公開プロフィールには表示されません。この応募のプロジェクト担当者にのみ、下記の国籍を開示します。",
  "apply.nationality_consent": "この応募の担当者に国籍を開示することに同意します。",

  "apply.guide_title": "制作ガイドを今すぐご確認ください",
  "apply.guide_body1":
    "音源・ハッシュタグ・アカウントタグが1つでも欠けると、広告案件として認められません。",
  "apply.guide_body2": "同じ内容をメールでもお送りします。",
  "apply.guide_cta": "制作ガイドを開く →",

  "apply.submitting": "応募中...",
  "apply.submit": "応募する",

  "withdraw.confirm": "応募を取り消しますか？",
  "withdraw.pending": "取消中...",
  "withdraw.label": "応募を取り消す",

  "decline.confirm":
    "このプロジェクトへの参加を辞退しますか？\n辞退すると今回のキャスティング検討の対象から外れ、元に戻せません。",
  "decline.reason_required": "辞退の理由をご記入ください。（必須）",
  "decline.reason_optional": "辞退の理由をご記入ください。（任意）",
  "decline.reason_missing": "この段階では辞退の理由の記入が必要です。",
  "decline.pending": "処理中...",
  "decline.label": "参加を辞退",
};

const messages = { ko, en, ja } satisfies Messages<Key>;
export default messages;
