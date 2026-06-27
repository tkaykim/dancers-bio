// 한국 체류자격(비자) 목록. 외국인 댄서가 회원가입/프로필에서 선택.
// 공연·예술 실무에서 자주 나오는 항목을 상단 그룹에 배치하고, 전체를 검색+드롭다운으로 제공.
// 목록에 없으면 OTHER(기타) → 자유입력.

export type VisaOption = {
  /** 체류자격 코드 (예: "E-6-1"). 자유입력은 "OTHER" */
  code: string;
  /** 한글 명칭 */
  ko: string;
  /** 영문/부가 설명 (검색 보조) */
  en?: string;
  /** 그룹 라벨 */
  group: string;
};

export const KOREA_VISAS: VisaOption[] = [
  // ── 공연·예술 (댄서 핵심) ──
  { code: "E-6-1", ko: "E-6-1 예술흥행 (예술·연예)", en: "Art/Entertainment", group: "공연·예술" },
  { code: "E-6-2", ko: "E-6-2 예술흥행 (호텔·유흥)", en: "Hotel/Entertainment", group: "공연·예술" },
  { code: "E-6-3", ko: "E-6-3 예술흥행 (운동)", en: "Sports", group: "공연·예술" },
  { code: "C-4", ko: "C-4 단기취업", en: "Short-term Employment", group: "공연·예술" },
  { code: "C-3", ko: "C-3 단기방문", en: "Short-term Visit", group: "공연·예술" },

  // ── 거주·동포·가족 (취업 제한 적음) ──
  { code: "F-2", ko: "F-2 거주", en: "Residence", group: "거주·동포·가족" },
  { code: "F-4", ko: "F-4 재외동포", en: "Overseas Korean", group: "거주·동포·가족" },
  { code: "F-5", ko: "F-5 영주", en: "Permanent Residence", group: "거주·동포·가족" },
  { code: "F-6", ko: "F-6 결혼이민", en: "Marriage Migrant", group: "거주·동포·가족" },
  { code: "F-1", ko: "F-1 방문동거", en: "Visiting/Cohabitation", group: "거주·동포·가족" },
  { code: "F-3", ko: "F-3 동반", en: "Dependent Family", group: "거주·동포·가족" },

  // ── 학업·연수 ──
  { code: "D-2", ko: "D-2 유학", en: "Student", group: "학업·연수" },
  { code: "D-4", ko: "D-4 일반연수", en: "General Training", group: "학업·연수" },
  { code: "D-1", ko: "D-1 문화예술", en: "Culture/Art", group: "학업·연수" },
  { code: "D-10", ko: "D-10 구직", en: "Job Seeking", group: "학업·연수" },

  // ── 취업·기타 활동 ──
  { code: "E-7", ko: "E-7 특정활동", en: "Special Occupation", group: "취업·기타 활동" },
  { code: "E-1", ko: "E-1 교수", en: "Professor", group: "취업·기타 활동" },
  { code: "E-2", ko: "E-2 회화지도", en: "Foreign Language Instructor", group: "취업·기타 활동" },
  { code: "E-3", ko: "E-3 연구", en: "Research", group: "취업·기타 활동" },
  { code: "E-9", ko: "E-9 비전문취업", en: "Non-professional Employment", group: "취업·기타 활동" },
  { code: "H-1", ko: "H-1 관광취업 (워킹홀리데이)", en: "Working Holiday", group: "취업·기타 활동" },
  { code: "H-2", ko: "H-2 방문취업", en: "Working Visit", group: "취업·기타 활동" },

  // ── 사업·투자 ──
  { code: "D-8", ko: "D-8 기업투자", en: "Corporate Investment", group: "사업·투자" },
  { code: "D-9", ko: "D-9 무역경영", en: "Trade Management", group: "사업·투자" },

  // ── 기타 단기 ──
  { code: "B-1", ko: "B-1 사증면제", en: "Visa Waiver", group: "기타 단기" },
  { code: "B-2", ko: "B-2 관광통과", en: "Tourist/Transit", group: "기타 단기" },
  { code: "C-1", ko: "C-1 일시취재", en: "Temporary News Coverage", group: "기타 단기" },
  { code: "G-1", ko: "G-1 기타", en: "Miscellaneous", group: "기타 단기" },

  // ── 자유입력 ──
  { code: "OTHER", ko: "기타 (직접 입력)", en: "Other (free text)", group: "기타" },
];

const VISA_BY_CODE = new Map(KOREA_VISAS.map((v) => [v.code, v]));

export function visaByCode(code: string | null | undefined): VisaOption | null {
  if (!code) return null;
  return VISA_BY_CODE.get(code) ?? null;
}

export function visaLabel(code: string | null | undefined): string {
  return visaByCode(code)?.ko ?? "";
}
