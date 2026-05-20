import { z } from "zod";

export const bugReportSchema = z.object({
  title: z.string().trim().min(2, "제목은 최소 2자").max(160, "제목은 최대 160자"),
  description: z.string().trim().min(5, "설명은 최소 5자").max(4000, "설명은 최대 4000자"),
  severity: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  reporter_email: z
    .string()
    .trim()
    .email("올바른 이메일을 입력해 주세요.")
    .optional()
    .or(z.literal("")),
  page_url: z.string().trim().max(2000).optional().or(z.literal("")),
  user_agent: z.string().trim().max(500).optional().or(z.literal("")),
});

export type BugReportInput = z.infer<typeof bugReportSchema>;
