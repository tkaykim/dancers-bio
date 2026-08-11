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
  .min(1, "링크를 입력해 주세요.")
  .max(2000, "링크가 너무 깁니다.")
  .refine(isHttpUrl, "http 또는 https 링크를 입력해 주세요.");

export const castingApplicationDetailsSchema = z.object({
  applicant_name: z
    .string()
    .trim()
    .min(1, "이름을 입력해 주세요.")
    .max(100, "이름은 100자 이하로 입력해 주세요."),
  birth_year: z.coerce
    .number()
    .int("출생연도를 숫자로 입력해 주세요.")
    .min(1900, "출생연도를 확인해 주세요.")
    .max(new Date().getFullYear(), "출생연도를 확인해 주세요."),
  height_cm: z.coerce
    .number()
    .int("키는 cm 단위의 정수로 입력해 주세요.")
    .min(50, "키를 확인해 주세요.")
    .max(250, "키를 확인해 주세요."),
  primary_genre: z
    .string()
    .trim()
    .min(1, "주 장르를 입력해 주세요.")
    .max(100, "주 장르는 100자 이하로 입력해 주세요."),
  dance_video_url: httpUrl,
  backup_dancer_history: z
    .string()
    .trim()
    .min(1, "백업댄서 이력을 입력해 주세요. 경력이 없으면 '없음'이라고 적어 주세요.")
    .max(2000, "백업댄서 이력은 2,000자 이하로 입력해 주세요."),
  personal_profile_url: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    httpUrl.nullable(),
  ),
});

export type CastingApplicationDetails = z.infer<
  typeof castingApplicationDetailsSchema
>;

export type CastingApplicationDefaults = {
  applicant_name: string;
  birth_year: string;
  height_cm: string;
  primary_genre: string;
  dance_video_url: string;
  backup_dancer_history: string;
  personal_profile_url: string;
};

export type SubmittedCastingDetails = {
  applicant_name: string | null;
  birth_year: number | null;
  height_cm: number | null;
  primary_genre: string | null;
  dance_video_url: string | null;
  backup_dancer_history: string | null;
  personal_profile_url: string | null;
};

export const EMPTY_CASTING_APPLICATION_DEFAULTS: CastingApplicationDefaults = {
  applicant_name: "",
  birth_year: "",
  height_cm: "",
  primary_genre: "",
  dance_video_url: "",
  backup_dancer_history: "",
  personal_profile_url: "",
};
