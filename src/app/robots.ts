import type { MetadataRoute } from "next";

const SITE = "https://deetz.kr";
const DISALLOW = [
  "/api/",
  "/signin",
  "/signup",
  "/reset-password",
  "/welcome",
  "/settings",
  "/admin",
  "/me",
  "/applications",
  "/ops",
  "/channels",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // AI 검색/학습 크롤러 포함 전체 허용(비공개·기능 경로만 제외).
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      // 무단 데이터 수집봇 차단
      { userAgent: "Bytespider", disallow: "/" },
    ],
    sitemap: [`${SITE}/sitemap.xml`, "https://dancers.bio/dancers-sitemap.xml"],
    host: SITE,
  };
}
