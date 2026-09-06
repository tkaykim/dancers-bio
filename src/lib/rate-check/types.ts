import type { RatePricing } from "./pricing";

export type RateCheckData = Omit<RatePricing, "fBase"> & {
  fBase: number | null;
  id: string;
  handle: string;
  followers: number | null;
  fullName: string | null;
  profilePicUrl: string | null;
  isPrivate: boolean;
  cached: boolean;
  createdAt: string;
  createdBy: string | null;
  error: string | null;
};

export const RATE_CHECK_DISABLED = "측정 기능이 꺼져 있습니다(RATE_CHECK_APIFY_TOKEN 미설정).";
