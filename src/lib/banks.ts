// 한국 은행/금융기관 정규화 목록.
//
// 댄서가 계좌를 등록할 때 자유 입력 대신 이 목록에서 고르게 해(검색+드롭다운)
// 오타·표기흔들림(국민/KB/국민은행 …)을 막고, 관리자 화면·대량이체 파일에서
// 일관된 은행명을 쓰기 위한 단일 정본.
//
// - `code`     : 금융결제원 표준 기관코드(3자리). 추후 펌뱅킹/오픈API(방법 B)용.
// - `name`     : 앱 표시명(드롭다운).
// - `transfer` : 우리WON비즈 '다계좌이체' 업로드 시 '입금은행' 칸에 들어갈 문자열.
//                ⚠️ 아래 6개(우리/신한/하나/농협/지역농협/카카오뱅크)는 실제 업로드
//                양식([GRIGO] 다계좌이체양식.xls)에서 확인된 값. 나머지는 표준 표기
//                기준 best-effort이므로, 첫 업로드 시 은행에서 반려되면 그 값을 정정.
// - `hint`     : 헷갈리기 쉬운 항목 보조 설명(특히 농협 vs 지역농협).
// - `common`   : 상단 '자주 쓰는 은행' 빠른 선택에 노출.

export type Bank = {
  code: string;
  name: string;
  transfer: string;
  aliases?: string[];
  hint?: string;
  common?: boolean;
};

export const BANKS: Bank[] = [
  // 시중은행
  { code: "004", name: "국민은행", transfer: "국민은행", aliases: ["kb", "kookmin", "국민"], common: true },
  { code: "088", name: "신한은행", transfer: "신한은행", aliases: ["shinhan", "신한"], common: true },
  { code: "020", name: "우리은행", transfer: "우리은행", aliases: ["woori", "우리"], common: true },
  { code: "081", name: "하나은행", transfer: "하나은행", aliases: ["hana", "keb", "케이이비", "하나"], common: true },
  { code: "003", name: "기업은행", transfer: "기업은행", aliases: ["ibk", "기업"], common: true },
  { code: "023", name: "SC제일은행", transfer: "SC제일은행", aliases: ["sc", "제일", "standard chartered"] },
  { code: "027", name: "한국씨티은행", transfer: "한국씨티은행", aliases: ["citi", "씨티"] },
  // 인터넷전문은행
  { code: "090", name: "카카오뱅크", transfer: "카카오뱅크", aliases: ["kakao", "카카오", "카뱅"], common: true },
  { code: "092", name: "토스뱅크", transfer: "토스뱅크", aliases: ["toss", "토스", "토뱅"], common: true },
  { code: "089", name: "케이뱅크", transfer: "케이뱅크", aliases: ["kbank", "k뱅크", "케이", "케뱅"] },
  // 농협 — 농협은행(중앙회)과 지역(단위)농협은 별개 기관. 계좌번호·코드가 다름.
  {
    code: "011",
    name: "농협은행",
    transfer: "농협",
    aliases: ["nh", "농협", "농협중앙회", "nonghyup"],
    hint: "농협은행(중앙회) · 계좌 301·302·312…로 시작",
    common: true,
  },
  {
    code: "012",
    name: "지역농협(단위농협)",
    transfer: "지역농협",
    aliases: ["지역농협", "단위농협", "축협", "농축협"],
    hint: "통장에 '○○농협/축협' · 계좌 35x로 시작",
  },
  // 지방은행
  { code: "032", name: "부산은행", transfer: "부산은행", aliases: ["busan", "부산"] },
  { code: "039", name: "경남은행", transfer: "경남은행", aliases: ["경남", "kyongnam"] },
  { code: "031", name: "대구은행(iM뱅크)", transfer: "대구은행", aliases: ["대구", "im", "아이엠", "daegu"] },
  { code: "034", name: "광주은행", transfer: "광주은행", aliases: ["광주", "gwangju"] },
  { code: "037", name: "전북은행", transfer: "전북은행", aliases: ["전북", "jeonbuk"] },
  { code: "035", name: "제주은행", transfer: "제주은행", aliases: ["제주", "jeju"] },
  // 상호금융·기타
  { code: "045", name: "새마을금고", transfer: "새마을금고", aliases: ["새마을", "mg", "saemaul"] },
  { code: "048", name: "신협", transfer: "신협", aliases: ["신협", "credit union", "shinhyup"] },
  { code: "071", name: "우체국", transfer: "우체국", aliases: ["우체국", "우체국예금", "post"] },
  { code: "007", name: "수협은행", transfer: "수협은행", aliases: ["수협", "suhyup"] },
  { code: "064", name: "산림조합", transfer: "산림조합", aliases: ["산림", "산림조합"] },
  { code: "002", name: "산업은행", transfer: "산업은행", aliases: ["kdb", "산업"] },
  { code: "050", name: "저축은행", transfer: "저축은행", aliases: ["저축", "상호저축"] },
];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** 검색어로 은행 목록 필터. 빈 검색어면 전체 반환. */
export function searchBanks(query: string): Bank[] {
  const q = norm(query);
  if (!q) return BANKS;
  return BANKS.filter((b) => {
    const hay = [b.name, b.transfer, b.code, ...(b.aliases ?? [])].map(norm);
    return hay.some((h) => h.includes(q));
  });
}

/** 자주 쓰는 은행(상단 빠른 선택용). */
export const COMMON_BANKS: Bank[] = BANKS.filter((b) => b.common);

/**
 * 저장돼 있던 은행명(자유입력 레거시 포함)을 목록의 한 은행으로 매핑.
 * transfer/name/code/alias 어느 것과 일치해도 찾음. 편집 폼 프리필용.
 */
export function matchBank(stored: string | null | undefined): Bank | null {
  if (!stored) return null;
  const s = norm(stored);
  return (
    BANKS.find((b) =>
      [b.name, b.transfer, b.code, ...(b.aliases ?? [])].map(norm).includes(s),
    ) ?? null
  );
}
