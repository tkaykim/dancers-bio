import type { Messages } from "../t";

/**
 * enum 라벨 (docs/design-i18n-ui.md §3.6).
 * ko 값은 lib/validation/projects.ts 의 상수와 같아야 한다(관리자 화면은 그 상수를 계속 쓴다).
 * 읽기는 src/lib/i18n/labels.ts 의 labelFor() 로 한다.
 */
const ko = {
  "visibility.public": "공개",
  "visibility.private": "비공개",

  "status.draft": "임시저장",
  "status.open": "모집 중",
  "status.closed": "마감",
  "status.cancelled": "취소",
  "status.completed": "완료",

  "session_type.rehearsal": "연습",
  "session_type.main": "본 무대",
  "session_type.filming": "촬영",
  "session_type.fitting": "피팅",
  "session_type.meeting": "회의",
  "session_type.other": "기타",

  "pay_type.per_session": "회차당",
  "pay_type.total": "총액",
  "pay_type.negotiable": "협의",

  "category.performance": "공연",
  "category.choreography": "안무제작",
  "category.instructor": "강사",
  "category.broadcast": "방송",
  "category.advertisement": "광고",
  "category.event": "행사",
  "category.video": "영상촬영",
  "category.other": "기타",

  "application_status.pending": "대기",
  "application_status.accepted": "합격",
  "application_status.rejected": "거절됨",
  "application_status.withdrawn": "취소됨",
  "application_status.declined": "본인 포기",
  "application_status.expired": "만료",
  "application_status.cancelled_by_applicant": "취소됨",
  "application_status.cancelled_by_owner": "취소됨",

  "stage.pending": "검토 중",
  "stage.in_progress": "진행 중",
  "stage.final": "최종 합격",
  "stage.rejected": "불합격",
  "stage.withdrawn": "지원 취소",
  "stage.declined": "본인 포기",
  "stage.round": "{round}차 합격",

  "source.apply": "직접 지원",
  "source.direct_proposal": "캐스팅 제안",

  "standing_pool": "상시 모집",
} as const;

type Key = keyof typeof ko;

const en: Record<Key, string> = {
  "visibility.public": "Public",
  "visibility.private": "Private",

  "status.draft": "Draft",
  "status.open": "Open",
  "status.closed": "Closed",
  "status.cancelled": "Cancelled",
  "status.completed": "Completed",

  "session_type.rehearsal": "Rehearsal",
  "session_type.main": "Main stage",
  "session_type.filming": "Shoot",
  "session_type.fitting": "Fitting",
  "session_type.meeting": "Meeting",
  "session_type.other": "Other",

  "pay_type.per_session": "Per session",
  "pay_type.total": "Total",
  "pay_type.negotiable": "Negotiable",

  "category.performance": "Performance",
  "category.choreography": "Choreography",
  "category.instructor": "Instructor",
  "category.broadcast": "Broadcast",
  "category.advertisement": "Advertising",
  "category.event": "Event",
  "category.video": "Video shoot",
  "category.other": "Other",

  "application_status.pending": "Pending",
  "application_status.accepted": "Selected",
  "application_status.rejected": "Not selected",
  "application_status.withdrawn": "Withdrawn",
  "application_status.declined": "Declined",
  "application_status.expired": "Expired",
  "application_status.cancelled_by_applicant": "Withdrawn",
  "application_status.cancelled_by_owner": "Cancelled",

  "stage.pending": "Under review",
  "stage.in_progress": "In progress",
  "stage.final": "Final selection",
  "stage.rejected": "Not selected",
  "stage.withdrawn": "Withdrawn",
  "stage.declined": "Declined",
  "stage.round": "Round {round} pass",

  "source.apply": "Applied",
  "source.direct_proposal": "Casting offer",

  "standing_pool": "Always open",
};

const ja: Record<Key, string> = {
  "visibility.public": "公開",
  "visibility.private": "非公開",

  "status.draft": "下書き",
  "status.open": "募集中",
  "status.closed": "締切",
  "status.cancelled": "取消",
  "status.completed": "完了",

  "session_type.rehearsal": "リハーサル",
  "session_type.main": "本番",
  "session_type.filming": "撮影",
  "session_type.fitting": "フィッティング",
  "session_type.meeting": "ミーティング",
  "session_type.other": "その他",

  "pay_type.per_session": "1回あたり",
  "pay_type.total": "総額",
  "pay_type.negotiable": "応相談",

  "category.performance": "公演",
  "category.choreography": "振付制作",
  "category.instructor": "インストラクター",
  "category.broadcast": "放送",
  "category.advertisement": "広告",
  "category.event": "イベント",
  "category.video": "映像撮影",
  "category.other": "その他",

  "application_status.pending": "審査中",
  "application_status.accepted": "合格",
  "application_status.rejected": "不合格",
  "application_status.withdrawn": "取消",
  "application_status.declined": "辞退",
  "application_status.expired": "期限切れ",
  "application_status.cancelled_by_applicant": "取消",
  "application_status.cancelled_by_owner": "取消",

  "stage.pending": "審査中",
  "stage.in_progress": "進行中",
  "stage.final": "最終合格",
  "stage.rejected": "不合格",
  "stage.withdrawn": "応募取消",
  "stage.declined": "辞退",
  "stage.round": "{round}次合格",

  "source.apply": "直接応募",
  "source.direct_proposal": "キャスティングオファー",

  "standing_pool": "常時募集",
};

const messages = { ko, en, ja } satisfies Messages<Key>;
export default messages;
