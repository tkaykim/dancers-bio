// 의상 사이즈 옵션 (상의 숫자+영문 병기 / 하의 허리 인치·기장 cm).
// "use server" 액션 파일에서 export 불가(async만 허용) → 순수 모듈로 분리.
export const TOP_SIZES = [
  "85(XS)",
  "90(S)",
  "95(M)",
  "100(L)",
  "105(XL)",
  "110(XXL)",
  "115(3XL)",
  "120(4XL)",
];
export const WAIST_INCHES = [
  "26",
  "27",
  "28",
  "29",
  "30",
  "31",
  "32",
  "33",
  "34",
  "35",
  "36",
  "37",
  "38",
  "39",
  "40",
];
export const LENGTH_CMS = [
  "85",
  "90",
  "95",
  "100",
  "105",
  "110",
  "115",
  "120",
  "125",
];

// 직접입력(콤보) 허용 범위. 드롭다운 추천값을 벗어나는 숫자도 이 범위면 허용.
export const WAIST_MIN = 20;
export const WAIST_MAX = 60;
export const LENGTH_MIN = 60;
export const LENGTH_MAX = 160;
