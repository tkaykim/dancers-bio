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

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  display_name: z
    .string()
    .trim()
    .min(1, "이름을 입력해 주세요.")
    .max(50, "이름은 50자 이내로 입력해 주세요."),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "비밀번호를 입력해 주세요."),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
