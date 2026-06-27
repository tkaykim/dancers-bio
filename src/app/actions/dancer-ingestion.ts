"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { sendGmailEmail } from "@/lib/gmail";
import { scrapeIgProfile, discoverViaHashtag } from "@/lib/apify";
import {
  extractDancerProfileFromScrape,
  classifyDancerCandidate,
} from "@/lib/ingest/dancer";
import type { ActionResult } from "./auth";

const uuid = z.string().uuid("잘못된 식별자입니다.");
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식이어야 합니다.");

function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? "입력값을 확인해 주세요.";
}

function intOrNull(formData: FormData, key: string): number | null {
  const raw = (formData.get(key) ?? "").toString().trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function strOrNull(formData: FormData, key: string): string | null {
  const v = (formData.get(key) ?? "").toString().trim();
  return v ? v : null;
}

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "dancer";
}

// ---------------------------------------------------------------------------
// Discovery — 해시태그 기반 댄서 후보 발견 (Apify hashtag-scraper)
// ---------------------------------------------------------------------------

export async function discoverDancersByHashtagAction(
  formData: FormData,
): Promise<ActionResult<{ found: number; inserted: number }>> {
  await requireAdmin();

  const parsed = z
    .object({
      hashtag: z.string().min(1, "해시태그를 입력하세요.").max(60),
      limit: z.number().int().min(1).max(200).nullable(),
    })
    .safeParse({
      hashtag: strOrNull(formData, "hashtag"),
      limit: intOrNull(formData, "limit"),
    });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const candidates = await discoverViaHashtag(
    parsed.data.hashtag,
    parsed.data.limit ?? 60,
  );
  if (candidates.length === 0) {
    return {
      ok: false,
      error: "발견 결과가 없습니다. APIFY_TOKEN 설정 또는 해시태그를 확인하세요.",
    };
  }

  // 해시태그 후보는 작성자 핸들만 신뢰 가능(bio 없음) → 분류로 필터링하지 않고
  // 모두 발견 풀에 적재한다(댄스 해시태그에서 왔으므로 presumptive). 핸들/이름에
  // 댄스 키워드가 있으면 rank를 약간 올린다. 최종 선별은 admin 검수가 담당.
  // 인증된 admin의 RLS 클라이언트(ig_discovery는 is_admin() 정책 → service role 불필요).
  const admin = await createClient();
  let inserted = 0;
  for (const cand of candidates) {
    const cls = classifyDancerCandidate({
      bio_text: cand.bio_text,
      ig_handle: cand.ig_handle,
      display_name: cand.display_name,
      mutuals_with_seed: 0,
    });
    const { error } = await admin.from("ig_discovery").upsert(
      {
        ig_user_id: cand.ig_user_id,
        ig_handle: cand.ig_handle,
        display_name: cand.display_name ?? null,
        bio_text: cand.bio_text ?? null,
        bio_keyword_hit: cls.bioKeywordHit,
        rank_score: Math.max(cls.rankScore, 25),
        source: cand.source,
        status: "discovered",
      },
      { onConflict: "ig_user_id", ignoreDuplicates: true },
    );
    if (!error) inserted += 1;
  }

  revalidatePath("/admin/dancers/discovery");
  return { ok: true, data: { found: candidates.length, inserted } };
}

// ---------------------------------------------------------------------------
// Scrape queue management
// ---------------------------------------------------------------------------

export async function enqueueForScrapeAction(
  formData: FormData,
): Promise<ActionResult<{ queue_id: string }>> {
  await requireAdmin();

  const parsed = z
    .object({
      discovery_id: uuid,
      scheduled_date: isoDate.nullable(),
      priority: z.number().int().nullable(),
    })
    .safeParse({
      discovery_id: strOrNull(formData, "discovery_id"),
      scheduled_date: strOrNull(formData, "scheduled_date"),
      priority: intOrNull(formData, "priority"),
    });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data: queue, error } = await supabase
    .from("dancer_scrape_queue")
    .insert({
      ig_discovery_id: parsed.data.discovery_id,
      scheduled_date: parsed.data.scheduled_date,
      priority: parsed.data.priority ?? 0,
      status: "queued",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "이미 스크랩 큐에 등록된 계정입니다." };
    }
    return { ok: false, error: error.message };
  }

  await supabase
    .from("ig_discovery")
    .update({ status: "queued", updated_at: new Date().toISOString() })
    .eq("id", parsed.data.discovery_id);

  revalidatePath("/admin/dancers/discovery");
  revalidatePath("/admin/dancers/discovery");
  return { ok: true, data: { queue_id: queue!.id as string } };
}

