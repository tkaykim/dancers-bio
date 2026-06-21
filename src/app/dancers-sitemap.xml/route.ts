import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DANCERS_BIO = "https://dancers.bio";

type DancerSitemapRow = {
  slug: string | null;
  created_at: string | null;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("dancers")
      .select("slug, created_at")
      .eq("approval_status", "approved")
      .not("slug", "is", null)
      .order("created_at", { ascending: false })
      .limit(2000);

    const urls = ((data ?? []) as DancerSitemapRow[])
      .filter((row) => row.slug)
      .map((row) => {
        const loc = `${DANCERS_BIO}/${encodeURIComponent(row.slug!)}`;
        const lastmod = row.created_at
          ? new Date(row.created_at).toISOString()
          : new Date().toISOString();
        return [
          "  <url>",
          `    <loc>${escapeXml(loc)}</loc>`,
          `    <lastmod>${lastmod}</lastmod>`,
          "    <changefreq>weekly</changefreq>",
          "    <priority>0.8</priority>",
          "  </url>",
        ].join("\n");
      })
      .join("\n");

    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      urls,
      "</urlset>",
    ].join("\n");

    return new NextResponse(body, {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" />',
      {
        headers: {
          "content-type": "application/xml; charset=utf-8",
          "cache-control": "public, s-maxage=300",
        },
      },
    );
  }
}
