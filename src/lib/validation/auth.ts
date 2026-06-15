import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("올바른 이메일 주소를 입력해 주세요.");

export const passwordSchema = z
  .string()
  .min(8, "비밀번호는 8자 이상이어야 합니다.")
  .max(72, "비밀번호는 72자 이하여야 합니다.");

// 휴대폰 번호 — 입력값에서 숫자만 남겨 검증·저장. (예: 010-1234-5678)
export const phoneSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[^0-9]/g, ""))
  .refine(
    (s) => /^01[016789]\d{7,8}$/.test(s),
    "올바른 휴대폰 번호를 입력해 주세요. (예: 010-1234-5678)",
  );

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  display_name: z
    .string()
    .trim()
    .min(1, "이름을 입력해 주세요.")
    .max(50, "이름은 50자 이내로 입력해 주세요."),
  phone: phoneSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "비밀번호를 입력해 주세요."),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
