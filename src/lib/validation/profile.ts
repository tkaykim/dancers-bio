import { z } from "zod";

export const profileUpdateSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, "이름을 입력해 주세요.")
    .max(50, "이름은 50자 이내로 입력해 주세요."),
  bio: z.string().trim().max(500, "소개는 500자 이내로 입력해 주세요.").optional().nullable(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
