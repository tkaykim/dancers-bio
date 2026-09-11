import type { Messages } from "../t";

/**
 * 피드(`/feed`)·공고 목록·공고 카드 문구 (docs/design-i18n-ui.md §3.4 "feed").
 * 공고 상세·지원 폼은 `project` 네임스페이스다.
 * 분류값(장르·지역)은 taxonomyLabel(), enum 라벨은 labelFor() 로 읽는다(§3.6).
 */
const ko = {
  // 메타데이터 — 제목·설명은 meta 네임스페이스(feed.title·feed.description).
  "meta.keywords":
    "댄서 섭외 공고,댄서 캐스팅 공고,백댄서 섭외,안무가 섭외,댄스팀 섭외,댄서 구인,디츠,deetz",

  "header.count_one": "{count} 모집 중",
  "header.count_other": "{count} 모집 중",
  "header.create": "+ 개설",
  "header.login": "로그인",
  "header.signup": "가입",
  "header.empty": "아직 공개된 프로젝트가 없습니다.",

  "list.search_placeholder": "제목·주최자·지역 검색",
  "list.filter": "필터",
  "list.reset": "초기화",
  "list.group_category": "종류",
  "list.group_genre": "장르",
  "list.region_all": "지역 전체",
  "list.sort_deadline": "마감 임박순",
  "list.sort_latest": "최신순",
  "list.sort_pay": "페이 높은순",
  "list.count": "{count}건",
  "list.count_filtered": "{shown} / {total}건",
  "list.scope_group": "마감 공고 표시",
  "list.scope_open": "모집 중",
  "list.scope_closed": "마감 포함 {count}",
  "list.col_project": "공고",
  "list.col_pay": "페이",
  "list.col_deadline": "마감",
  "list.empty": "조건에 맞는 공고가 없습니다.",

  "row.private": "비공개",
  "row.private_title": "비공개 공고",
  "row.private_hint": "링크를 받은 사람만 열람 가능",
  "row.standing": "상시 모집",
  "row.closed": "마감",
  "row.sessions_one": "{count}회",
  "row.sessions_other": "{count}회",
  "row.deadline_closed": "마감",
  "row.deadline_standing": "상시",
  "row.deadline_none": "상시",

  "pay.none": "별도 페이 없음",
  "pay.negotiable": "협의",
  "pay.compact_large": "{value}천만",
  "pay.compact_small": "{value}만",
  "pay.short": "₩{amount}",
  "pay.short_per_session": "₩{amount}/회",

  "card.standing": "상시 모집",
  "card.deadline_today": "오늘 마감",
  "card.sessions_one": "{count}개 일정",
  "card.sessions_other": "{count}개 일정",
  "card.no_schedule": "일정 미정",
  "card.pay": "₩ {amount}",
  "card.pay_per_session": "₩ {amount} · 회차당",
  "card.featured": "↳ Featured · 모집 중",
  "card.featured_today": "TODAY",
  "card.featured_closed": "마감",
  "card.detail": "자세히 →",
} as const;

type Key = keyof typeof ko;

