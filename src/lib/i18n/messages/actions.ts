import type { Messages } from "../t";

/**
 * 서버 액션 오류·성공 문구 (docs/design-i18n-ui.md §3.5).
 * 액션은 `const t = await serverT(actions)` 로 요청 언어 문장을 만들어 `error`/`message` 에 담아 반환한다.
 * 키 이름은 `<액션군>.<상황>`. actions/*.ts 의 사용자용 문구가 여기로 옮겨졌다.
 *
 * 관리자·운영 콘솔 전용 액션(캐스팅 콘솔의 단계 이동·일괄 처리·안내 발송, /admin 승인 등)과
 * 메일·알림·로그 문구는 범위 밖이라 코드에 한국어로 남아 있다.
 */
const ko = {
  "common.invalid_input": "입력값을 확인해 주세요.",
  "common.login_required": "로그인이 필요합니다.",
  "common.session_missing": "로그인 세션을 찾을 수 없습니다.",
  "common.forbidden": "권한이 없습니다.",
  "common.not_found": "찾을 수 없습니다.",
  "common.failed": "처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.",
  "common.saved": "저장했어요.",
  "common.invalid_request": "잘못된 요청입니다.",
  "common.update_forbidden": "수정 권한이 없습니다.",
  "common.unknown_error": "알 수 없는 오류",
  "common.unexpected_error": "알 수 없는 오류가 발생했습니다.",

  "auth.email_taken": "이미 가입된 이메일입니다.",
  "auth.login_failed": "이메일 또는 비밀번호가 올바르지 않습니다.",
  "auth.email_invalid": "올바른 이메일 주소를 입력해 주세요.",
  "auth.password_length": "비밀번호는 8~72자여야 합니다.",

  // 댄서 프로필 (portfolio·careers·rate-cards·claim 공용)
  "dancer.not_found": "댄서 프로필을 찾을 수 없습니다.",
  "dancer.create_first": "먼저 댄서 프로필을 만들어 주세요.",
  "dancer.edit_forbidden": "이 프로필을 편집할 권한이 없습니다.",
  "dancer.session_expired":
    "로그인이 만료되었어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.",
  "dancer.slug_conflict":
    "프로필 주소가 다른 분과 겹쳤어요. 활동명을 조금 바꿔서 다시 시도해 주세요.",
  "dancer.already_exists": "이미 프로필이 만들어져 있어요. 내 프로필에서 확인해 주세요.",
  "dancer.save_failed":
    "프로필을 저장하는 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요. 계속되면 문의해 주세요.",
  "dancer.photo_failed":
    "프로필 사진을 저장하지 못했어요. 사진을 다시 올리거나, 사진 없이 진행해 주세요.",
  "dancer.manager_insert_failed":
    "매니저 등록에 문제가 생겼어요. 잠시 후 다시 시도해 주세요. 계속되면 문의해 주세요.",

  // 포트폴리오 첨부파일
  "portfolio_file.url_not_allowed": "허용되지 않은 파일 URL입니다.",
  "portfolio_file.size_invalid": "파일 크기가 허용 범위를 벗어났습니다.",
  "portfolio_file.type_not_allowed": "허용되지 않은 파일 형식입니다.",

  // AI 포트폴리오 분석
  "portfolio_ai.text_required": "텍스트를 입력해 주세요.",
  "portfolio_ai.text_too_long": "텍스트는 {max}자 이하여야 합니다.",
  "portfolio_ai.invalid_path": "잘못된 파일 경로입니다.",
  "portfolio_ai.rate_limited": "잠시 후 다시 시도해 주세요. ({minutes}분 이내 재시도 제한)",
  "portfolio_ai.daily_limit": "오늘의 분석 한도({limit}회)를 모두 사용했습니다.",
  "portfolio_ai.pdf_read_failed": "PDF를 읽지 못했습니다: {reason}",
  "portfolio_ai.pdf_too_large": "PDF는 32MB 이하만 업로드할 수 있습니다.",

  // 경력
  "career.forbidden": "이 댄서 프로필의 경력을 수정할 권한이 없습니다.",

  // 단가 카드
  "rate_card.forbidden": "이 댄서의 단가를 수정할 권한이 없습니다.",
  "rate_card.service_required": "서비스 종류를 선택해 주세요.",
  "rate_card.country_code_invalid": "국가코드는 2자리 영문입니다. (예: JP, US)",
  "rate_card.price_required": "단가 또는 단가 범위를 하나 이상 입력해 주세요.",
  "rate_card.price_range_invalid": "단가 범위 하한이 상한보다 큽니다.",

  // 팀
  "team.logo_url_invalid": "팀 로고 URL 검증에 실패했습니다. 다시 시도해 주세요.",
  "team.slug_taken": "이미 사용 중인 slug입니다. 다른 값을 입력해 주세요.",
  "team.member_duplicate": "이미 등록된 멤버입니다.",
  "team.lead_remove_blocked":
    "리더는 멤버에서 직접 제외할 수 없습니다. 리더를 위임하거나 팀을 해체하세요.",
  "team.dancer_required": "팀을 만들려면 먼저 댄서 프로필이 필요합니다.",
  "team.member_uuid_not_found":
    "해당 UUID에 연결된 댄서 프로필을 찾지 못했습니다. UUID 없이 이름만 등록하려면 ID 칸을 비워두세요.",
  "team.member_identity_required": "플랫폼 계정 또는 이름 중 하나는 필수입니다.",
  "team.new_lead_needs_dancer": "후임은 댄서 프로필이 필요합니다.",
  "team.new_lead_must_be_member":
    "후임은 팀의 기존 멤버여야 합니다 (댄서 프로필 연결 필요).",

  // 공고
  "project.not_found": "프로젝트를 찾을 수 없습니다.",
  "project.post_not_found": "공고를 찾을 수 없습니다.",
  "project.closed": "마감된 프로젝트입니다.",
  "project.create_forbidden": "프로젝트 개설 권한이 없습니다. 관리자에게 문의해 주세요.",
  "project.manage_forbidden": "이 프로젝트를 관리할 권한이 없습니다.",
  "project.update_forbidden": "이 프로젝트를 수정할 권한이 없습니다.",
  "project.delete_forbidden": "삭제 권한이 없습니다. (소유자·관리자만 가능)",
  "project.agreed_pay_forbidden": "확정 비용 수정 권한이 없습니다.",
  "project.rounds_cannot_shrink":
    "이미 {deepest}단계까지 진행된 지원자가 있어 선발 단계를 {requested}단계로 줄일 수 없습니다.",
  "project.attachment_unreadable": "첨부파일 정보를 읽을 수 없습니다.",
  "project.attachment_invalid": "첨부파일 형식이 올바르지 않습니다.",
  "project.attachment_max": "첨부파일은 최대 {max}개까지 등록할 수 있습니다.",
  "project.attachment_existing_invalid": "기존 첨부파일 정보가 올바르지 않습니다.",
  "project.attachment_new_invalid": "새 첨부파일 정보가 올바르지 않습니다.",
  "project.attachment_foreign": "이 공고에 속하지 않은 첨부파일이 포함되어 있습니다.",

  // 직접 제안
  "proposal.send_forbidden": "이 프로젝트의 제안 발송 권한이 없습니다.",
  "proposal.team_not_allowed": "이 공고는 팀 제안을 받지 않습니다.",
  "proposal.team_invalid": "비활성이거나 존재하지 않는 팀입니다.",
  "proposal.own_team": "본인이 팀장인 팀에는 제안할 수 없습니다.",
  "proposal.dancer_invalid": "존재하지 않거나 비활성 댄서입니다.",
  "proposal.dancer_not_public": "아직 공개되지 않은 댄서입니다.",
  "proposal.duplicate": "이미 제안을 보냈거나 해당 대상이 이미 지원한 프로젝트입니다.",
  "proposal.forbidden": "제안 권한이 없습니다.",
  "proposal.own_target": "본인 소유 대상에게는 제안할 수 없습니다.",
  "proposal.not_found": "제안을 찾을 수 없습니다.",
  "proposal.respond_direct_only": "다이렉트 제안에만 응답할 수 있습니다.",
  "proposal.already_handled": "이미 처리된 제안입니다.",

  // 지원
  "apply.own_project": "본인이 개설한 프로젝트에는 지원할 수 없습니다.",
  "apply.closed": "현재 모집이 닫혀 있습니다.",
  "apply.deadline_passed": "지원 마감일이 지났습니다.",
  "apply.channel_check_failed": "모집채널 확인에 실패했습니다.",
  "apply.channel_invalid": "유효하지 않은 모집채널입니다.",
  "apply.schedule_load_failed": "일정 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  "apply.nationality_load_failed":
    "국적 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  "apply.nationality_required": "프로필에 국적을 먼저 등록해 주세요.",
  "apply.fee_required": "러프한 금액이라도 제안 단가를 입력해 주세요.",
  "apply.duplicate": "이미 지원하셨습니다.",
  "apply.forbidden": "지원 권한이 없습니다.",
  "apply.schedule_save_failed":
    "지원서는 접수됐지만 일정 응답 저장에 실패했습니다. 운영팀에 문의해 주세요.",

  "application.not_found": "지원 정보를 찾을 수 없습니다.",
  "application.withdraw_already_handled": "이미 처리된 지원은 취소할 수 없습니다.",
  "application.withdraw_not_owner": "본인 지원만 취소할 수 있습니다.",
  "application.decline_not_owner": "본인 지원만 포기할 수 있습니다.",
  "application.decline_state_invalid": "1차 합격 상태에서만 포기할 수 있습니다.",
  "application.decline_final_blocked":
    "최종 합격한 지원은 직접 포기할 수 없습니다. contact@deetz.kr 로 연락해 주세요.",
  "application.decline_reason_required": "이 단계에서는 포기 사유를 남겨주셔야 합니다.",

  // 프로필 클레임
  "claim.relation_required": "관계 정보를 선택해 주세요.",
  "claim.message_max": "메시지는 1000자 이내로 작성해 주세요.",
  "claim.already_owned": "이미 소유자가 있는 프로필입니다.",
  "claim.already_requested": "이미 신청한 프로필입니다. 관리자 처리 결과를 기다려 주세요.",

  // 버그 리포트
  "bug_report.save_failed": "리포트 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",

  // 인스타그램 인증
  "verification.handle_invalid":
    "올바른 인스타그램 핸들을 입력해 주세요. (영문/숫자/./_, 최대 30자)",

  // DB 트리거·RLS 오류 (lib/db-errors.ts)
  "db.generic": "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  "db.self_apply_dancer": "본인이 만든 프로젝트에 본인 댄서로는 지원할 수 없습니다.",
  "db.owner_dancer": "프로젝트 소유 댄서로는 같은 프로젝트에 지원할 수 없습니다.",
  "db.own_team_lead": "본인 팀(팀장 본인)이 만든 프로젝트에는 지원할 수 없습니다.",
  "db.owner_team": "프로젝트 소유 팀으로는 같은 프로젝트에 지원할 수 없습니다.",
  "db.own_project": "본인이 만든 프로젝트에는 지원·제안을 보낼 수 없습니다.",
  "db.remove_team_lead": "리더는 멤버에서 직접 제외할 수 없습니다. 리더를 위임하거나 팀을 해체하세요.",
  "db.admin_only": "관리자 권한 확인에 실패했습니다. 다시 로그인해 주세요.",
  "db.verification_gone": "이미 처리되었거나 존재하지 않는 인증 요청입니다.",
  "db.rls_denied": "권한이 없거나 보안 정책에 의해 거부되었습니다.",
  "db.duplicate": "이미 등록된 항목입니다.",

  // 지원서 일정 선택 (lib/application-availability.ts)
  "apply.availability_required": "참석 가능한 일정을 하나 이상 선택해 주세요.",
  "apply.availability_invalid": "선택한 일정 정보를 다시 확인해 주세요.",
} as const;

