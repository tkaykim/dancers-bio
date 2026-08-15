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
  allowedDevOrigins: ["172.30.1.58", "localhost", "127.0.0.1"],
  experimental: {
    // /village/upload 이 사진 파일을 서버 액션으로 그대로 보낸다(브라우저에서 1920px로 줄인 뒤).
    // 기본 1MB로는 고화질 사진 1장이 그대로 막힌다.
    serverActions: { bodySizeLimit: "10mb" },
  },
  images: {
    // Disable Next.js / Vercel Image Optimization globally so we don't hit
    // Vercel's per-deployment optimized-image quota (which was breaking
    // remote images on the live site). Source images are served as-is.
    // See: node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md
    unoptimized: true,
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
