import type { Messages } from "../t";

/**
 * zod 메시지 키와 입력 검증 오류 (docs/design-i18n-ui.md §3.5).
 * zod 스키마에는 값 대신 키를 넣는다: z.string().min(1, "v.name_required")
 * 서버 액션은 localizeZodError() 로, 클라이언트는 useT(validation) 로 번역한다.
 * 키 이름은 `v.<대상>_<조건>`. lib/validation/*.ts 의 메시지가 전부 여기로 옮겨졌다.
 *
 * 글자 수·단계 수처럼 숫자가 박힌 문구는 zod 메시지가 정적 문자열이라 자리표시자를 쓸 수 없다.
 * 그래서 숫자를 각 언어 문장 안에 직접 넣는다(키 이름의 숫자와 스키마의 상수가 같아야 한다).
 */
const ko = {
  "v.invalid_input": "입력값을 확인해 주세요.",
  "v.required": "필수 입력 항목이에요.",
  "v.too_long": "너무 길어요.",
  "v.too_short": "너무 짧아요.",
  "v.email_invalid": "이메일 형식을 확인해 주세요.",
  "v.url_invalid": "올바른 링크 주소를 입력해 주세요.",
  "v.number_invalid": "숫자만 입력해 주세요.",
  "v.password_length": "비밀번호는 8~72자여야 합니다.",

  "v.phone_required": "휴대폰 번호를 입력해 주세요.",
  "v.phone_country": "국가와 전화번호를 다시 확인해 주세요.",
  "v.phone_invalid": "올바른 휴대폰 번호를 입력해 주세요.",

  // 어느 칸이 왜 막혔는지 알려주는 조합 문구 (actions/portfolio.ts 온보딩)
  "v.check_input": "입력한 정보를 다시 확인해 주세요.",
  "v.format_invalid": "형식이 올바르지 않아요.",
  "v.field_error": "{field} — {message}",

  "v.field.stage_name": "활동명",
  "v.field.korean_name": "한글 이름",
  "v.field.location": "활동 지역",
  "v.field.gender": "성별",
  "v.field.bio": "소개",
  "v.field.specialties": "전문 분야",
  "v.field.genres": "장르",
  "v.field.social_instagram_handle": "인스타그램 아이디",
  "v.field.social_youtube_handle": "유튜브 아이디",
  "v.field.social_tiktok_handle": "틱톡 아이디",

  // 링크
  "v.link_required": "링크를 입력해 주세요.",
  "v.link_too_long": "링크가 너무 깁니다.",
  "v.link_http_only": "http 또는 https 링크를 입력해 주세요.",

  // 이름
  "v.name_required": "이름을 입력해 주세요.",
  "v.name_max_50": "이름은 50자 이내로 입력해 주세요.",
  "v.name_max_100": "이름은 100자 이하로 입력해 주세요.",

  // 상세 지원 정보 (collect_casting_details)
  "v.birth_year_integer": "출생연도를 숫자로 입력해 주세요.",
  "v.birth_year_range": "출생연도를 확인해 주세요.",
  "v.height_integer": "키는 cm 단위의 정수로 입력해 주세요.",
  "v.height_range": "키를 확인해 주세요.",
  "v.primary_genre_required": "주 장르를 입력해 주세요.",
  "v.primary_genre_max_100": "주 장르는 100자 이하로 입력해 주세요.",
  "v.backup_history_required":
    "백업댄서 이력을 입력해 주세요. 경력이 없으면 '없음'이라고 적어 주세요.",
  "v.backup_history_max_2000": "백업댄서 이력은 2,000자 이하로 입력해 주세요.",

  // 가입·로그인
  "v.email_address_invalid": "올바른 이메일 주소를 입력해 주세요.",
  "v.password_min_8": "비밀번호는 8자 이상이어야 합니다.",
  "v.password_max_72": "비밀번호는 72자 이하여야 합니다.",
  "v.password_required": "비밀번호를 입력해 주세요.",

  // 버그 리포트
  "v.title_min_2": "제목은 최소 2자",
  "v.title_max_160": "제목은 최대 160자",
  "v.description_min_5": "설명은 최소 5자",
  "v.description_max_4000": "설명은 최대 4000자",

  // 프로필 주소(slug)·SNS 아이디
  "v.slug_min_2": "slug는 2자 이상이어야 합니다.",
  "v.slug_max_40": "slug는 40자 이하로 입력해 주세요.",
  "v.slug_pattern": "영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.",
  "v.handle_max_60": "아이디는 60자 이하로 입력해 주세요.",
  "v.handle_pattern":
    "SNS 아이디에는 한글·공백·특수문자를 넣을 수 없어요. 영문·숫자와 점(.) 밑줄(_) 붙임표(-)만 사용해 주세요. (예: dancer_kim)",

  // 프로필·경력
  "v.stage_name_required": "활동명을 입력해 주세요.",
  "v.image_url_not_allowed": "허용되지 않는 이미지 URL입니다.",
  "v.bio_max_500": "소개는 500자 이내로 입력해 주세요.",
  "v.career_title_required": "제목을 입력해 주세요.",
  "v.date_format": "YYYY-MM-DD 형식으로 입력해 주세요.",
  "v.video_url_unsupported": "지원하지 않는 영상 URL입니다. (YouTube/Vimeo)",

  // 공고
  "v.project_title_required": "제목을 입력해 주세요.",
  "v.project_description_min": "10자 이상 설명을 입력해 주세요.",
  "v.selection_rounds_min": "선발 단계는 1단계 이상이어야 합니다.",
  "v.selection_rounds_max": "선발 단계는 최대 3단계입니다.",

  // 직접 제안
  "v.proposal_target_xor": "dancer_id 또는 team_id 중 하나만 지정해야 합니다.",

  // 팀
  "v.team_name_required": "팀명을 입력해 주세요.",
  "v.member_identity_required": "플랫폼 계정 또는 이름 중 하나는 필수입니다.",
} as const;

