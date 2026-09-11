import type { Messages } from "../t";

/**
 * 내 계정(/me) · 알림 설정 · 비밀번호 · 단가 · 워크숍 예약 · 댄서 포트폴리오 · 팀 · 버그 신고.
 * 키 이름은 `<화면>.<요소>[.<상태>]` (docs/design-i18n-ui.md 부록 C).
 * 비자(/me/visa)·정산(/me/settlements)·관리 공고(/me/projects) 화면은 각자 네임스페이스를 쓴다.
 */
const ko = {
  // /me
  "account.share_title": "{name} | 댄서 프로필 · dancers.bio",
  "account.share_title_fallback_name": "댄서",
  "account.section_activity": "활동",
  "account.managed_projects_title": "내가 관리하는 공고",
  "account.managed_projects_desc": "모집 중 {open}건 · 전체 {total}건",
  "account.portfolio_title": "댄서 포트폴리오",
  "account.portfolio_desc_has": "활동명·경력·영상 편집",
  "account.portfolio_desc_none": "포트폴리오 만들기",
  "account.teams_title": "내 팀",
  "account.teams_desc": "팀 프로필 · 멤버 관리",
  "account.settlements_title": "정산 · 출금",
  "account.settlements_desc": "정산금액 확인 · 계좌 등록 · 출금 신청",
  "account.workshops_title": "내 워크샵 예약",
  "account.workshops_desc": "예약금 결제 내역 · 진행 상태",
  "account.new_project_title": "프로젝트 개설",
  "account.new_project_desc": "캐스팅 공고 등록",
  "account.admin_title": "관리자 콘솔",
  "account.admin_desc": "인증 큐 · 사용자 권한",
  "account.section_account": "계정",
  "account.notifications_link": "알림 설정",
  "account.password_link": "비밀번호 변경",
  "account.logout": "로그아웃",

  // /me/notifications
  "notifications.back": "내 계정",
  "notifications.eyebrow": "계정 설정",
  "notifications.title": "알림 설정",
  "notifications.desc": "받고 싶은 알림을 직접 선택하세요. 언제든 다시 바꿀 수 있습니다.",
  "notifications.group_email": "이메일 알림",
  "notifications.email_project_match_label": "핏 맞는 새 공고 추천 메일",
  "notifications.email_project_match_desc":
    "내 장르·조건에 맞는 새 공고가 올라오면 이메일로 알려드립니다.",
  "notifications.email_marketing_label": "deetz 소식·이벤트 메일",
  "notifications.email_marketing_desc": "서비스 소식, 워크샵, 이벤트 안내를 이메일로 받습니다.",
  "notifications.group_push": "푸시 알림",
  "notifications.push_project_match_label": "새 공고 웹푸시 알림",
  "notifications.push_project_match_desc":
    "핏 맞는 공고가 올라오면 브라우저·앱 푸시로 즉시 알려드립니다.",
  "notifications.group_unsubscribe": "수신거부",
  "notifications.unsubscribe_all_label": "모든 마케팅·추천 이메일 수신거부",
  "notifications.unsubscribe_all_desc":
    "켜면 위 이메일 항목과 무관하게 deetz의 모든 추천·소식 메일이 발송되지 않습니다. (지원 결과 등 필수 안내는 계속 발송됩니다.)",
  "notifications.saved": "저장되었습니다.",
  "notifications.saving": "저장 중…",
  "notifications.save": "저장",

  // /me/password
  "password.back": "내 계정",
  "password.eyebrow": "계정 설정",
  "password.title": "비밀번호 변경",
  "password.desc": "새 비밀번호를 입력해 주세요. (8자 이상)",

  // /me/rates
  "rates.eyebrow": "댄서 단가",
  "rates.title": "내 단가표",
  "rates.desc":
    "안무제작 · 챌린지 · 모델료 · 강습 단가를 직접 등록하세요. 엔터테인먼트 챌린지 제안 등에 활용됩니다.",
  "rates.no_dancer_title": "먼저 댄서 프로필을 만들어 주세요",
  "rates.no_dancer_desc": "프로필을 만든 뒤 단가를 등록할 수 있어요",

  // /me/workshops
  "workshops.meta_title": "내 워크샵 예약 | deetz",
  "workshops.back": "내 정보",
  "workshops.title": "내 워크샵 예약",
  "workshops.desc": "예약금 결제 내역과 진행 상태를 확인할 수 있어요.",
  "workshops.empty": "아직 예약한 워크샵이 없습니다.",
  "workshops.browse_cta": "워크샵 둘러보기",
  "workshops.status.pending": "결제 대기",
  "workshops.status.paid": "예약 완료",
  "workshops.status.cancelled": "취소",
  "workshops.status.refunded": "환불 완료",
  "workshops.status.transferred": "양도",
  "workshops.status.confirmed": "참가 확정",
  "workshops.status.recovery_required": "확인 필요 (결제됨)",
  "workshops.artist_confirmed": "초청 확정",
  "workshops.card_title": "{artist} 초청 워크샵",
  "workshops.expected_period": "예상 시기 {period}",
  "workshops.order_no": "결제번호",
  "workshops.deposit": "예약금",
  "workshops.total_price": "총 참가비",
  "workshops.total_price_value": "{amount} (잔금은 확정 후 안내)",
  "workshops.continue_payment": "결제 이어서 하기",
  "workshops.view_progress": "진행 상황 보기",
  "workshops.receipt": "영수증",
  "workshops.note_contact": "취소·양도 요청은 contact@deetz.kr 로 보내주세요.",
  "workshops.note_refund": "인원 미달로 워크샵이 열리지 않으면 예약금은 전액 환불됩니다.",

  // /me/portfolio
  "portfolio.meta_title_grigo": "GRIGO ENT 정산 · 내 프로필",
  "portfolio.eyebrow": "댄서 포트폴리오",
  "portfolio.title": "내 댄서 프로필",
  "portfolio.desc": "본인 댄서 프로필을 관리합니다.",
  "portfolio.create_cta": "만들기",
  "portfolio.empty_title": "댄서 프로필 만들기",
  "portfolio.empty_desc": "30초만에 포트폴리오를 시작할 수 있어요",
  "portfolio.own_badge": "내 프로필",
  "portfolio.approval_pending": "승인 대기",
  "portfolio.approval_rejected": "거절됨",

  // /me/portfolio/add
  "portfolio_add.eyebrow": "댄서 포트폴리오",
  "portfolio_add.title": "프로필 만들기",
  "portfolio_add.desc": "이미 등록된 댄서가 있는지 먼저 확인할까요?",
  "portfolio_add.start_title": "시작하기",
  "portfolio_add.start_desc": "30초만에 본인 댄서 프로필을 만들 수 있어요.",

  // /me/portfolio/add/search
  "portfolio_search.eyebrow": "댄서 포트폴리오",
  "portfolio_search.title": "기존 프로필 검색",
  "portfolio_search.desc":
    "이미 등록된 프로필이 있을 수 있어요. 활동명·한글 이름으로 검색해 보세요.",
  "portfolio_search.role_self": "본인으로 등록",
  "portfolio_search.role_manager": "매니저로 등록",
  "portfolio_search.input_placeholder": "활동명, 한글 이름 검색",
  "portfolio_search.count_summary": "총 {total}명 중 {shown}명 표시",
  "portfolio_search.empty": "등록된 댄서가 없습니다.",
  "portfolio_search.empty_query":
    "\"{query}\" 와 일치하는 프로필이 없어요. 아래에서 새로 만들어드릴게요.",
  "portfolio_search.curated_badge": "큐레이션",
  "portfolio_search.claim_submitted": "{name} — 권한 신청 완료",
  "portfolio_search.claim_submitted_desc": "관리자 승인 후 프로필이 연결됩니다.",
  "portfolio_search.claim_role_self": "본인 프로필로 권한 신청",
  "portfolio_search.claim_role_manager": "매니저로 권한 신청",
  "portfolio_search.claim_message_label": "관리자에게 전달할 메시지",
  "portfolio_search.claim_message_optional": "(선택)",
  "portfolio_search.claim_message_placeholder_self": "예: 본인입니다. 인스타그램 @...",
  "portfolio_search.claim_message_placeholder_manager":
    "예: 이 댄서의 매니저입니다. 연락처: ...",
  "portfolio_search.claim_note": "신청 후 관리자 검토를 거쳐 연결됩니다.",
  "portfolio_search.claim_cancel": "취소",
  "portfolio_search.claim_submit": "권한 신청",
  "portfolio_search.load_more": "더 보기",
  "portfolio_search.loading_more": "불러오는 중…",
  "portfolio_search.create_new_query": "없어요, 새로 만들기",
  "portfolio_search.create_new": "건너뛰고 바로 새로 만들기",

  // /me/portfolio/[dancerId]
  "portfolio_edit.eyebrow": "댄서 포트폴리오",
  "portfolio_edit.title": "프로필 편집",
  "portfolio_edit.desc": "공개 페이지에 노출되는 정보를 편집합니다.",
  "portfolio_edit.view_public": "공개 보기",
  "portfolio_edit.approval_approved": "공개 중 — 디렉토리에 노출되고 있습니다.",
  "portfolio_edit.approval_rejected_title": "거부됨 — 디렉토리에 노출되지 않습니다.",
  "portfolio_edit.approval_reject_reason": "사유: {reason}",
  "portfolio_edit.approval_rejected_note":
    "내용을 수정해도 재노출은 관리자가 다시 검토해야 합니다.",
  "portfolio_edit.approval_pending_title": "심사 중",
  "portfolio_edit.approval_pending_note": "관리자 승인 후 공개 디렉토리에 노출됩니다.",

  // /me/portfolio/[dancerId]/careers
  "careers.eyebrow": "경력 관리",
  "careers.desc": "카테고리별로 경력을 추가하고 영상 링크를 첨부합니다.",
  "careers.back_profile": "프로필",

  // /me/teams
  "teams.title": "내 팀",
  "teams.create_cta": "팀 만들기",
  "teams.section_led": "내가 팀장인 팀",
  "teams.empty_led": "팀장으로 활동 중인 팀이 없습니다.",
  "teams.section_member": "소속 팀",
  "teams.empty_member": "다른 팀의 멤버로 등록된 곳이 없습니다.",
  "teams.role_lead": "팀장",
  "teams.role_member": "멤버",
  "teams.status_inactive": "비활성",
  "teams.status_public": "공개 중",
  "teams.status_rejected": "노출 거부됨",
  "teams.status_pending": "심사 중",
  "teams.view_public": "보기",

  // /me/teams/new
  "team_new.eyebrow": "팀 만들기",
  "team_new.title": "새 팀 프로필",
  "team_new.desc": "만들면 자동으로 팀장이 되며, 관리자 승인 후 디렉토리에 노출됩니다.",
  "team_new.back": "내 팀 목록",

  // /me/teams/[id]
  "team_edit.eyebrow": "팀 편집",
  "team_edit.back": "내 팀 목록",
  "team_edit.view_public": "공개 보기",
  "team_edit.disbanded": "해체된 팀입니다.",
  "team_edit.approval_approved": "공개 중 — 디렉토리에 노출되고 있습니다.",
  "team_edit.approval_rejected_title": "거부됨 — 디렉토리에 노출되지 않습니다.",
  "team_edit.approval_reject_reason": "사유: {reason}",
  "team_edit.approval_pending_title": "심사 중",
  "team_edit.approval_pending_note": "관리자 승인 후 공개 디렉토리에 노출됩니다.",
  "team_edit.members_eyebrow": "멤버 관리",
  "team_edit.members_title": "팀원 추가·제거 / 리더 위임 / 해체",

  // /me/teams/[id]/members
  "team_members.eyebrow": "멤버 관리",
  "team_members.back_edit": "팀 편집으로",
  "team_members.view_public": "공개 페이지 보기",

  // 버그 / 고장 신고 (BugReport)
  "bug.row_title": "버그 / 고장 신고",
  "bug.row_desc": "동작이 이상한 부분을 알려주세요",
  "bug.title": "버그 / 고장 신고",
  "bug.desc": "무엇이 잘못되었는지 알려주시면 빠르게 고치겠습니다.",
  "bug.field_title": "제목",
  "bug.field_title_placeholder": "예: 프로필 저장 버튼이 동작하지 않습니다",
  "bug.field_desc": "상세 설명",
  "bug.field_desc_placeholder":
    "언제·어디서·어떻게 발생했는지 알려주세요. 화면 메시지나 재현 단계가 있으면 더 빨라요.",
  "bug.auto_info_note": "현재 페이지 주소와 브라우저 정보는 자동으로 함께 전송됩니다.",
  "bug.field_severity": "긴급도",
  "bug.severity_low": "낮음",
  "bug.severity_normal": "보통",
  "bug.severity_high": "높음",
  "bug.severity_critical": "치명",
  "bug.field_email": "회신용 이메일 (선택)",
  "bug.cancel": "취소",
  "bug.submit": "신고 보내기",
  "bug.sending": "보내는 중...",
  "bug.sent_title": "감사합니다!",
  "bug.sent_body_1": "버그 리포트가 접수되었습니다.",
  "bug.sent_body_2": "빠르게 확인하고 수정하겠습니다.",
  "bug.close": "닫기",
} as const;

