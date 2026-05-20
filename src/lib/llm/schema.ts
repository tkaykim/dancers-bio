import { z } from "zod";

// LLM 이 외부 공고 텍스트에서 추출해서 우리 projects 스키마에 매핑할 JSON.
// 모든 provider 가 동일한 출력을 내도록 강제한다.

export const SESSION_TYPES = [
  "rehearsal",
  "main",
  "filming",
  "fitting",
  "meeting",
  "other",
] as const;

export const PAY_TYPES = ["per_session", "total", "negotiable"] as const;

export const projectIngestionSchema = z.object({
  // 단순 텍스트 필드
  title: z
    .string()
    .min(1)
    .max(120)
    .describe("공고 제목. 원본 그대로가 너무 길거나 모호하면 핵심을 추려서."),
  description: z
    .string()
    .min(10)
    .max(2000)
    .describe(
      "공고 상세 설명. 원본 본문을 가능한 한 보존. 자격조건/연락방식/특이사항 포함.",
    ),
  posted_by_label: z
    .string()
    .max(80)
    .nullable()
    .describe(
      "공고를 올린 주체 표시 텍스트 (회사명/팀명/개인 이름 등). 없으면 null.",
    ),
  region_text: z
    .string()
    .max(100)
    .nullable()
    .describe("지역명 자유 텍스트 (예: '서울 강남구'). 없으면 null."),

  // 페이
  pay_amount: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe("페이 금액 (원). 협의/미공개면 null."),
  pay_type: z
    .enum(PAY_TYPES)
    .nullable()
    .describe(
      "지급 단위. per_session=회차당, total=총액, negotiable=협의/별도 논의.",
    ),

  // 모집 인원
  recruitment_count: z
    .number()
    .int()
    .min(1)
    .max(999)
    .default(1)
    .describe("모집 인원. 명시 없으면 1."),

  // 마감
  application_deadline_iso: z
    .string()
    .datetime()
    .nullable()
    .describe(
      "지원 마감 ISO datetime (UTC). 날짜만 있으면 그날 23:59 KST 로 가정해서 ISO 변환. 명시 없으면 null.",
    ),

  // 일정 (rehearsal/main/filming/fitting/meeting/other)
  sessions: z
    .array(
      z.object({
        session_type: z.enum(SESSION_TYPES).default("main"),
        starts_at_iso: z
          .string()
          .datetime()
          .describe("ISO datetime (KST 기준으로 UTC 변환)."),
        ends_at_iso: z.string().datetime().nullable(),
        location_name: z.string().max(120).nullable(),
        role_notes: z.string().max(500).nullable(),
      }),
    )
    .max(20)
    .default([])
    .describe(
      "공고에 명시된 일정. 날짜·시간이 명확한 것만. 정기 반복(매주)면 비워두고 description 에 보존.",
    ),

  // 부가 정보
  contact: z
    .string()
    .max(200)
    .nullable()
    .describe("연락처 (전화/이메일/카톡 ID 등). 없으면 null."),
  visibility_hint: z
    .enum(["public", "private"])
    .default("public")
    .describe(
      "공개 범위 추정. 일반 공고는 public, '관심자에게만 별도 안내' 류면 private.",
    ),

  // 어색하면 우리 플랫폼과 맞지 않다는 신호
  fit_warning: z
    .string()
    .max(500)
    .nullable()
    .describe(
      "이 공고가 K-pop/스트리트 댄스 1회성 캐스팅이 아닌 경우(예: 정기 강사직, 무관 광고) 어떤 점이 다른지 한 줄 경고. 적합하면 null.",
    ),
});

export type ProjectIngestionData = z.infer<typeof projectIngestionSchema>;

// JSON Schema 표현 — Gemini responseSchema / Anthropic tool input_schema 에 그대로 쓸 수 있는 단순 구조.
// zod-to-json-schema 의존 회피용 수동 작성.
export const projectIngestionJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string", maxLength: 120 },
    description: { type: "string", maxLength: 2000 },
    posted_by_label: { type: ["string", "null"], maxLength: 80 },
    region_text: { type: ["string", "null"], maxLength: 100 },
    pay_amount: { type: ["integer", "null"], minimum: 0 },
    pay_type: {
      type: ["string", "null"],
      enum: [...PAY_TYPES, null],
    },
    recruitment_count: { type: "integer", minimum: 1, maximum: 999 },
    application_deadline_iso: { type: ["string", "null"] },
    sessions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          session_type: { type: "string", enum: SESSION_TYPES as unknown as string[] },
          starts_at_iso: { type: "string" },
          ends_at_iso: { type: ["string", "null"] },
          location_name: { type: ["string", "null"], maxLength: 120 },
          role_notes: { type: ["string", "null"], maxLength: 500 },
        },
        required: ["session_type", "starts_at_iso"],
      },
    },
    contact: { type: ["string", "null"], maxLength: 200 },
    visibility_hint: { type: "string", enum: ["public", "private"] },
    fit_warning: { type: ["string", "null"], maxLength: 500 },
  },
  required: [
    "title",
    "description",
    "recruitment_count",
    "sessions",
    "visibility_hint",
  ],
} as const;
