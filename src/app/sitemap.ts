import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { guides } from "@/lib/guides";

const SITE = "https://deetz.kr";
export const revalidate = 3600;

type SitemapRow = {
  slug?: string | null;
  short_code?: string | null;
  created_at?: string | null;
};

function lastModified(row: SitemapRow, fallback: Date): Date {
  return row.created_at ? new Date(row.created_at) : fallback;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/feed`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/dancers`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/guide`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/village`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/workshops`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    ...guides.map((g) => ({
      url: `${SITE}/guide/${g.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];

  try {
    const admin = createAdminClient();
    const [teamsRes, projectsRes] = await Promise.all([
      admin
        .from("teams")
        .select("slug, created_at")
        .eq("approval_status", "approved")
        .eq("is_active", true)
        .not("slug", "is", null)
        .order("created_at", { ascending: false })
        .limit(300),
      admin
        .from("projects")
        .select("short_code, created_at")
        .eq("visibility", "public")
        .in("status", ["open", "completed"])
        .is("deleted_at", null)
        .not("short_code", "is", null)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const teamPages: MetadataRoute.Sitemap = ((teamsRes.data ?? []) as SitemapRow[])
      .filter((row) => row.slug)
      .map((row) => ({
        url: `${SITE}/t/${row.slug}`,
        lastModified: lastModified(row, now),
        changeFrequency: "weekly",
        priority: 0.7,
      }));

    const projectPages: MetadataRoute.Sitemap = ((projectsRes.data ?? []) as SitemapRow[])
      .filter((row) => row.short_code)
      .map((row) => ({
        url: `${SITE}/projects/${row.short_code}`,
        lastModified: lastModified(row, now),
        changeFrequency: "daily",
        priority: 0.9,
      }));

    return [...staticPages, ...teamPages, ...projectPages];
  } catch {
    return staticPages;
  }
}
