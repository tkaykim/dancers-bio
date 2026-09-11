import type { Messages } from "../t";

/**
 * 공개 프로필 문구 — 댄서 `/d/[slug]` · 팀 `/t/[slug]` · 계정 `/u/[id]`
 * 과 프로필·공유 컴포넌트 (docs/design-i18n-ui.md §3.4 "profile").
 * 이용자가 쓴 글(활동명·소개·경력 제목)은 번역하지 않고 `data-ugc` 로 표시한다.
 */
const ko = {
  // 댄서 메타데이터 — 제목의 이름은 이용자 작성 원문이다.
  "meta.dancer_title": "{name} | 댄서 포트폴리오 · dancers.bio",
  "meta.dancer_og_title": "{name} | 댄서 포트폴리오",
  "meta.dancer_description_tags": "{name} 댄서 프로필. {tags} 경력과 영상 포트폴리오를 확인하세요.",
  "meta.dancer_description": "{name} 댄서 프로필과 영상 포트폴리오를 확인하세요.",
  "meta.dancer_career_count": "{base} 공개 경력 {count}건.",
  "meta.kw_dancer": "{name} 댄서",
  "meta.kw_portfolio": "{name} 포트폴리오",
  "meta.kw_choreographer": "{name} 안무가",

  "meta.team_title": "{name} | 댄스팀 섭외 · deetz",
  "meta.team_og_title": "{name} | 댄스팀 섭외",
  "meta.team_description_tags":
    "{name} 댄스팀 프로필. {tags} 기반의 댄스팀 섭외와 공연 포트폴리오를 확인하세요.",
  "meta.team_description": "{name} 댄스팀 프로필과 공연 포트폴리오를 확인하세요.",
  "meta.kw_team": "{name} 댄스팀",
  "meta.kw_team_booking": "{name} 댄스팀 섭외",
  "meta.kw_team_show": "{name} 공연 섭외",
  "meta.team_keywords": "댄스팀 섭외,댄스 공연 섭외",

  "hero.back": "뒤로",
  "hero.home": "deetz 홈",
  "hero.edit": "프로필 수정",
  "hero.verified": "인증 프로필",
  "hero.verified_team": "승인된 팀",
  "hero.share_dancer": "{name} | 댄서 프로필",
  "hero.share_team": "{name} | 댄스팀",
  "hero.stat_members": "멤버",
  "hero.stat_credits": "크레딧",
  "hero.stat_years": "활동 연차",

  "section.selected_work": "대표 작업",
  "section.selected_work_desc_dancer": "이 아티스트를 가장 빠르게 이해할 수 있는 주요 크레딧입니다.",
  "section.selected_work_desc_team": "이 팀을 가장 빠르게 이해할 수 있는 주요 크레딧입니다.",
  "section.representative_careers": "대표 경력",
  "section.gallery": "갤러리",
  "section.gallery_desc_dancer": "무대와 작업의 분위기를 보여주는 대표 이미지입니다.",
  "section.gallery_desc_team": "팀의 무대와 작업 분위기를 보여주는 대표 이미지입니다.",
  "section.videos": "영상",
  "section.credits": "전체 크레딧",
  "section.credits_desc_dancer": "분야별 경력을 연도순으로 정리했습니다.",
  "section.credits_desc_team": "분야별 참여 이력을 한눈에 확인할 수 있습니다.",
  "section.members": "멤버",

  "credits.empty_with_highlights": "대표 경력 외 추가된 경력이 없습니다.",
  "credits.empty": "아직 공개된 경력이 없습니다.",

  "career_category.choreo": "안무",
  "career_category.performance": "공연",
  "career_category.broadcast": "방송",
  "career_category.judge": "심사",
  "career_category.award": "수상",
  "career_category.workshop": "워크샵",
  "career_category.education": "교육",
  "career_category.battle": "배틀",
  "career_category.other": "기타",

  "file.fallback_name": "포트폴리오 파일",

  "member.unnamed": "(이름 없음)",
  "member.profile_link": "{name} 프로필",

  "claim.proposal_count_one": "이 프로필로 캐스팅 제안 {count}건이 도착했어요",
  "claim.proposal_count_other": "이 프로필로 캐스팅 제안 {count}건이 도착했어요",
  "claim.proposal_body":
    "본인 또는 매니저라면 권한을 신청하고 제안에 응답할 수 있어요. 아래에서 신청하세요.",

  "owner.edit_title": "내 프로필 수정하기",
  "owner.edit_desc": "사진·소개·경력·영상을 수정하면 이 페이지에 바로 반영돼요",

  "user.avatar_alt": "프로필 사진",
  "user.verified": "인증된 계정",

  "card.edit_title": "프로필 수정",
  "card.cancel": "취소",
  "card.bio_empty": "소개를 추가해 보세요.",

  "edit.name": "이름",
  "edit.bio": "소개",
  "edit.bio_placeholder": "자신을 소개해 주세요",
  "edit.avatar": "프로필 사진 (선택)",
  "edit.avatar_hint": "10MB 이하 JPG/PNG/WEBP/GIF",
  "edit.saved": "저장됐습니다.",
  "edit.uploading": "업로드 중...",
  "edit.saving": "저장 중...",
  "edit.submit": "저장하기",

  "gallery.video": "영상",
  "media.video": "영상",
  "media.external": "외부 미디어",
  "media.alt_photo": "{name} 사진 {index}",
  "media.alt_reel": "{name} 릴 {index}",
  "media.open_external": "{name} 외부 미디어 {index} 새 창에서 열기",
  "media.unavailable": "{name} 미디어 {index}을 열 수 없음",
  "media.open_photo": "{name} 사진 {index} 크게 보기",
  "media.open_video": "{name} 영상 {index} 크게 보기",
  "media.dialog_title": "{name} 포트폴리오 미디어",

  "share.label": "공유",
  "share.aria": "{label} 공유",
  "share.copied": "복사됨",
  "share.copied_toast": "링크를 복사했어요. 카카오·인스타에 붙여넣어 공유해보세요.",
  "share.copy_failed": "복사하지 못했습니다",
  "share.card_title": "📣 내 프로필 공유하기",
  "share.card_line1": "카카오톡·인스타그램에 프로필 링크를 공유해보세요.",
  "share.card_line2": "많이 보일수록 매칭·캐스팅 기회가 늘어납니다.",
  "share.card_copy": "프로필 링크 복사",
  "share.card_copied_toast": "링크를 복사했어요",
  "share.card_button": "공유하기",
} as const;

