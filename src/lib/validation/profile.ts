import { z } from "zod";
import { isValidProfilePhotoUrl } from "@/lib/storage/profile-photos";

export const profileUpdateSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, "v.name_required")
    .max(50, "v.name_max_50"),
  bio: z.string().trim().max(500, "v.bio_max_500").optional().nullable(),
  avatar_url: z
    .string()
    .trim()
    .url()
    .refine(isValidProfilePhotoUrl, "v.image_url_not_allowed")
    .optional()
    .nullable(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