type Key = keyof typeof ko;

const en: Record<Key, string> = {
  "common.invalid_input": "Please check your input.",
  "common.login_required": "Please log in.",
  "common.session_missing": "We could not find your login session.",
  "common.forbidden": "You do not have permission to do this.",
  "common.not_found": "Not found.",
  "common.failed": "Something went wrong. Please try again in a moment.",
  "common.saved": "Saved.",
  "common.invalid_request": "That request is not valid.",
  "common.update_forbidden": "You do not have permission to edit this.",
  "common.unknown_error": "Unknown error",
  "common.unexpected_error": "Something went wrong.",

  "auth.email_taken": "This email is already registered.",
  "auth.login_failed": "The email or password is incorrect.",
  "auth.email_invalid": "Please enter a valid email address.",
  "auth.password_length": "Password must be 8 to 72 characters.",

  "dancer.not_found": "We could not find that dancer profile.",
  "dancer.create_first": "Create your dancer profile first.",
  "dancer.edit_forbidden": "You do not have permission to edit this profile.",
  "dancer.session_expired":
    "Your session expired. Please refresh the page and try again.",
  "dancer.slug_conflict":
    "That profile address is already taken. Change your stage name a little and try again.",
  "dancer.already_exists":
    "You already have a profile. You can find it under My profile.",
  "dancer.save_failed":
    "We could not save your profile. Please try again in a moment. Contact us if it keeps happening.",
  "dancer.photo_failed":
    "We could not save your profile photo. Upload it again, or continue without a photo.",
  "dancer.manager_insert_failed":
    "We could not register you as a manager. Please try again in a moment. Contact us if it keeps happening.",

  "portfolio_file.url_not_allowed": "That file URL is not allowed.",
  "portfolio_file.size_invalid": "That file size is outside the allowed range.",
  "portfolio_file.type_not_allowed": "That file type is not allowed.",

  "portfolio_ai.text_required": "Enter some text.",
  "portfolio_ai.text_too_long": "The text must be {max} characters or fewer.",
  "portfolio_ai.invalid_path": "That file path is not valid.",
  "portfolio_ai.rate_limited":
    "Please try again in a moment. (One try per {minutes} minutes)",
  "portfolio_ai.daily_limit":
    "You have used all of today's analyses ({limit} per day).",
  "portfolio_ai.pdf_read_failed": "We could not read the PDF: {reason}",
  "portfolio_ai.pdf_too_large": "PDFs must be 32MB or smaller.",

  "career.forbidden":
    "You do not have permission to edit the career history of this dancer profile.",

  "rate_card.forbidden": "You do not have permission to edit this dancer's rates.",
  "rate_card.service_required": "Choose a service type.",
  "rate_card.country_code_invalid":
    "The country code is two letters. (e.g. JP, US)",
  "rate_card.price_required": "Enter a rate or a rate range.",
  "rate_card.price_range_invalid":
    "The lower bound of the range is higher than the upper bound.",

  "team.logo_url_invalid": "We could not verify the team logo URL. Please try again.",
  "team.slug_taken": "That slug is already in use. Please enter another one.",
  "team.member_duplicate": "That member is already on the team.",
  "team.lead_remove_blocked":
    "The leader cannot be removed from the members directly. Transfer the lead or disband the team.",
  "team.dancer_required": "You need a dancer profile before you can create a team.",
  "team.member_uuid_not_found":
    "We could not find a dancer profile for that UUID. Leave the ID field empty to add a name only.",
  "team.member_identity_required": "Enter either a platform account or a name.",
  "team.new_lead_needs_dancer": "The new leader needs a dancer profile.",
  "team.new_lead_must_be_member":
    "The new leader must already be a member of the team (with a linked dancer profile).",

  "project.not_found": "We could not find that project.",
  "project.post_not_found": "We could not find that casting call.",
  "project.closed": "This project is closed.",
  "project.create_forbidden":
    "You do not have permission to create projects. Please contact the team.",
  "project.manage_forbidden": "You do not have permission to manage this project.",
  "project.update_forbidden": "You do not have permission to edit this project.",
  "project.delete_forbidden":
    "You do not have permission to delete this. (Owner or admin only)",
  "project.agreed_pay_forbidden":
    "You do not have permission to edit the agreed pay.",
  "project.rounds_cannot_shrink":
    "Some applicants have already reached round {deepest}, so you cannot reduce the selection to {requested} rounds.",
  "project.attachment_unreadable": "We could not read the attachment details.",
  "project.attachment_invalid": "The attachment format is not valid.",
  "project.attachment_max": "You can attach up to {max} files.",
  "project.attachment_existing_invalid":
    "The details of an existing attachment are not valid.",
  "project.attachment_new_invalid": "The details of a new attachment are not valid.",
  "project.attachment_foreign":
    "An attachment that does not belong to this casting call is included.",

  "proposal.send_forbidden":
    "You do not have permission to send offers for this project.",
  "proposal.team_not_allowed": "This casting call does not accept team offers.",
  "proposal.team_invalid": "That team is inactive or does not exist.",
  "proposal.own_team": "You cannot send an offer to a team you lead.",
  "proposal.dancer_invalid": "That dancer does not exist or is inactive.",
  "proposal.dancer_not_public": "That dancer is not public yet.",
  "proposal.duplicate":
    "You already sent an offer, or this target has already applied to the project.",
  "proposal.forbidden": "You do not have permission to send offers.",
  "proposal.own_target": "You cannot send an offer to a target you own.",
  "proposal.not_found": "We could not find that offer.",
  "proposal.respond_direct_only": "You can only respond to direct offers.",
  "proposal.already_handled": "That offer has already been handled.",

  "apply.own_project": "You cannot apply to a project you created.",
  "apply.closed": "This casting call is not accepting applications right now.",
  "apply.deadline_passed": "The application deadline has passed.",
  "apply.channel_check_failed": "We could not verify the recruitment channel.",
  "apply.channel_invalid": "That recruitment channel is not valid.",
  "apply.schedule_load_failed":
    "We could not load the schedule. Please try again in a moment.",
  "apply.nationality_load_failed":
    "We could not load your nationality details. Please try again in a moment.",
  "apply.nationality_required": "Add your nationality to your profile first.",
  "apply.fee_required": "Enter your proposed rate, even a rough number.",
  "apply.duplicate": "You have already applied.",
  "apply.forbidden": "You do not have permission to apply.",
  "apply.schedule_save_failed":
    "Your application was received, but we could not save your schedule answers. Please contact the team.",

  "application.not_found": "We could not find that application.",
  "application.withdraw_already_handled":
    "An application that has already been handled cannot be withdrawn.",
  "application.withdraw_not_owner": "You can only withdraw your own application.",
  "application.decline_not_owner": "You can only step back from your own application.",
  "application.decline_state_invalid":
    "You can only step back while you are a round 1 pass.",
  "application.decline_final_blocked":
    "A final selection cannot be declined here. Please contact contact@deetz.kr.",
  "application.decline_reason_required":
    "At this stage you need to leave a reason for stepping back.",

  "claim.relation_required": "Choose how you are related to this profile.",
  "claim.message_max": "Use 1000 characters or fewer for your message.",
  "claim.already_owned": "That profile already has an owner.",
  "claim.already_requested":
    "You already requested this profile. Please wait for the team to review it.",

  "bug_report.save_failed":
    "We could not save your report. Please try again in a moment.",

  "verification.handle_invalid":
    "Enter a valid Instagram handle. (letters, numbers, . and _, up to 30 characters)",
  "db.generic": "Something went wrong. Please try again in a moment.",
  "db.self_apply_dancer": "You cannot apply to your own project with your own dancer profile.",
  "db.owner_dancer": "The dancer who owns this project cannot apply to it.",
  "db.own_team_lead": "You cannot apply to a project created by a team you lead.",
  "db.owner_team": "The team that owns this project cannot apply to it.",
  "db.own_project": "You cannot apply or send offers to your own project.",
  "db.remove_team_lead": "The team lead cannot be removed from the members directly. Hand over the lead role or disband the team.",
  "db.admin_only": "We could not confirm admin permission. Please log in again.",
  "db.verification_gone": "This verification request was already handled or does not exist.",
  "db.rls_denied": "You do not have permission, or the security policy rejected this.",
  "db.duplicate": "This item is already registered.",

  "apply.availability_required": "Select at least one schedule you can attend.",
  "apply.availability_invalid": "Please check the schedules you selected.",

};

