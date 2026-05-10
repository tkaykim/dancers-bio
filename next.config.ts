import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : "wvfmqiajdvbsevlhlgtl.supabase.co";
  } catch {
    return "wvfmqiajdvbsevlhlgtl.supabase.co";
  }
})();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Supabase Storage (current)
      {
        protocol: "https",
        hostname: supabaseHost,
        pathname: "/storage/v1/object/public/**",
      },
      // Legacy AWS S3 bucket (some imported dancer profile_img live here)
      {
        protocol: "https",
        hostname: "*.s3.ap-northeast-2.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "*.s3.amazonaws.com",
      },
      // YouTube thumbnails (career.details.thumbnail / dancers.portfolio)
      {
        protocol: "https",
        hostname: "img.youtube.com",
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
      // Vimeo (less common, but anchors are referenced)
      {
        protocol: "https",
        hostname: "i.vimeocdn.com",
      },
    ],
  },
};

export default nextConfig;
