import { z } from "zod";

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "slug는 2자 이상이어야 합니다.")
  .max(40, "slug는 40자 이하로 입력해 주세요.")
  .regex(/^[a-z0-9-]+$/i, "영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.");

export const teamProfileSchema = z.object({
  team_name: z.string().trim().min(1, "팀명을 입력해 주세요.").max(80),
  korean_name: z.string().trim().max(40).optional().nullable(),
  slug: slugSchema.optional().nullable(),
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
export type TeamProfileInput = z.infer<typeof teamProfileSchema>;

export const addMemberSchema = z
  .object({
    team_id: z.string().uuid(),
    profile_id: z.string().uuid().optional().nullable(),
    display_name: z.string().trim().max(80).optional().nullable(),
  })
  .refine(
    (v) => Boolean(v.profile_id) || Boolean(v.display_name?.trim()),
    { message: "플랫폼 계정 또는 이름 중 하나는 필수입니다." },
  );
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const transferLeadSchema = z.object({
  team_id: z.string().uuid(),
  new_lead_profile_id: z.string().uuid(),
});
export type TransferLeadInput = z.infer<typeof transferLeadSchema>;