type Key = keyof typeof ko;

const en: Record<Key, string> = {
  "v.invalid_input": "Please check your input.",
  "v.required": "This field is required.",
  "v.too_long": "This is too long.",
  "v.too_short": "This is too short.",
  "v.email_invalid": "Please check the email format.",
  "v.url_invalid": "Please enter a valid link.",
  "v.number_invalid": "Please enter numbers only.",
  "v.password_length": "Password must be 8 to 72 characters.",

  "v.phone_required": "Enter your mobile number.",
  "v.phone_country": "Check the country and phone number.",
  "v.phone_invalid": "Enter a valid mobile number.",

  "v.check_input": "Please check the information you entered.",
  "v.format_invalid": "That format is not valid.",
  "v.field_error": "{field} — {message}",

  "v.field.stage_name": "Stage name",
  "v.field.korean_name": "Korean name",
  "v.field.location": "Based in",
  "v.field.gender": "Gender",
  "v.field.bio": "Bio",
  "v.field.specialties": "Specialties",
  "v.field.genres": "Genres",
  "v.field.social_instagram_handle": "Instagram username",
  "v.field.social_youtube_handle": "YouTube username",
  "v.field.social_tiktok_handle": "TikTok username",

  "v.link_required": "Enter a link.",
  "v.link_too_long": "That link is too long.",
  "v.link_http_only": "Enter an http or https link.",

  "v.name_required": "Enter your name.",
  "v.name_max_50": "Use 50 characters or fewer for your name.",
  "v.name_max_100": "Use 100 characters or fewer for your name.",

  "v.birth_year_integer": "Enter your birth year in numbers.",
  "v.birth_year_range": "Please check your birth year.",
  "v.height_integer": "Enter your height as a whole number in cm.",
  "v.height_range": "Please check your height.",
  "v.primary_genre_required": "Enter your main genre.",
  "v.primary_genre_max_100": "Use 100 characters or fewer for your main genre.",
  "v.backup_history_required":
    "Enter your backup dancer history. If you have none, write 'none'.",
  "v.backup_history_max_2000":
    "Use 2,000 characters or fewer for your backup dancer history.",

  "v.email_address_invalid": "Enter a valid email address.",
  "v.password_min_8": "Password must be at least 8 characters.",
  "v.password_max_72": "Password must be 72 characters or fewer.",
  "v.password_required": "Enter your password.",

  "v.title_min_2": "Title must be at least 2 characters",
  "v.title_max_160": "Title must be 160 characters or fewer",
  "v.description_min_5": "Description must be at least 5 characters",
  "v.description_max_4000": "Description must be 4000 characters or fewer",

  "v.slug_min_2": "The slug must be at least 2 characters.",
  "v.slug_max_40": "Use 40 characters or fewer for the slug.",
  "v.slug_pattern": "Only lowercase letters, numbers and hyphens are allowed.",
  "v.handle_max_60": "Use 60 characters or fewer for the username.",
  "v.handle_pattern":
    "Social usernames cannot contain non-Latin characters, spaces or symbols. Use letters, numbers, dot (.), underscore (_) and hyphen (-) only. (e.g. dancer_kim)",

  "v.stage_name_required": "Enter your stage name.",
  "v.image_url_not_allowed": "That image URL is not allowed.",
  "v.bio_max_500": "Use 500 characters or fewer for your bio.",
  "v.career_title_required": "Enter a title.",
  "v.date_format": "Use the YYYY-MM-DD format.",
  "v.video_url_unsupported": "That video URL is not supported. (YouTube/Vimeo)",

  "v.project_title_required": "Enter a title.",
  "v.project_description_min": "Enter a description of at least 10 characters.",
  "v.selection_rounds_min": "There must be at least 1 selection round.",
  "v.selection_rounds_max": "There can be at most 3 selection rounds.",

  "v.proposal_target_xor": "Specify exactly one of dancer_id or team_id.",

  "v.team_name_required": "Enter the team name.",
  "v.member_identity_required": "Enter either a platform account or a name.",
};