type Key = keyof typeof ko;

const en: Record<Key, string> = {
  // /me
  "account.share_title": "{name} | Dancer profile · dancers.bio",
  "account.share_title_fallback_name": "Dancer",
  "account.section_activity": "Activity",
  "account.managed_projects_title": "Casting calls I manage",
  "account.managed_projects_desc": "{open} open · {total} total",
  "account.portfolio_title": "Dancer portfolio",
  "account.portfolio_desc_has": "Edit your stage name, credits and videos",
  "account.portfolio_desc_none": "Create your portfolio",
  "account.teams_title": "My teams",
  "account.teams_desc": "Team profile · member management",
  "account.settlements_title": "Payouts · withdrawals",
  "account.settlements_desc": "Check your balance · register a bank account · request a withdrawal",
  "account.workshops_title": "My workshop reservations",
  "account.workshops_desc": "Deposit payments · status",
  "account.new_project_title": "Create a project",
  "account.new_project_desc": "Post a casting call",
  "account.admin_title": "Admin console",
  "account.admin_desc": "Verification queue · user permissions",
  "account.section_account": "Account",
  "account.notifications_link": "Notification settings",
  "account.password_link": "Change password",
  "account.logout": "Log out",

  // /me/notifications
  "notifications.back": "My account",
  "notifications.eyebrow": "Account settings",
  "notifications.title": "Notification settings",
  "notifications.desc": "Choose the notifications you want. You can change this any time.",
  "notifications.group_email": "Email notifications",
  "notifications.email_project_match_label": "New casting calls that fit you",
  "notifications.email_project_match_desc":
    "We email you when a new casting call matches your genres and conditions.",
  "notifications.email_marketing_label": "deetz news and events",
  "notifications.email_marketing_desc":
    "Get service news, workshops, and event updates by email.",
  "notifications.group_push": "Push notifications",
  "notifications.push_project_match_label": "Web push for new casting calls",
  "notifications.push_project_match_desc":
    "We send a browser or app push as soon as a casting call that fits you is posted.",
  "notifications.group_unsubscribe": "Unsubscribe",
  "notifications.unsubscribe_all_label": "Unsubscribe from all marketing and recommendation emails",
  "notifications.unsubscribe_all_desc":
    "When this is on, deetz sends no recommendation or news email regardless of the settings above. (Essential notices such as application results are still sent.)",
  "notifications.saved": "Saved.",
  "notifications.saving": "Saving…",
  "notifications.save": "Save",

  // /me/password
  "password.back": "My account",
  "password.eyebrow": "Account settings",
  "password.title": "Change password",
  "password.desc": "Enter a new password. (8 characters or more)",

  // /me/rates
  "rates.eyebrow": "Dancer rates",
  "rates.title": "My rate card",
  "rates.desc":
    "Set your own rates for choreography, challenges, modeling, and classes. They are used for offers such as challenges from entertainment companies.",
  "rates.no_dancer_title": "Create a dancer profile first",
  "rates.no_dancer_desc": "You can set your rates after you create a profile",

  // /me/workshops
  "workshops.meta_title": "My workshop reservations | deetz",
  "workshops.back": "My account",
  "workshops.title": "My workshop reservations",
  "workshops.desc": "Check your deposit payments and their status.",
  "workshops.empty": "You have no workshop reservations yet.",
  "workshops.browse_cta": "Browse workshops",
  "workshops.status.pending": "Payment pending",
  "workshops.status.paid": "Reserved",
  "workshops.status.cancelled": "Cancelled",
  "workshops.status.refunded": "Refunded",
  "workshops.status.transferred": "Transferred",
  "workshops.status.confirmed": "Confirmed",
  "workshops.status.recovery_required": "Needs checking (paid)",
  "workshops.artist_confirmed": "Artist confirmed",
  "workshops.card_title": "{artist} workshop",
  "workshops.expected_period": "Expected {period}",
  "workshops.order_no": "Payment number",
  "workshops.deposit": "Deposit",
  "workshops.total_price": "Total fee",
  "workshops.total_price_value": "{amount} (balance announced after confirmation)",
  "workshops.continue_payment": "Continue payment",
  "workshops.view_progress": "View progress",
  "workshops.receipt": "Receipt",
  "workshops.note_contact": "For a cancellation or transfer, email contact@deetz.kr.",
  "workshops.note_refund":
    "If the workshop does not run because too few people join, your deposit is refunded in full.",

  // /me/portfolio
  "portfolio.meta_title_grigo": "GRIGO ENT payout · My profile",
  "portfolio.eyebrow": "Dancer portfolio",
  "portfolio.title": "My dancer profile",
  "portfolio.desc": "Manage your own dancer profile.",
  "portfolio.create_cta": "Create",
  "portfolio.empty_title": "Create a dancer profile",
  "portfolio.empty_desc": "You can start your portfolio in 30 seconds",
  "portfolio.own_badge": "My profile",
  "portfolio.approval_pending": "Pending review",
  "portfolio.approval_rejected": "Rejected",

  // /me/portfolio/add
  "portfolio_add.eyebrow": "Dancer portfolio",
  "portfolio_add.title": "Create a profile",
  "portfolio_add.desc": "Shall we first check whether you are already listed?",
  "portfolio_add.start_title": "Get started",
  "portfolio_add.start_desc": "You can create your own dancer profile in 30 seconds.",

  // /me/portfolio/add/search
  "portfolio_search.eyebrow": "Dancer portfolio",
  "portfolio_search.title": "Search existing profiles",
  "portfolio_search.desc":
    "Your profile may already be listed. Search by stage name or Korean name.",
  "portfolio_search.role_self": "Claim as yourself",
  "portfolio_search.role_manager": "Claim as a manager",
  "portfolio_search.input_placeholder": "Search by stage name or Korean name",
  "portfolio_search.count_summary": "Showing {shown} of {total}",
  "portfolio_search.empty": "No dancers are listed.",
  "portfolio_search.empty_query":
    "No profile matches \"{query}\". You can create a new one below.",
  "portfolio_search.curated_badge": "Curated",
  "portfolio_search.claim_submitted": "{name} — claim submitted",
  "portfolio_search.claim_submitted_desc": "Your profile is linked once an admin approves it.",
  "portfolio_search.claim_role_self": "Claim this profile as your own",
  "portfolio_search.claim_role_manager": "Claim this profile as a manager",
  "portfolio_search.claim_message_label": "Message for the admin",
  "portfolio_search.claim_message_optional": "(optional)",
  "portfolio_search.claim_message_placeholder_self": "e.g. This is me. Instagram @...",
  "portfolio_search.claim_message_placeholder_manager":
    "e.g. I am this dancer's manager. Contact: ...",
  "portfolio_search.claim_note": "An admin reviews your claim before the profile is linked.",
  "portfolio_search.claim_cancel": "Cancel",
  "portfolio_search.claim_submit": "Submit claim",
  "portfolio_search.load_more": "Show more",
  "portfolio_search.loading_more": "Loading…",
  "portfolio_search.create_new_query": "Not here — create a new one",
  "portfolio_search.create_new": "Skip and create a new one",

  // /me/portfolio/[dancerId]
  "portfolio_edit.eyebrow": "Dancer portfolio",
  "portfolio_edit.title": "Edit profile",
  "portfolio_edit.desc": "Edit the information shown on your public page.",
  "portfolio_edit.view_public": "View public page",
  "portfolio_edit.approval_approved": "Live — your profile appears in the directory.",
  "portfolio_edit.approval_rejected_title":
    "Rejected — your profile does not appear in the directory.",
  "portfolio_edit.approval_reject_reason": "Reason: {reason}",
  "portfolio_edit.approval_rejected_note":
    "Even after you edit it, an admin has to review it again before it goes live.",
  "portfolio_edit.approval_pending_title": "Under review",
  "portfolio_edit.approval_pending_note":
    "It appears in the public directory once an admin approves it.",

  // /me/portfolio/[dancerId]/careers
  "careers.eyebrow": "Credits",
  "careers.desc": "Add your credits by category and attach video links.",
  "careers.back_profile": "Profile",

  // /me/teams
  "teams.title": "My teams",
  "teams.create_cta": "Create a team",
  "teams.section_led": "Teams I lead",
  "teams.empty_led": "You do not lead any team.",
  "teams.section_member": "Teams I belong to",
  "teams.empty_member": "You are not a member of any other team.",
  "teams.role_lead": "Leader",
  "teams.role_member": "Member",
  "teams.status_inactive": "Inactive",
  "teams.status_public": "Live",
  "teams.status_rejected": "Listing rejected",
  "teams.status_pending": "Under review",
  "teams.view_public": "View",

  // /me/teams/new
  "team_new.eyebrow": "Create a team",
  "team_new.title": "New team profile",
  "team_new.desc":
    "You become the leader automatically, and the team appears in the directory once an admin approves it.",
  "team_new.back": "My teams",

  // /me/teams/[id]
  "team_edit.eyebrow": "Edit team",
  "team_edit.back": "My teams",
  "team_edit.view_public": "View public page",
  "team_edit.disbanded": "This team has been disbanded.",
  "team_edit.approval_approved": "Live — your team appears in the directory.",
  "team_edit.approval_rejected_title": "Rejected — your team does not appear in the directory.",
  "team_edit.approval_reject_reason": "Reason: {reason}",
  "team_edit.approval_pending_title": "Under review",
  "team_edit.approval_pending_note":
    "It appears in the public directory once an admin approves it.",
  "team_edit.members_eyebrow": "Member management",
  "team_edit.members_title": "Add or remove members / transfer leadership / disband",

  // /me/teams/[id]/members
  "team_members.eyebrow": "Member management",
  "team_members.back_edit": "Back to team editing",
  "team_members.view_public": "View public page",

  // BugReport
  "bug.row_title": "Report a bug",
  "bug.row_desc": "Tell us what is not working",
  "bug.title": "Report a bug",
  "bug.desc": "Tell us what went wrong and we will fix it quickly.",
  "bug.field_title": "Title",
  "bug.field_title_placeholder": "e.g. The save button on my profile does nothing",
  "bug.field_desc": "Details",
  "bug.field_desc_placeholder":
    "Tell us when, where, and how it happened. On-screen messages or steps to reproduce help us move faster.",
  "bug.auto_info_note":
    "The current page address and your browser information are sent automatically.",
  "bug.field_severity": "Severity",
  "bug.severity_low": "Low",
  "bug.severity_normal": "Medium",
  "bug.severity_high": "High",
  "bug.severity_critical": "Critical",
  "bug.field_email": "Reply email (optional)",
  "bug.cancel": "Cancel",
  "bug.submit": "Send report",
  "bug.sending": "Sending...",
  "bug.sent_title": "Thank you!",
  "bug.sent_body_1": "We have received your bug report.",
  "bug.sent_body_2": "We will look into it and fix it quickly.",
  "bug.close": "Close",
};

