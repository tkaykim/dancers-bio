import type { Locale } from "../locale";
import { interpolate } from "../interpolate";

/**
 * 간편 접수(/apply)·영상 제출(/submit) 흐름의 문구 사전.
 *
 * 이 두 흐름만 담는 이유
 *   로그인 없이 외부인이 들어오는 유일한 경로이고, 외국인 지원자가 실제로 막히는 곳이다.
 *   로그인 뒤 운영자 콘솔은 한국어 사용자만 쓰므로 여기 포함하지 않는다.
 *   범위를 넓힐 때는 키를 추가하면 되고, en·ja 번역이 빠지면 타입 에러로 잡힌다.
 *
 * 사용법 (서버)
 *   const locale = await localeFor(project.title, project.description);  // ./server
 *   t(locale, "apply.error.quota_full")
 *
 * 언어는 공고 본문이 1순위고, 판단이 안 서면 요청 언어(쿼리·쿠키·Accept-Language)로 떨어진다
 * (docs/design-i18n-ui.md §3.2 예외). 클라이언트 컴포넌트에서도 그대로 import 한다(서버 전용 코드 없음).
 */

const ko = {
  // ── 선발 단계 라벨 ────────────────────────────────────────
  // 공고에 round_labels 가 없을 때의 기본 이름. 앱 화면과 메일이 함께 쓴다.
  "stage.label.final": "최종 합격",
  "stage.label.round": "{round}차 합격",

  // ── 간편 접수: 서버 액션 에러 ──────────────────────────────
  "apply.error.name_required": "이름을 입력해 주세요.",
  "apply.error.name_too_long": "이름이 너무 깁니다.",
  "apply.error.email_invalid": "이메일 형식을 확인해 주세요.",
  "apply.error.phone_required": "전화번호를 입력해 주세요.",
  "apply.error.phone_invalid": "전화번호를 다시 확인해 주세요.",
  "apply.error.instagram_required": "인스타그램 아이디를 입력해 주세요.",
  "apply.error.instagram_invalid": "인스타그램 아이디를 다시 확인해 주세요.",
  "apply.error.invalid_input": "입력값을 확인해 주세요.",
  "apply.error.not_found": "공고를 찾을 수 없습니다.",
  "apply.error.closed": "마감된 공고입니다.",
  "apply.error.not_public": "공개 공고가 아닙니다.",
  "apply.error.needs_full_form":
    "이 공고는 상세 지원서 작성이 필요해 간편 접수를 사용할 수 없습니다. 로그인 후 지원해 주세요.",
  "apply.error.deadline_passed": "지원 마감일이 지났습니다.",
  "apply.error.quota_full": "모집 정원이 마감되었습니다.",
  "apply.error.email_taken": "이미 가입된 이메일입니다. 로그인 후 지원해 주세요.",
  "apply.error.generic": "접수 처리 중 문제가 생겼습니다.",
  "apply.error.generic_retry":
    "접수 처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.",
  "apply.error.submit_link_failed":
    "접수는 되었지만 업로드 링크 생성에 실패했습니다. 메일로 다시 안내드리겠습니다.",

  // ── 간편 접수: 페이지 ──────────────────────────────────────
  "apply.meta.not_found": "공고를 찾을 수 없습니다 | deetz",
  "apply.meta.title": "{title} | deetz 간편 접수",
  "apply.meta.description": "회원가입 없이 이름·연락처만으로 바로 접수할 수 있습니다.",
  "apply.badge.no_signup": "회원가입 없이 접수",
  "apply.row.pay": "페이",
  "apply.row.deadline": "접수 마감",
  "apply.row.region": "지역",
  "apply.pay.krw": "{amount}원",
  "apply.closed": "접수가 마감되었습니다.",
  "apply.full_form.title": "이 공고는 상세 지원서를 받습니다.",
  "apply.full_form.body":
    "키·생년·장르·댄스 영상 링크 등을 함께 제출해야 해서 간편 접수로는 지원할 수 없습니다.",
  "apply.full_form.hint": "아래에서 로그인하신 뒤 지원해 주세요.",
  "apply.full_form.cta": "로그인하고 지원하기 →",
  "apply.description_heading": "공고 내용",

  // ── 간편 접수: 폼 ──────────────────────────────────────────
  "apply.form.name": "이름",
  "apply.form.name_placeholder": "홍길동",
  "apply.form.instagram": "인스타그램 아이디",
  "apply.form.instagram_hint":
    "영상 파일과 게시물 확인에 사용됩니다. @ 없이 아이디만 적어주세요.",
  "apply.form.email": "이메일",
  "apply.form.email_hint": "가이드라인과 업로드 링크를 보내드립니다.",
  // 이미 접수한 사람이 업로드 링크를 잃었을 때의 유일한 복구 창구.
  // 같은 정보로 다시 넣으면 기존 링크를 돌려주는데, 그 사실을 아무도 몰라
  // "제출 버튼을 못 찾겠다"는 문의가 나왔다.
  "apply.form.recovery_title": "이미 접수하셨나요?",
  "apply.form.recovery_body": "업로드 링크를 못 찾으시면, 접수하실 때 쓰신 정보를 그대로 다시 입력해 주세요.",
  "apply.form.recovery_note": "기존 링크를 다시 보여드립니다. 중복 접수되지 않습니다.",
  // 도메인 오타 제안. 막지 않고 고칠 후보만 보여준다 — 실존 도메인을 오판해
  // 접수를 막으면 지원 자체를 잃고, 그 손해가 반송보다 크다.
  "apply.form.email_typo_prefix": "혹시",
  "apply.form.email_typo_suffix": " 아닌가요?",
  "apply.form.email_typo_apply": "이걸로 고치기",
  "apply.form.phone": "전화번호",
  "apply.form.submit": "접수하기",
  "apply.form.submitting": "접수 중...",
  "apply.form.terms_prefix": "접수 시 deetz ",
  "apply.form.terms_link": "이용약관",
  "apply.form.terms_mid": " 및 ",
  "apply.form.privacy_link": "개인정보처리방침",
  "apply.form.terms_suffix": "에 동의하는 것으로 봅니다.",

  // ── 간편 접수: 완료 화면 ───────────────────────────────────
  "apply.done.new.title": "접수 완료되었습니다",
  "apply.done.review.title": "지원서가 접수되었습니다",
  "apply.done.review.body": "지원서 접수와 최종 선발은 별개입니다.\n선발 결과와 참석 안내는 담당자가 별도로 안내합니다.",
  "apply.done.new.body": "가이드를 확인하신 뒤 촬영해 주세요.",
  "apply.done.existing.title": "이미 접수하셨습니다",
  "apply.done.existing.body": "같은 인스타그램 아이디로 접수한 내역이 있습니다.",
  "apply.done.rejoined.title": "다시 참여 처리되었습니다",
  "apply.done.rejoined.body":
    "앞서 참여가 어렵다고 알려주셨던 건을 다시 열어드렸습니다. 가이드를 확인하신 뒤 촬영해 주세요.",
  "apply.done.guide_cta": "제작 가이드 먼저 확인하기",
  "apply.done.checklist_title": "촬영 전 꼭 확인",
  "apply.done.checklist_audio":
    "· 음원은 인스타그램 오디오 탭에서 ‘AI-DOL I Wash’ 를 직접 선택",
  "apply.done.checklist_tags": "· 해시태그 #광고 #iwash #aidol",
  "apply.done.checklist_mention": "· 계정 태그 @awc.ent",
  "apply.done.checklist_warning": "하나라도 빠지면 광고 건으로 인정되지 않습니다.",
  "apply.done.after_shoot": "촬영을 마치셨다면",
  "apply.done.upload_cta": "영상 올리러 가기",
  "apply.done.link_mail": "같은 내용을 메일로도 보내드립니다.",
  "apply.done.link_note":
    "아래는 본인 전용 업로드 링크입니다. 나중에 올리실 거라면 저장해 두세요.",

  // ── 영상 제출: 페이지 ──────────────────────────────────────
  "submit.meta.title": "영상 제출 · deetz",
  "submit.heading": "영상 제출",
  "submit.fallback_project": "프로젝트",
  "submit.blocked.title": "지금은 제출하실 수 없습니다.",
  "submit.blocked.revoked": "제출이 마감되었습니다.",
  "submit.blocked.no_application": "지원 내역을 찾을 수 없습니다.",
  "submit.blocked.not_confirmed":
    "아직 참여가 확정되지 않았습니다. 확정 안내를 받으신 뒤 이용해 주세요.",
  "submit.footer.personal": "본인에게만 발급된 링크입니다.",
  "submit.footer.no_share": "다른 분과 공유하지 말아 주세요.",
  "submit.footer.contact": "문의 contact@deetz.kr",

  // ── 영상 제출: 제출자 정보 ─────────────────────────────────
  "submit.panel.submitter": "제출자",
  "submit.panel.account_note":
    "업로드한 영상이 이 계정 기준으로 정리됩니다. 계정이 바뀌었거나 잘못 등록되어 있으면 수정해 주세요.",
  "submit.handle.short_label": "인스타그램",
  "submit.handle.label": "인스타그램 아이디",
  "submit.handle.edit": "수정",
  "submit.handle.save": "저장",
  "submit.handle.saving": "저장 중",
  "submit.handle.cancel": "취소",
  "submit.handle.saved": "저장했습니다.",
  "submit.handle.save_failed": "저장하지 못했습니다.",

  // ── 영상 제출: 업로더 ──────────────────────────────────────
  "submit.upload.received": "제출이 접수되었습니다.",
  "submit.upload.choose": "영상 파일 선택",
  "submit.upload.reupload": "다시 올리기",
  "submit.upload.preparing": "준비 중...",
  "submit.upload.uploading": "업로드 중 {percent}%",
  "submit.upload.finishing": "마무리 중...",
  "submit.upload.start_failed": "업로드를 시작하지 못했습니다.",
  "submit.upload.bad_response": "업로드 응답을 확인하지 못했습니다.",
  "submit.upload.failed_status": "업로드에 실패했습니다. ({status})",
  "submit.upload.network": "네트워크 오류로 업로드가 중단되었습니다.",
  "submit.upload.aborted": "업로드가 취소되었습니다.",
  "submit.upload.complete_failed": "제출을 마무리하지 못했습니다.",
  "submit.upload.failed": "업로드에 실패했습니다.",
  "submit.upload.note_filename": "파일명은 자동으로 {handle} 으로 저장됩니다.",
  "submit.upload.note_no_rename": "직접 파일 이름을 바꾸실 필요는 없습니다.",
  "submit.upload.note_keep_open": "업로드 중에는 창을 닫지 말아 주세요.",
  "submit.upload.note_last_wins":
    "다시 올리시면 마지막에 올린 영상이 최종 제출본이 됩니다.",

  // ── 영상 제출: 공동 촬영자 ─────────────────────────────────
  "submit.collab.title": "함께 촬영한 분",
  "submit.collab.help":
    "영상에 다른 댄서가 함께 나오거나 인스타그램 공동 작업자로 올리실 예정이면 아이디를 남겨 주세요. 확인 후 저희가 개별로 안내드립니다.",
  "submit.collab.remove_aria": "{index}번째 삭제",
  "submit.collab.remove": "삭제",
  "submit.collab.add": "+ 추가",
  "submit.collab.save": "저장",
  "submit.collab.saving": "저장 중",
  "submit.collab.saved": "저장됨 — {list}",
  "submit.collab.saved_none": "저장됨 — 없음",
  "submit.collab.save_failed": "저장하지 못했습니다.",

  // ── 영상 제출: API 에러 ────────────────────────────────────
  "submit.api.invalid_link": "유효하지 않은 링크입니다.",
  "submit.api.video_only": "영상 파일만 올릴 수 있습니다.",
  "submit.api.size_unknown": "파일 크기를 확인할 수 없습니다.",
  "submit.api.too_large": "파일이 너무 큽니다. 8GB 이하로 올려 주세요.",
  "submit.api.server_misconfig": "서버 설정이 누락되었습니다. 관리자에게 문의해 주세요.",
  "submit.api.handle_format":
    "인스타그램 아이디 형식이 올바르지 않습니다. 영문·숫자·마침표·밑줄만 쓸 수 있습니다.",
  "submit.api.handle_taken":
    "이미 다른 참여자가 등록한 아이디입니다. 본인 계정이 맞다면 contact@deetz.kr 로 알려주세요.",
  "submit.api.save_failed": "저장에 실패했습니다.",
  "submit.api.file_info_missing": "파일 정보를 확인할 수 없습니다.",
  "submit.api.upload_location": "업로드 위치를 확인하지 못했습니다.",
  "submit.api.record_failed": "제출 기록에 실패했습니다.",
} as const;

