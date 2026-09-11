import { z } from "zod";
import { parseInternationalPhone } from "@/lib/phone";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("v.email_address_invalid");

export const passwordSchema = z
  .string()
  .min(8, "v.password_min_8")
  .max(72, "v.password_max_72");

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
      .min(1, "v.name_required")
      .max(50, "v.name_max_50"),
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
  password: z.string().min(1, "v.password_required"),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
