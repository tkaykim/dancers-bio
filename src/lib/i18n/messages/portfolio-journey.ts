import type { Messages } from "../t";
const ko = {
  date: "날짜", "category.choreo": "안무", "category.performance": "공연", "category.broadcast": "방송", "category.award": "수상", "category.judge": "심사", "category.workshop": "워크숍", "category.education": "교육", "category.battle": "배틀", "category.other": "기타",
  title: "내 포트폴리오 완성하기", intro: "갖고 있는 자료로 경력을 정리하고, 사진과 영상을 담아 나만의 링크를 만들어 보세요.",
  import: "1. 경력 자료 가져오기", importHint: "PDF나 텍스트를 가져오면 경력을 자동으로 분류합니다.\n내용을 확인하고 수정한 뒤 저장하세요.",
  manual: "경력 직접 입력·수정", unavailable: "자동 정리 기능을 준비하고 있습니다.\n지금은 경력을 직접 입력할 수 있습니다.",
  profile: "2. 프로필과 사진·영상 채우기", edit: "활동명·소개·대표 사진 수정", media: "사진·영상", mediaHint: "사진 JPG·PNG, 영상 MP4는 파일당 50MB까지 추가할 수 있습니다.\n추가한 자료는 공개 프로필에 표시됩니다.",
  upload: "사진·영상 여러 개 추가", video: "YouTube·Vimeo 영상 주소", add: "영상 추가", remove: "목록에서 빼기", up: "앞으로 이동", down: "뒤로 이동",
  empty: "대표 사진과 활동 영상을 추가해 보세요.", busy: "저장 중…", error: "저장하지 못했습니다.\n연결 상태를 확인한 뒤 다시 시도해 주세요.", invalid: "JPG·PNG·MP4 파일 또는 YouTube·Vimeo 링크를 확인해 주세요.",
  share: "3. 내 링크 공유하기", pending: "프로필 승인이 완료되면 공유 링크가 열립니다.\n그동안 경력과 자료를 자유롭게 수정하세요.", noSlug: "프로필에서 링크 주소를 먼저 설정하세요.",
  preview: "내 dancers.bio 페이지 열기", instagram: "인스타 프로필 편집 → 링크 → 외부 링크 추가에서 복사한 주소를 붙여 넣으세요.", copied: "링크를 복사했습니다.", copyError: "자동 복사가 안 되면 위 주소를 길게 눌러 복사하세요.",
  saved: "저장되었습니다.", limit: "사진과 영상은 최대 50개까지 등록할 수 있습니다.",
};
type Key = keyof typeof ko;
const en: Record<Key, string> = {
  date: "Date", "category.choreo": "Choreography", "category.performance": "Performance", "category.broadcast": "Broadcast", "category.award": "Award", "category.judge": "Judging", "category.workshop": "Workshop", "category.education": "Education", "category.battle": "Battle", "category.other": "Other",
  title: "Build your portfolio", intro: "Turn your existing career records, photos and videos into a link of your own.",
  import: "1. Import career records", importHint: "Upload a PDF or paste text to organize your careers.\nReview and edit the results before saving.", manual: "Add or edit careers", unavailable: "Automatic import is being prepared.\nYou can enter careers manually for now.",
  profile: "2. Add your profile, photos and videos", edit: "Edit name, bio and profile photo", media: "Photos and videos", mediaHint: "Add JPG/PNG photos and MP4 videos, up to 50MB each.\nAdded media appears on your public profile.", upload: "Add photos and videos", video: "YouTube or Vimeo URL", add: "Add video", remove: "Remove from gallery", up: "Move earlier", down: "Move later", empty: "Add your best photos and performance videos.", busy: "Saving…", error: "Could not save.\nCheck your connection and try again.", invalid: "Check the JPG, PNG or MP4 file, or YouTube/Vimeo link.", share: "3. Share your link", pending: "Your share link becomes available after profile approval.\nYou can edit your careers and media in the meantime.", noSlug: "Set your link address in your profile first.", preview: "Open my dancers.bio page", instagram: "In Instagram, go to Edit profile → Links → Add external link and paste your copied address.", copied: "Link copied.", copyError: "If automatic copying fails, press and hold the address above to copy it.", saved: "Saved.", limit: "You can add up to 50 photos and videos.",
};
const ja: Record<Key, string> = {
  date: "日付", "category.choreo": "振付", "category.performance": "公演", "category.broadcast": "放送", "category.award": "受賞", "category.judge": "審査", "category.workshop": "ワークショップ", "category.education": "教育", "category.battle": "バトル", "category.other": "その他",
  title: "ポートフォリオを完成させる", intro: "経歴資料と写真・動画をまとめて、自分だけのリンクを作りましょう。", import: "1. 経歴資料を取り込む", importHint: "PDFやテキストから経歴を自動で整理します。\n内容を確認・修正して保存してください。", manual: "経歴を入力・編集", unavailable: "自動整理機能を準備しています。\n経歴は手動で入力できます。", profile: "2. プロフィールと写真・動画を追加", edit: "活動名・紹介・プロフィール写真を編集", media: "写真・動画", mediaHint: "JPG・PNG写真、MP4動画を1ファイル50MBまで追加できます。\n追加した資料は公開プロフィールに表示されます。", upload: "写真・動画を追加", video: "YouTube・VimeoのURL", add: "動画を追加", remove: "一覧から外す", up: "前に移動", down: "後ろに移動", empty: "代表写真や活動動画を追加しましょう。", busy: "保存中…", error: "保存できませんでした。\n接続を確認して再試行してください。", invalid: "JPG・PNG・MP4ファイル、またはYouTube・Vimeoリンクを確認してください。", share: "3. リンクを共有", pending: "プロフィール承認後に共有リンクが利用できます。\nそれまでも経歴や資料を編集できます。", noSlug: "プロフィールでリンクアドレスを設定してください。", preview: "自分のdancers.bioページを開く", instagram: "Instagramのプロフィールを編集 → リンク → 外部リンクを追加から、コピーしたアドレスを貼り付けてください。", copied: "リンクをコピーしました。", copyError: "コピーできない場合は上のアドレスを長押ししてコピーしてください。", saved: "保存しました。", limit: "写真と動画は最大50件まで登録できます。",
};
export default { ko, en, ja } satisfies Messages<Key>;
