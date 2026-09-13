"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { portfolioFilePublicPrefix } from "@/lib/storage/dancer-portfolio-file";
import { parseVideoUrl } from "@/lib/utils/video";

const command = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), url: z.string().url().max(1000), type: z.enum(["photo", "video"]) }),
  z.object({ op: z.literal("remove"), index: z.number().int().min(0).max(49), url: z.string() }),
  z.object({ op: z.literal("move"), index: z.number().int().min(0).max(49), url: z.string(), direction: z.union([z.literal(-1), z.literal(1)]) }),
]);
export type PortfolioMediaItem = { url: string; type?: string; thumbnail?: string; id?: string };
export async function changePortfolioMediaAction(dancerId: string, input: unknown) {
  const user = await requireUser();
  const parsed = command.safeParse(input);
  if (!z.uuid().safeParse(dancerId).success || !parsed.success) return { ok: false as const };
  const db = await createClient();
  const row = await db.from("dancers").select("id,slug,portfolio").eq("id", dancerId).eq("profile_id", user.id).single();
  if (row.error || !row.data) return { ok: false as const };
  const items = (Array.isArray(row.data.portfolio) ? [...row.data.portfolio] : []) as PortfolioMediaItem[];
  const value = parsed.data;
  if (value.op === "add") {
    const ownPrefix = `${portfolioFilePublicPrefix()}${dancerId}/portfolio-file/`;
    const uploaded = value.url.startsWith(ownPrefix) && !decodeURIComponent(value.url).includes("..");
    const video = value.type === "video" ? parseVideoUrl(value.url) : null;
    if (!uploaded && !video) return { ok: false as const };
    if (uploaded && !(value.type === "photo" ? /\.(jpg|jpeg|png)$/i : /\.mp4$/i).test(value.url)) return { ok: false as const };
    if (items.some(item => item.url === (video?.url ?? value.url))) return { ok: true as const, items };
    if (items.length >= 50) return { ok: false as const };
    items.push({ id: crypto.randomUUID(), url: video?.url ?? value.url, type: value.type, ...(video?.thumbnail_url ? { thumbnail: video.thumbnail_url } : {}) });
  } else {
    if (items[value.index]?.url !== value.url) return { ok: false as const };
    if (value.op === "remove") items.splice(value.index, 1);
    else {
      const target = value.index + value.direction;
      if (target < 0 || target >= items.length) return { ok: false as const };
      [items[value.index], items[target]] = [items[target], items[value.index]];
    }
  }
  // Compare-and-swap preserves media added concurrently in another tab.
  let update = db.from("dancers").update({ portfolio: items }).eq("id", dancerId).eq("profile_id", user.id);
  update = row.data.portfolio === null ? update.is("portfolio", null) : update.eq("portfolio", JSON.stringify(row.data.portfolio));
  const saved = await update.select("id");
  if (saved.error || !saved.data?.length) return { ok: false as const };
  revalidatePath(`/me/portfolio/${dancerId}`);
  revalidatePath(`/d/${row.data.slug ?? dancerId}`);
  return { ok: true as const, items };
}