const ja: Record<Key, string> = {
  // /me
  "account.share_title": "{name} | ダンサープロフィール · dancers.bio",
  "account.share_title_fallback_name": "ダンサー",
  "account.section_activity": "アクティビティ",
  "account.managed_projects_title": "自分が管理する募集",
  "account.managed_projects_desc": "募集中 {open}件 · 全体 {total}件",
  "account.portfolio_title": "ダンサーポートフォリオ",
  "account.portfolio_desc_has": "活動名・経歴・動画の編集",
  "account.portfolio_desc_none": "ポートフォリオを作成",
  "account.teams_title": "マイチーム",
  "account.teams_desc": "チームプロフィール · メンバー管理",
  "account.settlements_title": "精算 · 出金",
  "account.settlements_desc": "精算額の確認 · 口座の登録 · 出金申請",
  "account.workshops_title": "ワークショップ予約",
  "account.workshops_desc": "予約金の決済履歴 · 進行状況",
  "account.new_project_title": "プロジェクトを作成",
  "account.new_project_desc": "キャスティング募集の登録",
  "account.admin_title": "管理者コンソール",
  "account.admin_desc": "認証キュー · ユーザー権限",
  "account.section_account": "アカウント",
  "account.notifications_link": "通知設定",
  "account.password_link": "パスワード変更",
  "account.logout": "ログアウト",

  // /me/notifications
  "notifications.back": "マイアカウント",
  "notifications.eyebrow": "アカウント設定",
  "notifications.title": "通知設定",
  "notifications.desc": "受け取りたい通知をお選びください。いつでも変更できます。",
  "notifications.group_email": "メール通知",
  "notifications.email_project_match_label": "条件に合う新着募集のおすすめメール",
  "notifications.email_project_match_desc":
    "ご自身のジャンル・条件に合う新しい募集が公開されたらメールでお知らせします。",
  "notifications.email_marketing_label": "deetzのお知らせ・イベントメール",
  "notifications.email_marketing_desc":
    "サービスのお知らせ、ワークショップ、イベント情報をメールで受け取ります。",
  "notifications.group_push": "プッシュ通知",
  "notifications.push_project_match_label": "新着募集のWebプッシュ通知",
  "notifications.push_project_match_desc":
    "条件に合う募集が公開されたら、ブラウザ・アプリのプッシュですぐにお知らせします。",
  "notifications.group_unsubscribe": "受信停止",
  "notifications.unsubscribe_all_label": "すべてのマーケティング・おすすめメールの受信を停止",
  "notifications.unsubscribe_all_desc":
    "オンにすると、上記のメール設定に関わらずdeetzのおすすめ・お知らせメールは送信されません。（応募結果など必須のご案内は引き続き送信されます。）",
  "notifications.saved": "保存しました。",
  "notifications.saving": "保存中…",
  "notifications.save": "保存",

  // /me/password
  "password.back": "マイアカウント",
  "password.eyebrow": "アカウント設定",
  "password.title": "パスワード変更",
  "password.desc": "新しいパスワードを入力してください。（8文字以上）",

  // /me/rates
  "rates.eyebrow": "ダンサー料金",
  "rates.title": "料金表",
  "rates.desc":
    "振付制作 · チャレンジ · モデル料 · レッスンの料金をご自身で登録してください。エンターテインメント関連のチャレンジ提案などに活用されます。",
  "rates.no_dancer_title": "先にダンサープロフィールを作成してください",
  "rates.no_dancer_desc": "プロフィールを作成すると料金を登録できます",

  // /me/workshops
  "workshops.meta_title": "ワークショップ予約 | deetz",
  "workshops.back": "マイアカウント",
  "workshops.title": "ワークショップ予約",
  "workshops.desc": "予約金の決済履歴と進行状況を確認できます。",
  "workshops.empty": "まだ予約したワークショップはありません。",
  "workshops.browse_cta": "ワークショップを見る",
  "workshops.status.pending": "決済待ち",
  "workshops.status.paid": "予約完了",
  "workshops.status.cancelled": "取消",
  "workshops.status.refunded": "返金完了",
  "workshops.status.transferred": "譲渡",
  "workshops.status.confirmed": "参加確定",
  "workshops.status.recovery_required": "要確認（決済済み）",
  "workshops.artist_confirmed": "招へい確定",
  "workshops.card_title": "{artist} 招へいワークショップ",
  "workshops.expected_period": "開催予定 {period}",
  "workshops.order_no": "決済番号",
  "workshops.deposit": "予約金",
  "workshops.total_price": "参加費総額",
  "workshops.total_price_value": "{amount}（残金は確定後にご案内）",
  "workshops.continue_payment": "決済を続ける",
  "workshops.view_progress": "進行状況を見る",
  "workshops.receipt": "領収書",
  "workshops.note_contact": "キャンセル・譲渡のご依頼は contact@deetz.kr までお送りください。",
  "workshops.note_refund":
    "参加人数が集まらずワークショップが開催されない場合、予約金は全額返金されます。",

  // /me/portfolio
  "portfolio.meta_title_grigo": "GRIGO ENT 精算 · マイプロフィール",
  "portfolio.eyebrow": "ダンサーポートフォリオ",
  "portfolio.title": "マイダンサープロフィール",
  "portfolio.desc": "ご自身のダンサープロフィールを管理します。",
  "portfolio.create_cta": "作成",
  "portfolio.empty_title": "ダンサープロフィールを作成",
  "portfolio.empty_desc": "30秒でポートフォリオを始められます",
  "portfolio.own_badge": "マイプロフィール",
  "portfolio.approval_pending": "承認待ち",
  "portfolio.approval_rejected": "却下",

  // /me/portfolio/add
  "portfolio_add.eyebrow": "ダンサーポートフォリオ",
  "portfolio_add.title": "プロフィールを作成",
  "portfolio_add.desc": "すでに登録されたダンサーがいないか先に確認しますか？",
  "portfolio_add.start_title": "はじめる",
  "portfolio_add.start_desc": "30秒でご自身のダンサープロフィールを作成できます。",

  // /me/portfolio/add/search
  "portfolio_search.eyebrow": "ダンサーポートフォリオ",
  "portfolio_search.title": "既存プロフィールの検索",
  "portfolio_search.desc":
    "すでに登録されたプロフィールがあるかもしれません。活動名・ハングル表記の名前で検索してみてください。",
  "portfolio_search.role_self": "本人として登録",
  "portfolio_search.role_manager": "マネージャーとして登録",
  "portfolio_search.input_placeholder": "活動名、ハングル表記の名前で検索",
  "portfolio_search.count_summary": "全{total}名のうち{shown}名を表示",
  "portfolio_search.empty": "登録されたダンサーがいません。",
  "portfolio_search.empty_query":
    "「{query}」に一致するプロフィールはありません。下から新しく作成できます。",
  "portfolio_search.curated_badge": "キュレーション",
  "portfolio_search.claim_submitted": "{name} — 権限申請が完了しました",
  "portfolio_search.claim_submitted_desc": "管理者の承認後にプロフィールが連携されます。",
  "portfolio_search.claim_role_self": "本人のプロフィールとして権限を申請",
  "portfolio_search.claim_role_manager": "マネージャーとして権限を申請",
  "portfolio_search.claim_message_label": "管理者へのメッセージ",
  "portfolio_search.claim_message_optional": "（任意）",
  "portfolio_search.claim_message_placeholder_self": "例：本人です。Instagram @...",
  "portfolio_search.claim_message_placeholder_manager":
    "例：このダンサーのマネージャーです。連絡先：...",
  "portfolio_search.claim_note": "申請後、管理者の確認を経て連携されます。",
  "portfolio_search.claim_cancel": "キャンセル",
  "portfolio_search.claim_submit": "権限を申請",
  "portfolio_search.load_more": "もっと見る",
  "portfolio_search.loading_more": "読み込み中…",
  "portfolio_search.create_new_query": "見つからない場合は新しく作成",
  "portfolio_search.create_new": "スキップして新しく作成",

  // /me/portfolio/[dancerId]
  "portfolio_edit.eyebrow": "ダンサーポートフォリオ",
  "portfolio_edit.title": "プロフィール編集",
  "portfolio_edit.desc": "公開ページに表示される情報を編集します。",
  "portfolio_edit.view_public": "公開ページを見る",
  "portfolio_edit.approval_approved": "公開中 — ディレクトリに掲載されています。",
  "portfolio_edit.approval_rejected_title": "却下 — ディレクトリには掲載されません。",
  "portfolio_edit.approval_reject_reason": "理由：{reason}",
  "portfolio_edit.approval_rejected_note":
    "内容を修正しても、再掲載には管理者の再確認が必要です。",
  "portfolio_edit.approval_pending_title": "審査中",
  "portfolio_edit.approval_pending_note": "管理者の承認後、公開ディレクトリに掲載されます。",

  // /me/portfolio/[dancerId]/careers
  "careers.eyebrow": "経歴管理",
  "careers.desc": "カテゴリー別に経歴を追加し、動画リンクを添付します。",
  "careers.back_profile": "プロフィール",

  // /me/teams
  "teams.title": "マイチーム",
  "teams.create_cta": "チームを作成",
  "teams.section_led": "自分がリーダーのチーム",
  "teams.empty_led": "リーダーとして活動しているチームはありません。",
  "teams.section_member": "所属チーム",
  "teams.empty_member": "他のチームのメンバーとしては登録されていません。",
  "teams.role_lead": "リーダー",
  "teams.role_member": "メンバー",
  "teams.status_inactive": "非アクティブ",
  "teams.status_public": "公開中",
  "teams.status_rejected": "掲載却下",
  "teams.status_pending": "審査中",
  "teams.view_public": "表示",

  // /me/teams/new
  "team_new.eyebrow": "チームを作成",
  "team_new.title": "新しいチームプロフィール",
  "team_new.desc":
    "作成すると自動的にリーダーになり、管理者の承認後にディレクトリへ掲載されます。",
  "team_new.back": "マイチーム一覧",

  // /me/teams/[id]
  "team_edit.eyebrow": "チーム編集",
  "team_edit.back": "マイチーム一覧",
  "team_edit.view_public": "公開ページを見る",
  "team_edit.disbanded": "解散したチームです。",
  "team_edit.approval_approved": "公開中 — ディレクトリに掲載されています。",
  "team_edit.approval_rejected_title": "却下 — ディレクトリには掲載されません。",
  "team_edit.approval_reject_reason": "理由：{reason}",
  "team_edit.approval_pending_title": "審査中",
  "team_edit.approval_pending_note": "管理者の承認後、公開ディレクトリに掲載されます。",
  "team_edit.members_eyebrow": "メンバー管理",
  "team_edit.members_title": "メンバーの追加・削除 / リーダー権限の移譲 / 解散",

  // /me/teams/[id]/members
  "team_members.eyebrow": "メンバー管理",
  "team_members.back_edit": "チーム編集へ",
  "team_members.view_public": "公開ページを見る",

  // BugReport
  "bug.row_title": "バグ / 不具合の報告",
  "bug.row_desc": "動作がおかしい箇所をお知らせください",
  "bug.title": "バグ / 不具合の報告",
  "bug.desc": "何が問題だったかをお知らせいただければ、すぐに修正します。",
  "bug.field_title": "タイトル",
  "bug.field_title_placeholder": "例：プロフィールの保存ボタンが動作しません",
  "bug.field_desc": "詳細",
  "bug.field_desc_placeholder":
    "いつ・どこで・どのように発生したかをお知らせください。画面のメッセージや再現手順があるとより早く対応できます。",
  "bug.auto_info_note": "現在のページのURLとブラウザ情報も自動的に送信されます。",
  "bug.field_severity": "緊急度",
  "bug.severity_low": "低",
  "bug.severity_normal": "中",
  "bug.severity_high": "高",
  "bug.severity_critical": "致命的",
  "bug.field_email": "返信用メールアドレス（任意）",
  "bug.cancel": "キャンセル",
  "bug.submit": "報告を送信",
  "bug.sending": "送信中…",
  "bug.sent_title": "ありがとうございます！",
  "bug.sent_body_1": "バグレポートを受け付けました。",
  "bug.sent_body_2": "早急に確認し修正いたします。",
  "bug.close": "閉じる",
};

const messages = { ko, en, ja } satisfies Messages<Key>;
export default messages;