const ja: Record<Key, string> = {
  "v.invalid_input": "入力内容をご確認ください。",
  "v.required": "必須項目です。",
  "v.too_long": "長すぎます。",
  "v.too_short": "短すぎます。",
  "v.email_invalid": "メールアドレスの形式をご確認ください。",
  "v.url_invalid": "正しいリンクを入力してください。",
  "v.number_invalid": "数字のみ入力してください。",
  "v.password_length": "パスワードは8〜72文字で入力してください。",

  "v.phone_required": "携帯電話番号を入力してください。",
  "v.phone_country": "国と電話番号をもう一度ご確認ください。",
  "v.phone_invalid": "正しい携帯電話番号を入力してください。",

  "v.check_input": "入力内容をもう一度ご確認ください。",
  "v.format_invalid": "形式が正しくありません。",
  "v.field_error": "{field} — {message}",

  "v.field.stage_name": "活動名",
  "v.field.korean_name": "韓国語名",
  "v.field.location": "活動地域",
  "v.field.gender": "性別",
  "v.field.bio": "自己紹介",
  "v.field.specialties": "専門分野",
  "v.field.genres": "ジャンル",
  "v.field.social_instagram_handle": "Instagramのユーザー名",
  "v.field.social_youtube_handle": "YouTubeのユーザー名",
  "v.field.social_tiktok_handle": "TikTokのユーザー名",

  "v.link_required": "リンクを入力してください。",
  "v.link_too_long": "リンクが長すぎます。",
  "v.link_http_only": "http または https のリンクを入力してください。",

  "v.name_required": "お名前を入力してください。",
  "v.name_max_50": "お名前は50文字以内で入力してください。",
  "v.name_max_100": "お名前は100文字以内で入力してください。",

  "v.birth_year_integer": "生年を数字で入力してください。",
  "v.birth_year_range": "生年をご確認ください。",
  "v.height_integer": "身長はcm単位の整数で入力してください。",
  "v.height_range": "身長をご確認ください。",
  "v.primary_genre_required": "メインジャンルを入力してください。",
  "v.primary_genre_max_100": "メインジャンルは100文字以内で入力してください。",
  "v.backup_history_required":
    "バックダンサーの経歴を入力してください。経歴がない場合は「なし」と記入してください。",
  "v.backup_history_max_2000":
    "バックダンサーの経歴は2,000文字以内で入力してください。",

  "v.email_address_invalid": "正しいメールアドレスを入力してください。",
  "v.password_min_8": "パスワードは8文字以上で入力してください。",
  "v.password_max_72": "パスワードは72文字以内で入力してください。",
  "v.password_required": "パスワードを入力してください。",

  "v.title_min_2": "タイトルは2文字以上です",
  "v.title_max_160": "タイトルは160文字以内です",
  "v.description_min_5": "説明は5文字以上です",
  "v.description_max_4000": "説明は4000文字以内です",

  "v.slug_min_2": "slugは2文字以上で入力してください。",
  "v.slug_max_40": "slugは40文字以内で入力してください。",
  "v.slug_pattern": "英小文字・数字・ハイフンのみ使用できます。",
  "v.handle_max_60": "ユーザー名は60文字以内で入力してください。",
  "v.handle_pattern":
    "SNSのユーザー名に全角文字・空白・記号は使用できません。英数字とドット(.)・アンダースコア(_)・ハイフン(-)のみ使用してください。(例: dancer_kim)",

  "v.stage_name_required": "活動名を入力してください。",
  "v.image_url_not_allowed": "許可されていない画像URLです。",
  "v.bio_max_500": "自己紹介は500文字以内で入力してください。",
  "v.career_title_required": "タイトルを入力してください。",
  "v.date_format": "YYYY-MM-DD の形式で入力してください。",
  "v.video_url_unsupported": "対応していない動画URLです。(YouTube/Vimeo)",

  "v.project_title_required": "タイトルを入力してください。",
  "v.project_description_min": "説明は10文字以上で入力してください。",
  "v.selection_rounds_min": "選考ステップは1段階以上にしてください。",
  "v.selection_rounds_max": "選考ステップは最大3段階です。",

  "v.proposal_target_xor":
    "dancer_id または team_id のいずれか一方のみを指定してください。",

  "v.team_name_required": "チーム名を入力してください。",
  "v.member_identity_required":
    "プラットフォームのアカウントまたは名前のいずれかが必要です。",
};

const messages = { ko, en, ja } satisfies Messages<Key>;
export default messages;