const ja: Record<Key, string> = {
  "common.invalid_input": "入力内容をご確認ください。",
  "common.login_required": "ログインが必要です。",
  "common.session_missing": "ログインセッションが見つかりません。",
  "common.forbidden": "権限がありません。",
  "common.not_found": "見つかりませんでした。",
  "common.failed": "処理中に問題が発生しました。しばらくしてからもう一度お試しください。",
  "common.saved": "保存しました。",
  "common.invalid_request": "不正なリクエストです。",
  "common.update_forbidden": "編集する権限がありません。",
  "common.unknown_error": "不明なエラー",
  "common.unexpected_error": "不明なエラーが発生しました。",

  "auth.email_taken": "このメールアドレスはすでに登録されています。",
  "auth.login_failed": "メールアドレスまたはパスワードが正しくありません。",
  "auth.email_invalid": "正しいメールアドレスを入力してください。",
  "auth.password_length": "パスワードは8〜72文字で入力してください。",

  "dancer.not_found": "ダンサープロフィールが見つかりません。",
  "dancer.create_first": "先にダンサープロフィールを作成してください。",
  "dancer.edit_forbidden": "このプロフィールを編集する権限がありません。",
  "dancer.session_expired":
    "ログインの有効期限が切れました。ページを再読み込みしてもう一度お試しください。",
  "dancer.slug_conflict":
    "プロフィールのアドレスが他の方と重なりました。活動名を少し変えてもう一度お試しください。",
  "dancer.already_exists":
    "すでにプロフィールが作成されています。マイプロフィールからご確認ください。",
  "dancer.save_failed":
    "プロフィールの保存中に問題が発生しました。しばらくしてからもう一度お試しください。解決しない場合はお問い合わせください。",
  "dancer.photo_failed":
    "プロフィール写真を保存できませんでした。写真をアップロードし直すか、写真なしで進めてください。",
  "dancer.manager_insert_failed":
    "マネージャー登録で問題が発生しました。しばらくしてからもう一度お試しください。解決しない場合はお問い合わせください。",

  "portfolio_file.url_not_allowed": "許可されていないファイルURLです。",
  "portfolio_file.size_invalid": "ファイルサイズが許可範囲を超えています。",
  "portfolio_file.type_not_allowed": "許可されていないファイル形式です。",

  "portfolio_ai.text_required": "テキストを入力してください。",
  "portfolio_ai.text_too_long": "テキストは{max}文字以内で入力してください。",
  "portfolio_ai.invalid_path": "ファイルパスが正しくありません。",
  "portfolio_ai.rate_limited":
    "しばらくしてからもう一度お試しください。({minutes}分以内の再試行はできません)",
  "portfolio_ai.daily_limit": "本日の解析回数({limit}回)をすべて使い切りました。",
  "portfolio_ai.pdf_read_failed": "PDFを読み込めませんでした: {reason}",
  "portfolio_ai.pdf_too_large": "PDFは32MB以下のみアップロードできます。",

  "career.forbidden": "このダンサープロフィールの経歴を編集する権限がありません。",

  "rate_card.forbidden": "このダンサーの料金を編集する権限がありません。",
  "rate_card.service_required": "サービスの種類を選択してください。",
  "rate_card.country_code_invalid": "国コードは英字2文字です。(例: JP, US)",
  "rate_card.price_required": "料金または料金の範囲を1つ以上入力してください。",
  "rate_card.price_range_invalid": "料金範囲の下限が上限を超えています。",

  "team.logo_url_invalid":
    "チームロゴのURLを確認できませんでした。もう一度お試しください。",
  "team.slug_taken": "そのslugはすでに使われています。別の値を入力してください。",
  "team.member_duplicate": "すでに登録されているメンバーです。",
  "team.lead_remove_blocked":
    "リーダーをメンバーから直接外すことはできません。リーダーを委任するか、チームを解散してください。",
  "team.dancer_required":
    "チームを作成するには、先にダンサープロフィールが必要です。",
  "team.member_uuid_not_found":
    "そのUUIDに紐づくダンサープロフィールが見つかりません。UUIDなしで名前だけ登録する場合はID欄を空にしてください。",
  "team.member_identity_required":
    "プラットフォームのアカウントまたは名前のいずれかが必要です。",
  "team.new_lead_needs_dancer": "後任にはダンサープロフィールが必要です。",
  "team.new_lead_must_be_member":
    "後任はチームの既存メンバーである必要があります(ダンサープロフィールの連携が必要)。",

  "project.not_found": "プロジェクトが見つかりません。",
  "project.post_not_found": "募集が見つかりません。",
  "project.closed": "締め切られたプロジェクトです。",
  "project.create_forbidden":
    "プロジェクトを作成する権限がありません。運営までお問い合わせください。",
  "project.manage_forbidden": "このプロジェクトを管理する権限がありません。",
  "project.update_forbidden": "このプロジェクトを編集する権限がありません。",
  "project.delete_forbidden": "削除する権限がありません。(オーナー・管理者のみ)",
  "project.agreed_pay_forbidden": "確定費用を編集する権限がありません。",
  "project.rounds_cannot_shrink":
    "すでに{deepest}段階まで進んだ応募者がいるため、選考ステップを{requested}段階に減らすことはできません。",
  "project.attachment_unreadable": "添付ファイルの情報を読み取れませんでした。",
  "project.attachment_invalid": "添付ファイルの形式が正しくありません。",
  "project.attachment_max": "添付ファイルは最大{max}件まで登録できます。",
  "project.attachment_existing_invalid": "既存の添付ファイルの情報が正しくありません。",
  "project.attachment_new_invalid": "新しい添付ファイルの情報が正しくありません。",
  "project.attachment_foreign": "この募集に属さない添付ファイルが含まれています。",

  "proposal.send_forbidden": "このプロジェクトでオファーを送る権限がありません。",
  "proposal.team_not_allowed": "この募集はチームへのオファーを受け付けていません。",
  "proposal.team_invalid": "無効、または存在しないチームです。",
  "proposal.own_team": "ご自身がリーダーのチームにはオファーできません。",
  "proposal.dancer_invalid": "存在しない、または無効なダンサーです。",
  "proposal.dancer_not_public": "まだ公開されていないダンサーです。",
  "proposal.duplicate":
    "すでにオファー済みか、その相手がすでに応募しているプロジェクトです。",
  "proposal.forbidden": "オファーを送る権限がありません。",
  "proposal.own_target": "ご自身が所有する相手にはオファーできません。",
  "proposal.not_found": "オファーが見つかりません。",
  "proposal.respond_direct_only": "直接オファーにのみ回答できます。",
  "proposal.already_handled": "すでに処理されたオファーです。",

  "apply.own_project": "ご自身が作成したプロジェクトには応募できません。",
  "apply.closed": "現在この募集は受付を停止しています。",
  "apply.deadline_passed": "応募の締切が過ぎています。",
  "apply.channel_check_failed": "募集チャネルを確認できませんでした。",
  "apply.channel_invalid": "無効な募集チャネルです。",
  "apply.schedule_load_failed":
    "スケジュール情報を確認できませんでした。しばらくしてからもう一度お試しください。",
  "apply.nationality_load_failed":
    "国籍情報を確認できませんでした。しばらくしてからもう一度お試しください。",
  "apply.nationality_required": "先にプロフィールへ国籍を登録してください。",
  "apply.fee_required": "おおよその金額でかまいませんので、希望する出演料を入力してください。",
  "apply.duplicate": "すでに応募済みです。",
  "apply.forbidden": "応募する権限がありません。",
  "apply.schedule_save_failed":
    "応募は受け付けましたが、スケジュールの回答を保存できませんでした。運営までお問い合わせください。",

  "application.not_found": "応募情報が見つかりません。",
  "application.withdraw_already_handled":
    "すでに処理された応募は取り消せません。",
  "application.withdraw_not_owner": "ご自身の応募のみ取り消せます。",
  "application.decline_not_owner": "ご自身の応募のみ辞退できます。",
  "application.decline_state_invalid": "一次合格の状態でのみ辞退できます。",
  "application.decline_final_blocked":
    "最終合格した応募はご自身で辞退できません。contact@deetz.kr までご連絡ください。",
  "application.decline_reason_required":
    "この段階では辞退の理由を記入していただく必要があります。",

  "claim.relation_required": "このプロフィールとの関係を選択してください。",
  "claim.message_max": "メッセージは1000文字以内で入力してください。",
  "claim.already_owned": "すでに所有者がいるプロフィールです。",
  "claim.already_requested":
    "すでに申請済みのプロフィールです。運営の確認結果をお待ちください。",

  "bug_report.save_failed":
    "レポートを保存できませんでした。しばらくしてからもう一度お試しください。",

  "verification.handle_invalid":
    "正しいInstagramのユーザー名を入力してください。(英数字・ドット・アンダースコア、最大30文字)",
  "db.generic": "処理中にエラーが発生しました。しばらくしてからもう一度お試しください。",
  "db.self_apply_dancer": "自分が作成したプロジェクトに自分のダンサープロフィールで応募することはできません。",
  "db.owner_dancer": "プロジェクトを所有するダンサーは同じプロジェクトに応募できません。",
  "db.own_team_lead": "自分がリーダーのチームが作成したプロジェクトには応募できません。",
  "db.owner_team": "プロジェクトを所有するチームは同じプロジェクトに応募できません。",
  "db.own_project": "自分が作成したプロジェクトには応募・オファーを送れません。",
  "db.remove_team_lead": "リーダーをメンバーから直接外すことはできません。リーダーを委任するか、チームを解散してください。",
  "db.admin_only": "管理者権限を確認できませんでした。もう一度ログインしてください。",
  "db.verification_gone": "すでに処理済みか、存在しない認証リクエストです。",
  "db.rls_denied": "権限がないか、セキュリティポリシーにより拒否されました。",
  "db.duplicate": "すでに登録されている項目です。",

  "apply.availability_required": "参加できる日程を1つ以上選択してください。",
  "apply.availability_invalid": "選択した日程情報をもう一度ご確認ください。",

};

const messages = { ko, en, ja } satisfies Messages<Key>;
export default messages;
