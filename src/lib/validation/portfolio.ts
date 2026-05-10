import { z } from "zod";
import { isSupportedVideoUrl } from "@/lib/utils/video";

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "slug는 2자 이상이어야 합니다.")
  .max(40, "slug는 40자 이하로 입력해 주세요.")
  .regex(/^[a-z0-9-]+$/i, "영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.");

export const dancerProfileSchema = z.object({
  stage_name: z.string().trim().min(1, "활동명을 입력해 주세요.").max(80),
  korean_name: z.string().trim().max(40).optional().nullable(),
  slug: slugSchema.optional().nullable(),
  gender: z.enum(["male", "female", "other"]).optional().nullable(),
  bio: z.string().trim().max(1000).optional().nullable(),
  location: z.string().trim().max(80).optional().nullable(),
  specialties: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  genres: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  social_instagram: z
    .string()
    .trim()
    .max(200)
    .url("올바른 URL을 입력해 주세요.")
    .optional()
    .nullable()
    .or(z.literal("")),
  social_youtube: z
    .string()
    .trim()
    .max(200)
    .url("올바른 URL을 입력해 주세요.")
    .optional()
    .nullable()
    .or(z.literal("")),
  social_tiktok: z
    .string()
    .trim()
    .max(200)
    .url("올바른 URL을 입력해 주세요.")
    .optional()
    .nullable()
    .or(z.literal("")),
});

export type DancerProfileInput = z.infer<typeof dancerProfileSchema>;

export const careerCategoryEnum = z.enum([
  "choreo", // 안무 제작
  "broadcast", // 방송 출연
  "performance", // 공연
  "judge", // 심사
  "award", // 수상
  "workshop", // 워크샵
  "battle", // 배틀
  "other",
]);

export const CAREER_CATEGORY_LABELS: Record<z.infer<typeof careerCategoryEnum>, string> = {
  choreo: "안무 제작",
  broadcast: "방송 출연",
  performance: "공연",
  judge: "심사",
  award: "수상",
  workshop: "워크샵",
  battle: "배틀",
  other: "기타",
};

export const careerSchema = z.object({
  type: careerCategoryEnum,
  title: z.string().trim().min(1, "제목을 입력해 주세요.").max(120),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식으로 입력해 주세요."),
  role: z.string().trim().max(40).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  link: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .refine((v) => !v || isSupportedVideoUrl(v), {
      message: "지원하지 않는 영상 URL입니다. (YouTube/Vimeo)",
    }),
  is_public: z.boolean().default(true),
  is_representative: z.boolean().default(false),
});

export type CareerInput = z.infer<typeof careerSchema>;
