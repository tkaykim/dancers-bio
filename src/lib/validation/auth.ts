import { z } from "zod";
import { parseInternationalPhone } from "@/lib/phone";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("올바른 이메일 주소를 입력해 주세요.");

export const passwordSchema = z
  .string()
  .min(8, "비밀번호는 8자 이상이어야 합니다.")
  .max(72, "비밀번호는 72자 이하여야 합니다.");

const phoneUnavailableSchema = z.preprocess(
  (value) => value === true || value === "true" || value === "on",
  z.boolean(),
);

export const signupSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    display_name: z
      .string()
      .trim()
      .min(1, "이름을 입력해 주세요. / Enter your name.")
      .max(50, "이름은 50자 이내로 입력해 주세요. / Use 50 characters or fewer."),
    phone: z.string().trim().max(40).optional().default(""),
    phone_country: z.string().trim().toUpperCase().optional().default("KR"),
    phone_unavailable: phoneUnavailableSchema,
  })
  .superRefine((data, context) => {
    if (data.phone_unavailable) return;

    const parsed = parseInternationalPhone(data.phone, data.phone_country);
    if (!parsed.ok) {
      context.addIssue({
        code: "custom",
        path: ["phone"],
        message: parsed.error,
      });
    }
  })
  .transform((data) => ({
    ...data,
    phone: data.phone_unavailable
      ? null
      : (() => {
          const parsed = parseInternationalPhone(data.phone, data.phone_country);
          return parsed.ok ? parsed.e164 : null;
        })(),
  }));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "비밀번호를 입력해 주세요."),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
