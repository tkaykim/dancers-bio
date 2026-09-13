import { z } from "zod";

export const parsedPortfolioSchema = z.object({
  profile: z.object({
    stage_name: z.string().trim().max(80).nullish(),
    korean_name: z.string().trim().max(40).nullish(),
    location: z.string().trim().max(80).nullish(),
    gender: z.enum(["male", "female", "other"]).nullish(),
    bio: z.string().trim().max(1000).nullish(),
    specialties: z.array(z.string().trim().max(30)).max(10).nullish(),
    genres: z.array(z.string().trim().max(30)).max(10).nullish(),
    social_instagram_handle: z.string().trim().max(60).nullish(),
    social_youtube_handle: z.string().trim().max(60).nullish(),
    social_tiktok_handle: z.string().trim().max(60).nullish(),
  }),
  careers: z.array(z.object({
    type: z.enum(["choreo", "performance", "broadcast", "award", "judge", "workshop", "education", "battle", "other"]),
    title: z.string().trim().min(1).max(120),
    // Unknown dates remain editable, never discard an otherwise useful career.
    date: z.union([z.literal(""), z.iso.date()]),
    role: z.string().trim().max(40).nullish(),
    description: z.string().trim().max(500).nullish(),
    link: z.string().trim().max(500).nullish(),
    _confidence: z.enum(["high", "low"]),
    _raw_date: z.string().trim().max(40).nullish(),
  })).max(200),
  warnings: z.array(z.string().trim().max(200)).max(200),
});
export type ParsedPortfolio = z.infer<typeof parsedPortfolioSchema>;
export const importInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().trim().min(1).max(50_000) }),
  z.object({ kind: z.literal("pdf"), storagePath: z.string().min(1).max(256) }),
]);
