import { z } from "zod";

export const LANGUAGES = ["ko", "en", "ja", "zh", "th", "id"] as const;
export const languageSchema = z.enum(LANGUAGES);
export const projectDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().min(10).max(2000),
    category: z.enum([
      "performance",
      "choreography",
      "instructor",
      "broadcast",
      "advertisement",
      "event",
      "video",
      "other",
    ]),
    genre_slug: z.string().max(50).nullable(),
    region_text: z.string().max(100).nullable(),
    pay_type: z.enum(["per_session", "total", "negotiable"]).nullable(),
    pay_amount: z.number().int().min(0).max(1_000_000_000).nullable(),
    recruitment_count: z.number().int().min(1).max(999),
    recruitment_unlimited: z.boolean(),
    application_deadline: z.string().datetime().nullable(),
    visibility: z.enum(["public", "private"]),
    collect_applicant_fee: z.boolean(),
    collect_casting_details: z.boolean(),
  })
  .strict();
const pair = z.tuple([z.string().min(1).max(40), z.string().min(1).max(120)]);
export const slideSchema = z
  .object({
    layout: z.enum(["cover", "points"]),
    eyebrow: z.string().max(70),
    title: z.array(z.string().min(1).max(35)).min(1).max(3),
    copy: z.string().max(180).default(""),
    chip: z.string().max(65).default(""),
    items: z.array(pair).max(5).default([]),
  })
  .strict();
export const intakeResultSchema = z
  .object({
    project: projectDraftSchema,
    source_transcript: z.string().max(30000),
    missing: z.array(z.string().max(200)).max(30),
    evidence: z
      .array(
        z.object({ field: z.string().max(50), quote: z.string().max(500) }),
      )
      .max(40),
    private_terms: z.array(z.string().min(1).max(100)).max(40),
    decks: z
      .array(
        z
          .object({
            language: languageSchema,
            title: z.string().min(1).max(120),
            caption: z.string().min(1).max(500),
            slides: z.array(slideSchema).length(2),
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict();
export const intakeInputSchema = z
  .object({
    request_id: z.string().uuid(),
    source_raw: z.string().trim().max(20000),
    source_paths: z.array(z.string().max(250)).max(5),
    languages: z.array(languageSchema).min(1).max(4),
    private_terms: z.array(z.string().trim().min(1).max(100)).max(40),
    hide_names: z.boolean().default(true),
    operator_notes: z.string().trim().max(3000).default(""),
  })
  .refine(
    (v) => v.source_raw.length >= 10 || v.source_paths.length > 0,
    "텍스트 10자 이상 또는 캡처를 넣어 주세요.",
  )
  .refine(
    (v) => new Set(v.languages).size === v.languages.length,
    "언어가 중복되었습니다.",
  );

export function validateResult(
  raw: unknown,
  languages: string[],
  terms: string[],
) {
  const value = intakeResultSchema.parse(raw);
  if (value.decks.map((d) => d.language).join(",") !== languages.join(","))
    throw new Error("카드 언어와 순서가 요청과 다릅니다.");
  const publicText = JSON.stringify({
    project: value.project,
    decks: value.decks,
  })
    .normalize("NFKC")
    .toLowerCase();
  for (const term of [...terms, ...value.private_terms]) {
    if (publicText.includes(term.normalize("NFKC").toLowerCase()))
      throw new Error("비공개 명칭이 공개 문안에 포함되어 있습니다.");
  }
  if (/<\/?[a-z][^>]*>/i.test(publicText))
    throw new Error("문안에 HTML을 넣을 수 없습니다.");
  for (const deck of value.decks) {
    if (!/link in bio/i.test(deck.caption) || !/@deetz\.kr/.test(deck.caption))
      throw new Error("프로필 링크 지원 안내가 필요합니다.");
  }
  return value;
}
export type IntakeResult = z.infer<typeof intakeResultSchema>;
export type ProjectDraft = z.infer<typeof projectDraftSchema>;