export type MessageKey = keyof typeof ko;

/** ko 와 키가 어긋나면 여기서 타입 에러가 난다 — 번역 누락 방지. */
const en: Record<MessageKey, string> = {
  "stage.label.final": "Final selection",
  "stage.label.round": "Round {round} pass",

  "apply.error.name_required": "Please enter your name.",
  "apply.error.name_too_long": "That name is too long.",
  "apply.error.email_invalid": "Please check your email address.",
  "apply.error.phone_required": "Please enter your phone number.",
  "apply.error.phone_invalid": "Please check your phone number.",
  "apply.error.instagram_required": "Please enter your Instagram handle.",
  "apply.error.instagram_invalid": "Please check your Instagram handle.",
  "apply.error.invalid_input": "Please check what you entered.",
  "apply.error.not_found": "We could not find this casting call.",
  "apply.error.closed": "This casting call is closed.",
  "apply.error.not_public": "This casting call is not open to the public.",
  "apply.error.needs_full_form":
    "This casting call requires the full application form, so quick apply is not available. Please log in and apply there.",
  "apply.error.deadline_passed": "The application deadline has passed.",
  "apply.error.quota_full": "All positions have been filled.",
  "apply.error.email_taken":
    "This email is already registered. Please log in and apply.",
  "apply.error.generic": "Something went wrong while submitting your application.",
  "apply.error.generic_retry":
    "Something went wrong while submitting your application. Please try again in a moment.",
  "apply.error.submit_link_failed":
    "Your application was received, but we could not create your upload link. We will email it to you.",

  "apply.meta.not_found": "Casting call not found | deetz",
  "apply.meta.title": "{title} | deetz quick apply",
  "apply.meta.description":
    "Apply in one step with your name and contact details, no account needed.",
  "apply.badge.no_signup": "Apply without an account",
  "apply.row.pay": "Pay",
  "apply.row.deadline": "Deadline",
  "apply.row.region": "Location",
  "apply.pay.krw": "KRW {amount}",
  "apply.closed": "Applications are closed.",
  "apply.full_form.title": "This casting call uses the full application form.",
  "apply.full_form.body":
    "It asks for your height, year of birth, genres and dance video links, so quick apply cannot cover it.",
  "apply.full_form.hint": "Please log in below and apply there.",
  "apply.full_form.cta": "Log in and apply →",
  "apply.description_heading": "About this casting call",

  "apply.form.name": "Name",
  "apply.form.name_placeholder": "Jane Doe",
  "apply.form.instagram": "Instagram handle",
  "apply.form.instagram_hint":
    "Used to match your video file and your post. Enter the handle only, without @.",
  "apply.form.email": "Email",
  "apply.form.email_hint": "We will send the guidelines and your upload link here.",
  "apply.form.recovery_title": "Already applied?",
  "apply.form.recovery_body": "If you cannot find your upload link, just enter the same details you used when applying.",
  "apply.form.recovery_note": "We will show your existing link again. This will not create a duplicate application.",
  "apply.form.email_typo_prefix": "Did you mean",
  "apply.form.email_typo_suffix": "?",
  "apply.form.email_typo_apply": "Use this instead",
  "apply.form.phone": "Phone number",
  "apply.form.submit": "Apply",
  "apply.form.submitting": "Submitting...",
  "apply.form.terms_prefix": "By applying you agree to the deetz ",
  "apply.form.terms_link": "Terms of Service",
  "apply.form.terms_mid": " and ",
  "apply.form.privacy_link": "Privacy Policy",
  "apply.form.terms_suffix": ".",

  "apply.done.new.title": "Your application is in",
  "apply.done.review.title": "Your application has been received",
  "apply.done.review.body": "Submitting an application does not confirm your selection.\nThe organizer will share selection results and attendance details separately.",
  "apply.done.new.body": "Read the guide before you film.",
  "apply.done.existing.title": "You have already applied",
  "apply.done.existing.body":
    "We already have an application under this Instagram handle.",
  "apply.done.rejoined.title": "You are back in",
  "apply.done.rejoined.body":
    "We have reopened the application you withdrew earlier. Read the guide before you film.",
  "apply.done.guide_cta": "Read the production guide first",
  "apply.done.checklist_title": "Check before you film",
  "apply.done.checklist_audio":
    "· Pick the track ‘AI-DOL I Wash’ yourself from the Instagram audio tab",
  "apply.done.checklist_tags": "· Hashtags #광고 #iwash #aidol",
  "apply.done.checklist_mention": "· Tag the account @awc.ent",
  "apply.done.checklist_warning":
    "If even one of these is missing, your post will not count for the campaign.",
  "apply.done.after_shoot": "Once you have finished filming",
  "apply.done.upload_cta": "Upload your video",
  "apply.done.link_mail": "We are also sending you the same details by email.",
  "apply.done.link_note":
    "Below is your personal upload link. Save it if you plan to upload later.",

  "submit.meta.title": "Video submission · deetz",
  "submit.heading": "Video submission",
  "submit.fallback_project": "Project",
  "submit.blocked.title": "You cannot submit right now.",
  "submit.blocked.revoked": "Submissions are closed.",
  "submit.blocked.no_application": "We could not find your application.",
  "submit.blocked.not_confirmed":
    "Your place is not confirmed yet. Please wait until you receive the confirmation notice.",
  "submit.footer.personal": "This link was issued to you alone.",
  "submit.footer.no_share": "Please do not share it with anyone else.",
  "submit.footer.contact": "Questions: contact@deetz.kr",

  "submit.panel.submitter": "Submitted by",
  "submit.panel.account_note":
    "Your upload is filed under this account. If the account changed or was entered incorrectly, please fix it.",
  "submit.handle.short_label": "Instagram",
  "submit.handle.label": "Instagram handle",
  "submit.handle.edit": "Edit",
  "submit.handle.save": "Save",
  "submit.handle.saving": "Saving",
  "submit.handle.cancel": "Cancel",
  "submit.handle.saved": "Saved.",
  "submit.handle.save_failed": "We could not save that.",

  "submit.upload.received": "Your submission is in.",
  "submit.upload.choose": "Choose a video file",
  "submit.upload.reupload": "Upload again",
  "submit.upload.preparing": "Preparing...",
  "submit.upload.uploading": "Uploading {percent}%",
  "submit.upload.finishing": "Finishing...",
  "submit.upload.start_failed": "We could not start the upload.",
  "submit.upload.bad_response": "We could not read the upload response.",
  "submit.upload.failed_status": "The upload failed. ({status})",
  "submit.upload.network": "The upload stopped because of a network error.",
  "submit.upload.aborted": "The upload was cancelled.",
  "submit.upload.complete_failed": "We could not finish your submission.",
  "submit.upload.failed": "The upload failed.",
  "submit.upload.note_filename": "Your file is saved as {handle} automatically.",
  "submit.upload.note_no_rename": "You do not need to rename it yourself.",
  "submit.upload.note_keep_open": "Please keep this window open while uploading.",
  "submit.upload.note_last_wins":
    "If you upload again, the last video you send becomes your final submission.",

  "submit.collab.title": "Who you filmed with",
  "submit.collab.help":
    "If another dancer appears in the video, or you will post it as an Instagram collaboration, leave their handle here. We will follow up with them individually.",
  "submit.collab.remove_aria": "Remove row {index}",
  "submit.collab.remove": "Remove",
  "submit.collab.add": "+ Add",
  "submit.collab.save": "Save",
  "submit.collab.saving": "Saving",
  "submit.collab.saved": "Saved — {list}",
  "submit.collab.saved_none": "Saved — none",
  "submit.collab.save_failed": "We could not save that.",

  "submit.api.invalid_link": "This link is not valid.",
  "submit.api.video_only": "Only video files can be uploaded.",
  "submit.api.size_unknown": "We could not read the file size.",
  "submit.api.too_large": "That file is too large. Please upload a file of 8GB or less.",
  "submit.api.server_misconfig":
    "A server setting is missing. Please contact the administrator.",
  "submit.api.handle_format":
    "That Instagram handle is not valid. Only letters, numbers, periods and underscores are allowed.",
  "submit.api.handle_taken":
    "Another participant already registered this handle. If it is yours, let us know at contact@deetz.kr.",
  "submit.api.save_failed": "We could not save that.",
  "submit.api.file_info_missing": "We could not read the file details.",
  "submit.api.upload_location": "We could not determine the upload location.",
  "submit.api.record_failed": "We could not record your submission.",
};