type Key = keyof typeof ko;

const en: Record<Key, string> = {
  "meta.dancer_title": "{name} | Dancer portfolio · dancers.bio",
  "meta.dancer_og_title": "{name} | Dancer portfolio",
  "meta.dancer_description_tags":
    "Dancer profile of {name}. See {tags} credits and video portfolio.",
  "meta.dancer_description": "See the dancer profile and video portfolio of {name}.",
  "meta.dancer_career_count": "{base} {count} public credits.",
  "meta.kw_dancer": "{name} dancer",
  "meta.kw_portfolio": "{name} portfolio",
  "meta.kw_choreographer": "{name} choreographer",

  "meta.team_title": "{name} | Dance team booking · deetz",
  "meta.team_og_title": "{name} | Dance team booking",
  "meta.team_description_tags":
    "Dance team profile of {name}. See {tags} performance portfolio and booking details.",
  "meta.team_description": "See the dance team profile and performance portfolio of {name}.",
  "meta.kw_team": "{name} dance team",
  "meta.kw_team_booking": "{name} dance team booking",
  "meta.kw_team_show": "{name} performance booking",
  "meta.team_keywords": "dance team booking,dance performance booking",

  "hero.back": "Back",
  "hero.home": "deetz home",
  "hero.edit": "Edit profile",
  "hero.verified": "Verified profile",
  "hero.verified_team": "Approved team",
  "hero.share_dancer": "{name} | Dancer profile",
  "hero.share_team": "{name} | Dance team",
  "hero.stat_members": "Members",
  "hero.stat_credits": "Credits",
  "hero.stat_years": "Years active",

  "section.selected_work": "Selected work",
  "section.selected_work_desc_dancer":
    "The credits that show what this artist does, at a glance.",
  "section.selected_work_desc_team": "The credits that show what this team does, at a glance.",
  "section.representative_careers": "Featured credits",
  "section.gallery": "Gallery",
  "section.gallery_desc_dancer": "Images that capture the stages and the work.",
  "section.gallery_desc_team": "Images that capture the team's stages and work.",
  "section.videos": "Videos",
  "section.credits": "Full credits",
  "section.credits_desc_dancer": "Credits by field, in order of year.",
  "section.credits_desc_team": "Every credit by field, in one place.",
  "section.members": "Members",

  "credits.empty_with_highlights": "There are no credits beyond the featured ones.",
  "credits.empty": "No credits have been published yet.",

  "career_category.choreo": "Choreography",
  "career_category.performance": "Performance",
  "career_category.broadcast": "Broadcast",
  "career_category.judge": "Judging",
  "career_category.award": "Awards",
  "career_category.workshop": "Workshop",
  "career_category.education": "Teaching",
  "career_category.battle": "Battle",
  "career_category.other": "Other",

  "file.fallback_name": "Portfolio file",

  "member.unnamed": "(No name)",
  "member.profile_link": "{name} profile",

  "claim.proposal_count_one": "{count} casting offer has arrived for this profile",
  "claim.proposal_count_other": "{count} casting offers have arrived for this profile",
  "claim.proposal_body":
    "If this is you or you manage this dancer, claim the profile to respond to the offers. Request access below.",

  "owner.edit_title": "Edit my profile",
  "owner.edit_desc": "Photos, bio, credits and videos show up here as soon as you save them",

  "user.avatar_alt": "Profile photo",
  "user.verified": "Verified account",

  "card.edit_title": "Edit profile",
  "card.cancel": "Cancel",
  "card.bio_empty": "Add a short bio.",

  "edit.name": "Name",
  "edit.bio": "Bio",
  "edit.bio_placeholder": "Tell people about yourself",
  "edit.avatar": "Profile photo (optional)",
  "edit.avatar_hint": "JPG/PNG/WEBP/GIF up to 10MB",
  "edit.saved": "Saved.",
  "edit.uploading": "Uploading...",
  "edit.saving": "Saving...",
  "edit.submit": "Save",

  "gallery.video": "Video",
  "media.video": "Video",
  "media.external": "External media",
  "media.alt_photo": "{name} photo {index}",
  "media.alt_reel": "{name} reel {index}",
  "media.open_external": "Open {name} external media {index} in a new tab",
  "media.unavailable": "{name} media {index} cannot be opened",
  "media.open_photo": "View {name} photo {index} larger",
  "media.open_video": "View {name} video {index} larger",
  "media.dialog_title": "{name} portfolio media",

  "share.label": "Share",
  "share.aria": "Share {label}",
  "share.copied": "Copied",
  "share.copied_toast": "Link copied. Paste it into a message to share.",
  "share.copy_failed": "We could not copy that",
  "share.card_title": "📣 Share my profile",
  "share.card_line1": "Share your profile link on messengers and Instagram.",
  "share.card_line2": "The more it is seen, the more matches and castings you get.",
  "share.card_copy": "Copy profile link",
  "share.card_copied_toast": "Link copied",
  "share.card_button": "Share",
};