export async function updateScrapeQueueAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = z
    .object({
      queue_id: uuid,
      priority: z.number().int().nullable(),
      scheduled_date: isoDate.nullable(),
    })
    .safeParse({
      queue_id: strOrNull(formData, "queue_id"),
      priority: intOrNull(formData, "priority"),
      scheduled_date: strOrNull(formData, "scheduled_date"),
    });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.priority !== null) patch.priority = parsed.data.priority;
  if (parsed.data.scheduled_date !== null)
    patch.scheduled_date = parsed.data.scheduled_date;

  const supabase = await createClient();
  const { error } = await supabase
    .from("dancer_scrape_queue")
    .update(patch)
    .eq("id", parsed.data.queue_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/dancers/discovery");
  return { ok: true };
}

export async function removeFromQueueAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = uuid.safeParse(strOrNull(formData, "queue_id"));
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data: queue } = await supabase
    .from("dancer_scrape_queue")
    .select("ig_discovery_id")
    .eq("id", parsed.data)
    .maybeSingle();

  const { error } = await supabase
    .from("dancer_scrape_queue")
    .delete()
    .eq("id", parsed.data);
  if (error) return { ok: false, error: error.message };

  if (queue?.ig_discovery_id) {
    await supabase
      .from("ig_discovery")
      .update({ status: "discovered", updated_at: new Date().toISOString() })
      .eq("id", queue.ig_discovery_id as string);
  }

  revalidatePath("/admin/dancers/discovery");
  revalidatePath("/admin/dancers/discovery");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Run scrape → ingestion draft
// ---------------------------------------------------------------------------

