import { z } from "zod";

export const VISIBILITY_LABELS = {
  public: "공개",
  private: "비공개",
} as const;

export const STATUS_LABELS = {
  draft: "임시저장",
  open: "모집 중",
  closed: "마감",
  cancelled: "취소",
  completed: "완료",
} as const;

export const SESSION_TYPE_LABELS = {
  rehearsal: "연습",
  main: "본 무대",
  filming: "촬영",
  fitting: "피팅",
  meeting: "회의",
  other: "기타",
} as const;

export const PAY_TYPE_LABELS = {
  per_session: "회차당",
  total: "총액",
  negotiable: "협의",
} as const;

export const APPLICATION_STATUS_LABELS = {
  pending: "대기",
  accepted: "수락됨",
  rejected: "거절됨",
  withdrawn: "취소됨",
  declined: "거절",
  expired: "만료",
  cancelled_by_applicant: "취소됨",
  cancelled_by_owner: "취소됨",
} as const;

export const projectSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해 주세요.").max(120),
  description: z
    .string()
    .trim()
    .min(10, "10자 이상 설명을 입력해 주세요.")
    .max(2000),
  visibility: z.enum(["public", "private"]).default("public"),
  genre_id: z.string().uuid().nullable().optional(),
  region_id: z.string().uuid().nullable().optional(),
  region_text: z.string().trim().max(100).nullable().optional(),
  pay_amount: z.coerce
    .number()
    .int()
    .min(0)
    .max(1_000_000_000)
    .nullable()
    .optional(),
  pay_type: z
    .enum(["per_session", "total", "negotiable"])
    .nullable()
    .optional(),
  recruitment_count: z.coerce.number().int().min(1).max(999).default(1),
  application_deadline: z.string().datetime().nullable().optional(),
  publish_now: z.boolean().default(true),
  // Lite: admin이 직접 입력하는 등록자 표시 텍스트 (max 80)
  posted_by_label: z.string().trim().max(80).nullable().optional(),
});

export const projectUpdateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1, "제목을 입력해 주세요.").max(120),
  description: z
    .string()
    .trim()
    .min(10, "10자 이상 설명을 입력해 주세요.")
    .max(2000),
  visibility: z.enum(["public", "private"]).default("public"),
  genre_id: z.string().uuid().nullable().optional(),
  region_id: z.string().uuid().nullable().optional(),
  region_text: z.string().trim().max(100).nullable().optional(),
  pay_amount: z.coerce
    .number()
    .int()
    .min(0)
    .max(1_000_000_000)
    .nullable()
    .optional(),
  pay_type: z
    .enum(["per_session", "total", "negotiable"])
    .nullable()
    .optional(),
  recruitment_count: z.coerce.number().int().min(1).max(999).default(1),
  application_deadline: z.string().datetime().nullable().optional(),
  posted_by_label: z.string().trim().max(80).nullable().optional(),
  status: z
    .enum(["draft", "open", "closed", "cancelled", "completed"])
    .optional(),
});
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

export const agreedPaySchema = z.object({
  project_id: z.string().uuid(),
  agreed_pay: z.coerce
    .number()
    .int()
    .min(0)
    .max(1_000_000_000)
    .nullable()
    .optional(),
});
export type AgreedPayInput = z.infer<typeof agreedPaySchema>;

export type ProjectInput = z.infer<typeof projectSchema>;

export const sessionSchema = z.object({
  session_type: z
    .enum(["rehearsal", "main", "filming", "fitting", "meeting", "other"])
    .default("main"),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime().nullable().optional(),
  location_name: z.string().max(120).nullable().optional(),
  location_address: z.string().max(200).nullable().optional(),
  region_id: z.string().uuid().nullable().optional(),
  role_notes: z.string().max(500).nullable().optional(),
  sort_order: z.number().int().default(0),
});

export type SessionInput = z.infer<typeof sessionSchema>;

export const applyInputSchema = z.object({
  project_id: z.string().uuid(),
  cover_message: z.string().trim().max(500).nullable().optional(),
});

export type ApplyInput = z.infer<typeof applyInputSchema>;
