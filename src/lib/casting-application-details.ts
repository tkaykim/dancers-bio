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
