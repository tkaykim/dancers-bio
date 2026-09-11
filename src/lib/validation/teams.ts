import { z } from "zod";

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "v.slug_min_2")
  .max(40, "v.slug_max_40")
  .regex(/^[a-z0-9-]+$/i, "v.slug_pattern");

export const teamProfileSchema = z.object({
  team_name: z.string().trim().min(1, "v.team_name_required").max(80),
  korean_name: z.string().trim().max(40).optional().nullable(),
  slug: slugSchema.optional().nullable(),
  bio: z.string().trim().max(1000).optional().nullable(),
  location: z.string().trim().max(80).optional().nullable(),
  specialties: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  genres: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  // 댄서 폼과 동일하게 핸들 또는 URL 둘 다 허용 (서버에서 buildSocialUrl로 정규화)
  social_instagram: z.string().trim().max(200).optional().nullable().or(z.literal("")),
  social_youtube: z.string().trim().max(200).optional().nullable().or(z.literal("")),
  social_tiktok: z.string().trim().max(200).optional().nullable().or(z.literal("")),
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
    { message: "v.member_identity_required" },
  );
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const transferLeadSchema = z.object({
  team_id: z.string().uuid(),
  new_lead_profile_id: z.string().uuid(),
});
export type TransferLeadInput = z.infer<typeof transferLeadSchema>;
