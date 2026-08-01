import { z } from "zod";
import { isSupportedVideoUrl } from "@/lib/utils/video";
import { isValidProfilePhotoUrl } from "@/lib/storage/profile-photos";

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "slug는 2자 이상이어야 합니다.")
  .max(40, "slug는 40자 이하로 입력해 주세요.")
  .regex(/^[a-z0-9-]+$/i, "영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.");

const handleSchema = z
  .string()
  .trim()
  .max(60, "아이디는 60자 이하로 입력해 주세요.")
  .regex(
    /^[A-Za-z0-9._-]*$/,
    "SNS 아이디에는 한글·공백·특수문자를 넣을 수 없어요. 영문·숫자와 점(.) 밑줄(_) 붙임표(-)만 사용해 주세요. (예: dancer_kim)",
  );

export const dancerProfileSchema = z.object({
  stage_name: z.string().trim().min(1, "활동명을 입력해 주세요.").max(80),
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
    .refine(isValidProfilePhotoUrl, "허용되지 않는 이미지 URL입니다.")
    .optional()
    .nullable(),
});

export type DancerProfileInput = z.infer<typeof dancerProfileSchema>;

export const dancerOnboardingSchema = z.object({
  stage_name: z.string().trim().min(1, "활동명을 입력해 주세요.").max(80),
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
  is_public: z.boolean().default(false),
  is_representative: z.boolean().default(false),
  sort_order: z.number().int().min(0).max(999).default(0),
});

export type CareerInput = z.infer<typeof careerSchema>;
