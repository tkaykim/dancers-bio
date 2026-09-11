import { z } from "zod";

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const httpUrl = z
  .string()
  .trim()
  .min(1, "v.link_required")
  .max(2000, "v.link_too_long")
  .refine(isHttpUrl, "v.link_http_only");

export const castingApplicationDetailsSchema = z.object({
  applicant_name: z
    .string()
    .trim()
    .min(1, "v.name_required")
    .max(100, "v.name_max_100"),
  birth_year: z.coerce
    .number()
    .int("v.birth_year_integer")
    .min(1900, "v.birth_year_range")
    .max(new Date().getFullYear(), "v.birth_year_range"),
  height_cm: z.coerce
    .number()
    .int("v.height_integer")
    .min(50, "v.height_range")
    .max(250, "v.height_range"),
  primary_genre: z
    .string()
    .trim()
    .min(1, "v.primary_genre_required")
    .max(100, "v.primary_genre_max_100"),
  dance_video_url: httpUrl,
  backup_dancer_history: z
    .string()
    .trim()
    .min(1, "v.backup_history_required")
    .max(2000, "v.backup_history_max_2000"),
  personal_profile_url: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    httpUrl.nullable(),
  ),
});

export type CastingApplicationDetails = z.infer<
  typeof castingApplicationDetailsSchema
>;
