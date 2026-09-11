import { z } from "zod";
import { isSupportedVideoUrl } from "@/lib/utils/video";
import { isValidProfilePhotoUrl } from "@/lib/storage/profile-photos";

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "v.slug_min_2")
  .max(40, "v.slug_max_40")
  .regex(/^[a-z0-9-]+$/i, "v.slug_pattern");

const handleSchema = z
  .string()
  .trim()
  .max(60, "v.handle_max_60")
  .regex(/^[A-Za-z0-9._-]*$/, "v.handle_pattern");

export const dancerProfileSchema = z.object({
  stage_name: z.string().trim().min(1, "v.stage_name_required").max(80),
  korean_name: z.string().trim().max(40).optional().nullable(),
  slug: slugSchema.optional().nullable(),
  gender: z.enum(["male", "female", "other"]).optional().nullable(),
  bio: z.string().trim().max(1000).optional().nullable(),
  location: z.string().trim().max(80).optional().nullable(),
  specialties: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  genres: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  // SNS 입력은 핸들(username) 또는 전체 URL 둘 다 허용.
  // 서버에서 buildSocialUrl() 이 정규화하므로 형식 검증은 느슨하게.
  social_instagram: z.string().trim().max(200).optional().nullable().or(z.literal("")),
  social_youtube: z.string().trim().max(200).optional().nullable().or(z.literal("")),
  social_tiktok: z.string().trim().max(200).optional().nullable().or(z.literal("")),
  profile_img_url: z
    .string()
    .trim()
    .url()
    .refine(isValidProfilePhotoUrl, "v.image_url_not_allowed")
    .optional()
    .nullable(),
});

export type DancerProfileInput = z.infer<typeof dancerProfileSchema>;

export const dancerOnboardingSchema = z.object({
  stage_name: z.string().trim().min(1, "v.stage_name_required").max(80),
  korean_name: z.string().trim().max(40).optional().nullable(),
  location: z.string().trim().max(80).optional().nullable(),
  gender: z.enum(["male", "female", "other"]).optional().nullable(),
  bio: z.string().trim().max(1000).optional().nullable(),
  specialties: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  genres: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  social_instagram_handle: handleSchema.optional().nullable().or(z.literal("")),
  social_youtube_handle: handleSchema.optional().nullable().or(z.literal("")),
  social_tiktok_handle: handleSchema.optional().nullable().or(z.literal("")),
});

export type DancerOnboardingInput = z.infer<typeof dancerOnboardingSchema>;

export const careerCategoryEnum = z.enum([
  "choreo",
  "performance",
  "broadcast",
  "award",
  "judge",
  "workshop",
  "education",
  "battle",
  "other",
]);

export type CareerCategory = z.infer<typeof careerCategoryEnum>;

export const CAREER_CATEGORY_ORDER: readonly CareerCategory[] = [
  "choreo",
  "broadcast",
  "performance",
  "judge",
  "award",
  "workshop",
  "education",
  "battle",
  "other",
];

/* eslint-disable no-restricted-syntax -- i18n: admin-only. 경력 분류·역할 라벨 상수는 관리자 화면(/admin/dancers, 임포트 검수)이
   그대로 쓰는 ko 값이다. 사용자 화면은 portfolio 네임스페이스 키로 읽는다 (docs/design-i18n-ui.md §3.6). */
export const CAREER_CATEGORY_LABELS: Record<CareerCategory, string> = {
  choreo: "안무",
  performance: "공연",
  broadcast: "방송",
  award: "수상",
  judge: "심사",
  workshop: "워크샵",
  education: "교육",
  battle: "배틀",
  other: "기타",
};

export const CAREER_CATEGORY_ROLES: Record<CareerCategory, string[]> = {
  choreo: ["제작", "공동제작", "참여"],
  performance: ["댄서", "게스트", "디렉터"],
  broadcast: ["출연", "안무", "퍼포머"],
  award: ["우승", "준우승", "베스트상", "참가"],
  judge: [],
  workshop: [],
  education: [],
  battle: [],
  other: [],
};
/* eslint-enable no-restricted-syntax */

export const careerSchema = z.object({
  type: careerCategoryEnum,
  title: z.string().trim().min(1, "v.career_title_required").max(120),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "v.date_format"),
  role: z.string().trim().max(40).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  link: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .refine((v) => !v || isSupportedVideoUrl(v), {
      message: "v.video_url_unsupported",
    }),
  is_public: z.boolean().default(false),
  is_representative: z.boolean().default(false),
  sort_order: z.number().int().min(0).max(999).default(0),
});

export type CareerInput = z.infer<typeof careerSchema>;