const en: Record<Key, string> = {
  "meta.keywords":
    "dancer casting call,dance casting Korea,backup dancer casting,choreographer booking,dance team booking,dancer audition,deetz",

  "header.count_one": "{count} open call",
  "header.count_other": "{count} open calls",
  "header.create": "+ New",
  "header.login": "Log in",
  "header.signup": "Sign up",
  "header.empty": "There are no public casting calls yet.",

  "list.search_placeholder": "Search title, client or region",
  "list.filter": "Filters",
  "list.reset": "Reset",
  "list.group_category": "Type",
  "list.group_genre": "Genre",
  "list.region_all": "All regions",
  "list.sort_deadline": "Closing soonest",
  "list.sort_latest": "Newest",
  "list.sort_pay": "Highest pay",
  "list.count": "{count} calls",
  "list.count_filtered": "{shown} of {total}",
  "list.scope_group": "Show closed calls",
  "list.scope_open": "Open",
  "list.scope_closed": "Incl. closed {count}",
  "list.col_project": "Call",
  "list.col_pay": "Pay",
  "list.col_deadline": "Closes",
  "list.empty": "No casting calls match these filters.",

  "row.private": "Private",
  "row.private_title": "Private casting call",
  "row.private_hint": "Only people with the link can open this",
  "row.standing": "Always open",
  "row.closed": "Closed",
  "row.sessions_one": "{count} session",
  "row.sessions_other": "{count} sessions",
  "row.deadline_closed": "Closed",
  "row.deadline_standing": "Open",
  "row.deadline_none": "Open",

  "pay.none": "No separate pay",
  "pay.negotiable": "Negotiable",
  "pay.compact_large": "{value}M",
  "pay.compact_small": "{value}K",
  "pay.short": "₩{amount}",
  "pay.short_per_session": "₩{amount}/session",

  "card.standing": "Always open",
  "card.deadline_today": "Closes today",
  "card.sessions_one": "{count} session",
  "card.sessions_other": "{count} sessions",
  "card.no_schedule": "Schedule TBD",
  "card.pay": "₩ {amount}",
  "card.pay_per_session": "₩ {amount} · per session",
  "card.featured": "↳ Featured · Open",
  "card.featured_today": "TODAY",
  "card.featured_closed": "Closed",
  "card.detail": "Details →",
};

const ja: Record<Key, string> = {
  "meta.keywords":
    "ダンサー募集,ダンサーキャスティング,バックダンサー募集,振付師 依頼,ダンスチーム 依頼,ダンサー オーディション,deetz",

  "header.count_one": "{count}件 募集中",
  "header.count_other": "{count}件 募集中",
  "header.create": "+ 新規作成",
  "header.login": "ログイン",
  "header.signup": "登録",
  "header.empty": "公開中の募集はまだありません。",

  "list.search_placeholder": "タイトル・主催・地域で検索",
  "list.filter": "絞り込み",
  "list.reset": "リセット",
  "list.group_category": "種類",
  "list.group_genre": "ジャンル",
  "list.region_all": "地域すべて",
  "list.sort_deadline": "締切が近い順",
  "list.sort_latest": "新着順",
  "list.sort_pay": "出演料が高い順",
  "list.count": "{count}件",
  "list.count_filtered": "{shown} / {total}件",
  "list.scope_group": "締切済みの表示",
  "list.scope_open": "募集中",
  "list.scope_closed": "締切含む {count}",
  "list.col_project": "募集",
  "list.col_pay": "出演料",
  "list.col_deadline": "締切",
  "list.empty": "条件に合う募集はありません。",

  "row.private": "非公開",
  "row.private_title": "非公開の募集",
  "row.private_hint": "リンクを受け取った方のみ閲覧できます",
  "row.standing": "常時募集",
  "row.closed": "締切",
  "row.sessions_one": "{count}回",
  "row.sessions_other": "{count}回",
  "row.deadline_closed": "締切",
  "row.deadline_standing": "常時",
  "row.deadline_none": "常時",

  "pay.none": "出演料なし",
  "pay.negotiable": "応相談",
  "pay.compact_large": "{value}千万",
  "pay.compact_small": "{value}万",
  "pay.short": "₩{amount}",
  "pay.short_per_session": "₩{amount}/回",

  "card.standing": "常時募集",
  "card.deadline_today": "本日締切",
  "card.sessions_one": "{count}件の日程",
  "card.sessions_other": "{count}件の日程",
  "card.no_schedule": "日程未定",
  "card.pay": "₩ {amount}",
  "card.pay_per_session": "₩ {amount} · 1回あたり",
  "card.featured": "↳ Featured · 募集中",
  "card.featured_today": "TODAY",
  "card.featured_closed": "締切",
  "card.detail": "詳細 →",
};

const messages = { ko, en, ja } satisfies Messages<Key>;
export default messages;