/** ko·en 과 키가 어긋나면 여기서 타입 에러가 난다 — です・ます체, 브랜드 표기는 그대로 둔다. */
const ja: Record<MessageKey, string> = {
  "stage.label.final": "最終合格",
  "stage.label.round": "{round}次合格",

  "apply.error.name_required": "お名前を入力してください。",
  "apply.error.name_too_long": "お名前が長すぎます。",
  "apply.error.email_invalid": "メールアドレスの形式をご確認ください。",
  "apply.error.phone_required": "電話番号を入力してください。",
  "apply.error.phone_invalid": "電話番号をもう一度ご確認ください。",
  "apply.error.instagram_required": "Instagramのユーザーネームを入力してください。",
  "apply.error.instagram_invalid": "Instagramのユーザーネームをもう一度ご確認ください。",
  "apply.error.invalid_input": "入力内容をご確認ください。",
  "apply.error.not_found": "募集が見つかりません。",
  "apply.error.closed": "締め切られた募集です。",
  "apply.error.not_public": "公開募集ではありません。",
  "apply.error.needs_full_form":
    "この募集は詳細な応募フォームの入力が必要なため、かんたん応募はご利用いただけません。ログインのうえご応募ください。",
  "apply.error.deadline_passed": "応募の締切日が過ぎました。",
  "apply.error.quota_full": "募集定員に達しました。",
  "apply.error.email_taken":
    "すでに登録されているメールアドレスです。ログインのうえご応募ください。",
  "apply.error.generic": "応募の処理中に問題が発生しました。",
  "apply.error.generic_retry":
    "応募の処理中に問題が発生しました。しばらくしてからもう一度お試しください。",
  "apply.error.submit_link_failed":
    "応募は受け付けましたが、アップロードリンクの作成に失敗しました。メールで改めてご案内します。",

  "apply.meta.not_found": "募集が見つかりません | deetz",
  "apply.meta.title": "{title} | deetz かんたん応募",
  "apply.meta.description": "会員登録なしで、お名前と連絡先だけですぐに応募できます。",
  "apply.badge.no_signup": "会員登録なしで応募",
  "apply.row.pay": "出演料",
  "apply.row.deadline": "応募締切",
  "apply.row.region": "地域",
  "apply.pay.krw": "{amount}ウォン",
  "apply.closed": "応募は締め切られました。",
  "apply.full_form.title": "この募集は詳細な応募フォームで受け付けます。",
  "apply.full_form.body":
    "身長・生年・ジャンル・ダンス動画リンクなどを一緒にご提出いただくため、かんたん応募ではご応募いただけません。",
  "apply.full_form.hint": "下からログインのうえご応募ください。",
  "apply.full_form.cta": "ログインして応募する →",
  "apply.description_heading": "募集内容",

  "apply.form.name": "お名前",
  "apply.form.name_placeholder": "山田花子",
  "apply.form.instagram": "Instagramのユーザーネーム",
  "apply.form.instagram_hint":
    "動画ファイルと投稿の確認に使用します。@は付けずにユーザーネームのみご入力ください。",
  "apply.form.email": "メールアドレス",
  "apply.form.email_hint": "ガイドラインとアップロードリンクをお送りします。",
  "apply.form.recovery_title": "すでに応募済みですか。",
  "apply.form.recovery_body": "アップロードリンクが見つからない場合は、応募時にご入力いただいた情報をそのままもう一度ご入力ください。",
  "apply.form.recovery_note": "既存のリンクを改めて表示します。重複して応募されることはありません。",
  "apply.form.email_typo_prefix": "もしかして",
  "apply.form.email_typo_suffix": " ではありませんか。",
  "apply.form.email_typo_apply": "これに修正する",
  "apply.form.phone": "電話番号",
  "apply.form.submit": "応募する",
  "apply.form.submitting": "応募中...",
  "apply.form.terms_prefix": "応募をもって deetz の",
  "apply.form.terms_link": "利用規約",
  "apply.form.terms_mid": "および",
  "apply.form.privacy_link": "プライバシーポリシー",
  "apply.form.terms_suffix": "に同意したものとみなします。",

  "apply.done.new.title": "応募が完了しました",
  "apply.done.review.title": "応募を受け付けました",
  "apply.done.review.body": "応募の受付と最終選考は別のものです。\n選考結果と参加のご案内は担当者から別途お知らせします。",
  "apply.done.new.body": "ガイドをご確認のうえ撮影してください。",
  "apply.done.existing.title": "すでに応募されています",
  "apply.done.existing.body": "同じInstagramのユーザーネームで応募された記録があります。",
  "apply.done.rejoined.title": "再度の参加として処理しました",
  "apply.done.rejoined.body":
    "先に参加が難しいとお知らせいただいた件を、改めてお受けしました。ガイドをご確認のうえ撮影してください。",
  "apply.done.guide_cta": "先に制作ガイドを確認する",
  "apply.done.checklist_title": "撮影前の必須確認",
  "apply.done.checklist_audio":
    "· 音源はInstagramのオーディオタブから「AI-DOL I Wash」をご自身で選択",
  "apply.done.checklist_tags": "· ハッシュタグ #광고 #iwash #aidol",
  "apply.done.checklist_mention": "· アカウントタグ @awc.ent",
  "apply.done.checklist_warning": "1つでも欠けると広告案件として認められません。",
  "apply.done.after_shoot": "撮影が終わりましたら",
  "apply.done.upload_cta": "動画をアップロードする",
  "apply.done.link_mail": "同じ内容をメールでもお送りします。",
  "apply.done.link_note":
    "以下はご本人専用のアップロードリンクです。後でアップロードされる場合は保存しておいてください。",

  "submit.meta.title": "動画提出 · deetz",
  "submit.heading": "動画提出",
  "submit.fallback_project": "プロジェクト",
  "submit.blocked.title": "現在は提出いただけません。",
  "submit.blocked.revoked": "提出は締め切られました。",
  "submit.blocked.no_application": "応募の記録が見つかりません。",
  "submit.blocked.not_confirmed":
    "まだ参加が確定していません。確定のご案内を受け取られてからご利用ください。",
  "submit.footer.personal": "ご本人にのみ発行されたリンクです。",
  "submit.footer.no_share": "他の方と共有しないでください。",
  "submit.footer.contact": "お問い合わせ contact@deetz.kr",

  "submit.panel.submitter": "提出者",
  "submit.panel.account_note":
    "アップロードした動画はこのアカウントを基準に整理されます。アカウントが変わった場合や誤って登録されている場合は修正してください。",
  "submit.handle.short_label": "Instagram",
  "submit.handle.label": "Instagramのユーザーネーム",
  "submit.handle.edit": "編集",
  "submit.handle.save": "保存",
  "submit.handle.saving": "保存中",
  "submit.handle.cancel": "キャンセル",
  "submit.handle.saved": "保存しました。",
  "submit.handle.save_failed": "保存できませんでした。",

  "submit.upload.received": "提出を受け付けました。",
  "submit.upload.choose": "動画ファイルを選択",
  "submit.upload.reupload": "もう一度アップロード",
  "submit.upload.preparing": "準備中...",
  "submit.upload.uploading": "アップロード中 {percent}%",
  "submit.upload.finishing": "仕上げ中...",
  "submit.upload.start_failed": "アップロードを開始できませんでした。",
  "submit.upload.bad_response": "アップロードの応答を確認できませんでした。",
  "submit.upload.failed_status": "アップロードに失敗しました。（{status}）",
  "submit.upload.network": "ネットワークエラーでアップロードが中断されました。",
  "submit.upload.aborted": "アップロードがキャンセルされました。",
  "submit.upload.complete_failed": "提出を完了できませんでした。",
  "submit.upload.failed": "アップロードに失敗しました。",
  "submit.upload.note_filename": "ファイル名は自動的に {handle} として保存されます。",
  "submit.upload.note_no_rename": "ご自身でファイル名を変更する必要はありません。",
  "submit.upload.note_keep_open": "アップロード中はウィンドウを閉じないでください。",
  "submit.upload.note_last_wins":
    "もう一度アップロードされた場合は、最後にアップロードされた動画が最終提出となります。",

  "submit.collab.title": "一緒に撮影した方",
  "submit.collab.help":
    "動画に他のダンサーが一緒に映っている場合や、Instagramのコラボ投稿として公開される予定の場合は、ユーザーネームをご記入ください。確認のうえ個別にご案内します。",
  "submit.collab.remove_aria": "{index}番目を削除",
  "submit.collab.remove": "削除",
  "submit.collab.add": "+ 追加",
  "submit.collab.save": "保存",
  "submit.collab.saving": "保存中",
  "submit.collab.saved": "保存しました — {list}",
  "submit.collab.saved_none": "保存しました — なし",
  "submit.collab.save_failed": "保存できませんでした。",

  "submit.api.invalid_link": "有効なリンクではありません。",
  "submit.api.video_only": "動画ファイルのみアップロードできます。",
  "submit.api.size_unknown": "ファイルサイズを確認できません。",
  "submit.api.too_large": "ファイルが大きすぎます。8GB以下でアップロードしてください。",
  "submit.api.server_misconfig": "サーバー設定が不足しています。管理者にお問い合わせください。",
  "submit.api.handle_format":
    "Instagramのユーザーネームの形式が正しくありません。英数字・ピリオド・アンダースコアのみ使用できます。",
  "submit.api.handle_taken":
    "すでに他の参加者が登録したユーザーネームです。ご本人のアカウントである場合は contact@deetz.kr までお知らせください。",
  "submit.api.save_failed": "保存に失敗しました。",
  "submit.api.file_info_missing": "ファイル情報を確認できません。",
  "submit.api.upload_location": "アップロード先を確認できませんでした。",
  "submit.api.record_failed": "提出の記録に失敗しました。",
};

const MESSAGES: Record<Locale, Record<MessageKey, string>> = { ko, en, ja };

export function t(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  return interpolate(MESSAGES[locale][key], vars);
}

/**
 * 임의의 문자열이 사전에 있는 키인지 본다.
 * zod 스키마가 message 자리에 키를 담아 던지는데, 커스텀 메시지가 없는 이슈
 * (필드 자체가 빠진 경우 등)는 "Required" 같은 zod 기본 문구가 오기 때문에 걸러야 한다.
 */
export function isMessageKey(value: unknown): value is MessageKey {
  return typeof value === "string" && Object.hasOwn(ko, value);
}

/** 컴포넌트마다 locale 을 다시 쓰지 않도록 묶어 둔 헬퍼. */
export function translator(locale: Locale) {
  return (key: MessageKey, vars?: Record<string, string | number>) =>
    t(locale, key, vars);
}
