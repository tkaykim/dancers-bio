import { z } from "zod";

export const bugReportSchema = z.object({
  title: z.string().trim().min(2, "v.title_min_2").max(160, "v.title_max_160"),
  description: z
    .string()
    .trim()
    .min(5, "v.description_min_5")
    .max(4000, "v.description_max_4000"),
  severity: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  reporter_email: z
    .string()
    .trim()
    .email("v.email_address_invalid")
    .optional()
    .or(z.literal("")),
  page_url: z.string().trim().max(2000).optional().or(z.literal("")),
  user_agent: z.string().trim().max(500).optional().or(z.literal("")),
});

export type BugReportInput = z.infer<typeof bugReportSchema>;
