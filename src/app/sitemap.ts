import type { MetadataRoute } from "next";

const SITE = "https://dancers.bio";

// 정적 핵심 페이지. 공개 댄서 프로필(/u/[id]) 동적 sitemap은 다음 단계(DB 조회)에서 추가.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
  ];
}