const ja: Record<Key, string> = {
  "meta.dancer_title": "{name} | ダンサーポートフォリオ · dancers.bio",
  "meta.dancer_og_title": "{name} | ダンサーポートフォリオ",
  "meta.dancer_description_tags":
    "{name}のダンサープロフィール。{tags}の経歴と映像ポートフォリオをご覧ください。",
  "meta.dancer_description": "{name}のダンサープロフィールと映像ポートフォリオをご覧ください。",
  "meta.dancer_career_count": "{base} 公開経歴{count}件。",
  "meta.kw_dancer": "{name} ダンサー",
  "meta.kw_portfolio": "{name} ポートフォリオ",
  "meta.kw_choreographer": "{name} 振付師",

  "meta.team_title": "{name} | ダンスチーム手配 · deetz",
  "meta.team_og_title": "{name} | ダンスチーム手配",
  "meta.team_description_tags":
    "{name}のダンスチームプロフィール。{tags}を軸としたダンスチームの手配と公演ポートフォリオをご覧ください。",
  "meta.team_description": "{name}のダンスチームプロフィールと公演ポートフォリオをご覧ください。",
  "meta.kw_team": "{name} ダンスチーム",
  "meta.kw_team_booking": "{name} ダンスチーム 手配",
  "meta.kw_team_show": "{name} 公演 手配",
  "meta.team_keywords": "ダンスチーム 手配,ダンス公演 手配",

  "hero.back": "戻る",
  "hero.home": "deetz ホーム",
  "hero.edit": "プロフィール編集",
  "hero.verified": "認証済みプロフィール",
  "hero.verified_team": "承認済みチーム",
  "hero.share_dancer": "{name} | ダンサープロフィール",
  "hero.share_team": "{name} | ダンスチーム",
  "hero.stat_members": "メンバー",
  "hero.stat_credits": "クレジット",
  "hero.stat_years": "活動年数",

  "section.selected_work": "代表作",
  "section.selected_work_desc_dancer":
    "このアーティストをいちばん早く理解できる主要クレジットです。",
  "section.selected_work_desc_team": "このチームをいちばん早く理解できる主要クレジットです。",
  "section.representative_careers": "代表経歴",
  "section.gallery": "ギャラリー",
  "section.gallery_desc_dancer": "ステージと作品の雰囲気が伝わる代表的な写真です。",
  "section.gallery_desc_team": "チームのステージと作品の雰囲気が伝わる代表的な写真です。",
  "section.videos": "映像",
  "section.credits": "全クレジット",
  "section.credits_desc_dancer": "分野別の経歴を年度順にまとめました。",
  "section.credits_desc_team": "分野別の参加履歴をひと目で確認できます。",
  "section.members": "メンバー",

  "credits.empty_with_highlights": "代表経歴のほかに登録された経歴はありません。",
  "credits.empty": "公開されている経歴はまだありません。",

  "career_category.choreo": "振付",
  "career_category.performance": "公演",
  "career_category.broadcast": "放送",
  "career_category.judge": "審査",
  "career_category.award": "受賞",
  "career_category.workshop": "ワークショップ",
  "career_category.education": "教育",
  "career_category.battle": "バトル",
  "career_category.other": "その他",

  "file.fallback_name": "ポートフォリオファイル",

  "member.unnamed": "（名前なし）",
  "member.profile_link": "{name} のプロフィール",

  "claim.proposal_count_one": "このプロフィール宛にキャスティングオファーが{count}件届いています",
  "claim.proposal_count_other": "このプロフィール宛にキャスティングオファーが{count}件届いています",
  "claim.proposal_body":
    "ご本人またはマネージャーの方は、権限を申請してオファーに返信できます。下のボタンから申請してください。",

  "owner.edit_title": "プロフィールを編集する",
  "owner.edit_desc": "写真・紹介・経歴・映像を編集すると、このページにすぐ反映されます",

  "user.avatar_alt": "プロフィール写真",
  "user.verified": "認証済みアカウント",

  "card.edit_title": "プロフィール編集",
  "card.cancel": "キャンセル",
  "card.bio_empty": "紹介を追加してみましょう。",

  "edit.name": "名前",
  "edit.bio": "紹介",
  "edit.bio_placeholder": "ご自身について書いてください",
  "edit.avatar": "プロフィール写真（任意）",
  "edit.avatar_hint": "10MB以下のJPG/PNG/WEBP/GIF",
  "edit.saved": "保存しました。",
  "edit.uploading": "アップロード中...",
  "edit.saving": "保存中...",
  "edit.submit": "保存する",

  "gallery.video": "映像",
  "media.video": "映像",
  "media.external": "外部メディア",
  "media.alt_photo": "{name} 写真 {index}",
  "media.alt_reel": "{name} リール {index}",
  "media.open_external": "{name} の外部メディア {index} を新しいタブで開く",
  "media.unavailable": "{name} のメディア {index} は開けません",
  "media.open_photo": "{name} の写真 {index} を拡大表示",
  "media.open_video": "{name} の映像 {index} を拡大表示",
  "media.dialog_title": "{name} のポートフォリオメディア",

  "share.label": "共有",
  "share.aria": "{label}を共有",
  "share.copied": "コピーしました",
  "share.copied_toast": "リンクをコピーしました。メッセージに貼り付けて共有してください。",
  "share.copy_failed": "コピーできませんでした",
  "share.card_title": "📣 プロフィールを共有する",
  "share.card_line1": "メッセンジャーやInstagramでプロフィールのリンクを共有しましょう。",
  "share.card_line2": "見られるほどマッチングやキャスティングの機会が増えます。",
  "share.card_copy": "プロフィールのリンクをコピー",
  "share.card_copied_toast": "リンクをコピーしました",
  "share.card_button": "共有する",
};

const messages = { ko, en, ja } satisfies Messages<Key>;
export default messages;