export async function runScrapeAction(
  formData: FormData,
): Promise<ActionResult<{ ingestion_id: string }>> {
  const admin = await requireAdmin();

  const parsed = uuid.safeParse(strOrNull(formData, "queue_id"));
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const queueId = parsed.data;

  const supabase = await createClient();
  const { data: queue } = await supabase
    .from("dancer_scrape_queue")
    .select("id, ig_discovery_id, attempts, status")
    .eq("id", queueId)
    .maybeSingle();
  if (!queue) return { ok: false, error: "스크랩 큐 항목을 찾을 수 없습니다." };

  const { data: discovery } = await supabase
    .from("ig_discovery")
    .select("id, ig_user_id, ig_handle")
    .eq("id", queue.ig_discovery_id as string)
    .maybeSingle();
  if (!discovery) return { ok: false, error: "발견 항목을 찾을 수 없습니다." };

  const now = new Date().toISOString();
  await supabase
    .from("dancer_scrape_queue")
    .update({ status: "scraping", updated_at: now })
    .eq("id", queueId);

  const target =
    (discovery.ig_handle as string | null) ||
    (discovery.ig_user_id as string);
  const result = await scrapeIgProfile(target);

  if (!result.ok) {
    await supabase
      .from("dancer_scrape_queue")
      .update({
        status: "failed",
        last_error: result.error.slice(0, 1000),
        attempts: ((queue.attempts as number | null) ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", queueId);
    revalidatePath("/admin/dancers/discovery");
    return { ok: false, error: result.error };
  }

  const { profile, careers } = extractDancerProfileFromScrape(result.raw);

  const { data: ingestion, error: insErr } = await supabase
    .from("dancer_ingestions")
    .insert({
      ig_user_id: discovery.ig_user_id as string,
      ig_discovery_id: discovery.id as string,
      raw_scrape: result.raw,
      parsed_profile: profile,
      parsed_careers: careers,
      status: "draft",
      created_by: admin.id,
    })
    .select("id")
    .single();

  if (insErr) {
    await supabase
      .from("dancer_scrape_queue")
      .update({
        status: "failed",
        last_error: insErr.message.slice(0, 1000),
        attempts: ((queue.attempts as number | null) ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", queueId);
    return { ok: false, error: insErr.message };
  }

  const doneAt = new Date().toISOString();
  await supabase
    .from("dancer_scrape_queue")
    .update({ status: "done", scraped_at: doneAt, updated_at: doneAt })
    .eq("id", queueId);
  await supabase
    .from("ig_discovery")
    .update({ status: "scraped", updated_at: doneAt })
    .eq("id", discovery.id as string);

  revalidatePath("/admin/dancers/discovery");
  revalidatePath("/admin/dancers/ingestions");
  return { ok: true, data: { ingestion_id: ingestion!.id as string } };
}

// ---------------------------------------------------------------------------
// Approve / dismiss ingestion
// ---------------------------------------------------------------------------

export async function approveDancerIngestionAction(
  formData: FormData,
): Promise<ActionResult<{ dancer_id: string; slug: string }>> {
  const admin = await requireAdmin();

  const parsed = uuid.safeParse(strOrNull(formData, "ingestion_id"));
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ingestionId = parsed.data;

  const supabase = await createClient();
  const { data: ing } = await supabase
    .from("dancer_ingestions")
    .select(
      "id, ig_discovery_id, parsed_profile, parsed_careers, status",
    )
    .eq("id", ingestionId)
    .maybeSingle();
  if (!ing) return { ok: false, error: "ingestion 을 찾을 수 없습니다." };
  if (ing.status !== "draft")
    return { ok: false, error: "이미 처리된 ingestion 입니다." };

  const profile = (ing.parsed_profile ?? {}) as {
    stage_name?: string;
    bio?: string | null;
    location?: string | null;
    genres?: string[];
    specialties?: string[];
    profile_img?: string | null;
    social_links?: Record<string, string>;
  };

  // Admin overrides from the review form.
  const stageName =
    strOrNull(formData, "stage_name") ?? profile.stage_name ?? "Unknown Dancer";
  const bio = strOrNull(formData, "bio") ?? profile.bio ?? null;
  const location = strOrNull(formData, "location") ?? profile.location ?? null;
  const slugOverride = strOrNull(formData, "slug");

  // Service-role client for cross-table writes (careers RLS expects an owner;
  // ingested dancers are unclaimed, so write as system).
  // 인증된 admin의 RLS 클라이언트 (dancers_insert_self·careers_manage 모두 is_admin() 허용 → service role 불필요).
  const adminDb = await createClient();

  // Slug generation: prefer the existing RPC, fall back to slugify + suffix.
  let slug: string;
  if (slugOverride) {
    slug = slugify(slugOverride);
  } else {
    const base = slugify(stageName);
    const { data: rpcSlug, error: rpcErr } = await adminDb.rpc(
      "next_available_slug",
      { base, target_table: "dancers", exclude_id: null },
    );
    if (!rpcErr && typeof rpcSlug === "string" && rpcSlug.length > 0) {
      slug = rpcSlug;
    } else {
      slug = `${base}-${randomUUID().slice(0, 6)}`;
    }
  }

  const { data: dancer, error: dErr } = await adminDb
    .from("dancers")
    .insert({
      stage_name: stageName,
      bio,
      location,
      slug,
      genres: Array.isArray(profile.genres) ? profile.genres : [],
      specialties: Array.isArray(profile.specialties)
        ? profile.specialties
        : [],
      profile_img: profile.profile_img ?? null,
      social_links: profile.social_links ?? {},
      profile_id: null, // unclaimed — keep NULL for ingested dancers
      approval_status: "approved",
      is_active: true,
      is_verified: false,
    })
    .select("id, slug")
    .single();

  if (dErr) {
    if (dErr.code === "23505") {
      return { ok: false, error: "이미 존재하는 slug 입니다. 다시 시도해 주세요." };
    }
    return { ok: false, error: dErr.message };
  }
  const dancerId = dancer!.id as string;
  const finalSlug = (dancer!.slug as string) ?? slug;

  // Insert careers from parsed_careers (keep unverified flag).
  const parsedCareers = Array.isArray(ing.parsed_careers)
    ? (ing.parsed_careers as Array<{
        type?: string;
        title?: string;
        date?: string | null;
        details?: Record<string, unknown>;
      }>)
    : [];
  if (parsedCareers.length > 0) {
    const rows = parsedCareers.map((c, i) => ({
      dancer_id: dancerId,
      type: c.type ?? "performance",
      title: c.title ?? "",
      date: c.date ?? null,
      details: c.details ?? { unverified: true },
      is_public: true,
      is_representative: false,
      sort_order: i,
    }));
    // Non-fatal: dancer is already created; surface careers failure softly.
    await adminDb.from("careers").insert(rows);
  }

  const decidedAt = new Date().toISOString();
  await adminDb
    .from("dancer_ingestions")
    .update({
      status: "approved",
      created_dancer_id: dancerId,
      decided_at: decidedAt,
    })
    .eq("id", ingestionId);

  if (ing.ig_discovery_id) {
    await adminDb
      .from("ig_discovery")
      .update({
        status: "imported",
        matched_dancer_id: dancerId,
        updated_at: decidedAt,
      })
      .eq("id", ing.ig_discovery_id as string);
  }

  void admin; // admin context already enforced via requireAdmin()

  revalidatePath("/admin/dancers/ingestions");
  revalidatePath("/admin/dancers");
  return { ok: true, data: { dancer_id: dancerId, slug: finalSlug } };
}

export async function dismissDancerIngestionAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = uuid.safeParse(strOrNull(formData, "ingestion_id"));
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("dancer_ingestions")
    .update({ status: "dismissed", decided_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .eq("status", "draft");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/dancers/ingestions");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Outreach
// ---------------------------------------------------------------------------

export async function createOutreachAction(
  formData: FormData,
): Promise<ActionResult<{ outreach_id: string }>> {
  const admin = await requireAdmin();

  const parsed = z
    .object({
      dancer_id: uuid,
      channel: z.enum(["email", "ig_dm"]),
      message: z.string().max(4000).nullable(),
    })
    .safeParse({
      dancer_id: strOrNull(formData, "dancer_id"),
      channel: strOrNull(formData, "channel"),
      message: strOrNull(formData, "message"),
    });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data: dancer } = await supabase
    .from("dancers")
    .select("id, stage_name, social_links")
    .eq("id", parsed.data.dancer_id)
    .maybeSingle();
  if (!dancer) return { ok: false, error: "댄서를 찾을 수 없습니다." };

  const social = (dancer.social_links ?? {}) as Record<string, string>;
  let target: string | null = null;
  if (parsed.data.channel === "email") {
    target = social.source_email ?? null;
  } else {
    target = social.instagram ?? null;
  }

  const token = randomUUID();
  const { data: outreach, error } = await supabase
    .from("dancer_outreach")
    .insert({
      dancer_id: parsed.data.dancer_id,
      channel: parsed.data.channel,
      target,
      message_text: parsed.data.message,
      token,
      status: "queued",
      created_by: admin.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/dancers/outreach");
  return { ok: true, data: { outreach_id: outreach!.id as string } };
}

export async function sendOutreachAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = uuid.safeParse(strOrNull(formData, "outreach_id"));
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data: outreach } = await supabase
    .from("dancer_outreach")
    .select("id, dancer_id, channel, target, message_text, token, status")
    .eq("id", parsed.data)
    .maybeSingle();
  if (!outreach) return { ok: false, error: "아웃리치를 찾을 수 없습니다." };

  const { data: dancer } = await supabase
    .from("dancers")
    .select("id, stage_name, slug")
    .eq("id", outreach.dancer_id as string)
    .maybeSingle();
  if (!dancer) return { ok: false, error: "댄서를 찾을 수 없습니다." };

  const now = new Date().toISOString();
  // 댄서 프로필(포트폴리오) 링크는 dancers.bio 도메인을 쓴다.
  const claimUrl = `https://dancers.bio/d/${dancer.slug as string}?o=${outreach.token as string}`;

  if (outreach.channel === "email") {
    const target = (outreach.target as string | null) ?? null;
    if (!target) {
      return { ok: false, error: "이메일 주소가 없습니다." };
    }
    const stageName = (dancer.stage_name as string) ?? "댄서";
    const custom = (outreach.message_text as string | null) ?? "";
    const text = [
      `안녕하세요, ${stageName}님!`,
      "",
      "deetz 에서 회원님의 프로필을 미리 준비해 두었습니다.",
      "아래 링크에서 프로필을 확인하고 직접 인증(claim)하실 수 있어요.",
      "",
      claimUrl,
      ...(custom ? ["", custom] : []),
      "",
      "— deetz 팀",
    ].join("\n");
    const html = `
      <p>안녕하세요, <strong>${stageName}</strong>님!</p>
      <p>deetz 에서 회원님의 프로필을 미리 준비해 두었습니다.<br/>
      아래 링크에서 프로필을 확인하고 직접 인증(claim)하실 수 있어요.</p>
      <p><a href="${claimUrl}">${claimUrl}</a></p>
      ${custom ? `<p>${custom}</p>` : ""}
      <p>— deetz 팀</p>
    `;

    const res = await sendGmailEmail({
      to: target,
      subject: "[deetz] 회원님의 프로필이 준비되어 있어요",
      text,
      html,
    });
    if (!res.ok) {
      return { ok: false, error: res.error ?? "이메일 발송에 실패했습니다." };
    }
  }
  // ig_dm: manual send — just mark as sent.

  const { error } = await supabase
    .from("dancer_outreach")
    .update({ status: "sent", sent_at: now, updated_at: now })
    .eq("id", outreach.id as string);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/dancers/outreach");
  return { ok: true };
}

export async function updateOutreachStatusAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = z
    .object({
      outreach_id: uuid,
      status: z.enum([
        "queued",
        "sent",
        "opened",
        "claimed",
        "bounced",
        "skipped",
      ]),
    })
    .safeParse({
      outreach_id: strOrNull(formData, "outreach_id"),
      status: strOrNull(formData, "status"),
    });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("dancer_outreach")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.outreach_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/dancers/outreach");
  return { ok: true };
}
