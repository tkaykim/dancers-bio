"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getUser, requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendWorkshopNominationOpsMail, sendWorkshopRecruitOpenMail } from "@/lib/notify/workshop-mails";
import {
  compactInstagramHandle,
  namesLookSimilar,
  normalizeContactEmail,
  normalizeInstagramHandle,
  suggestSlug,
  WORKSHOP_STATUSES,
  type WorkshopStatus,
} from "@/lib/workshops/shared";
import type { ActionResult } from "./auth";

// deetz Workshop — 수요 접수(비로그인 허용) + 어드민 큐레이션.
// workshop_* 테이블은 전부 RLS default-deny(service-role 전용)라 admin client로만 접근한다.

const GENERIC = "오류가 발생했습니다. 다시 시도해 주세요.";

/** 비로그인 제출 남용 방지 — 같은 IP 가 10분에 8건을 넘으면 막는다. */
const RATE_LIMIT_WINDOW_MIN = 10;
const RATE_LIMIT_MAX = 8;

/** 수요 운영 메일은 안무가 단위로 30분에 1통 — 누적 수는 다음 메일 제목에 반영된다. */
const OPS_MAIL_THROTTLE_MIN = 30;

async function getClientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    const ip = fwd?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || null;
    return ip && ip.length <= 64 ? ip : null;
  } catch {
    return null;
  }
}

function revalidateWorkshops(slug?: string | null) {
  revalidatePath("/workshops");
  if (slug) revalidatePath(`/workshops/${slug}`);
  revalidatePath("/admin/workshops");
}

// ── 공개: 수요 제출 (제안 nominate / 찜 vote) ───────────────────────────────

const demandSchema = z
  .object({
    artistId: z.string().uuid().optional().nullable(),
    artistName: z.string().trim().max(120).optional().nullable(),
    instagramHandle: z.string().trim().max(120).optional().nullable(),
    comment: z.string().trim().max(2000).optional().nullable(),
    contactEmail: z.string().trim().email("이메일 형식을 확인해 주세요.").max(200).optional().nullable().or(z.literal("")),
    contactInstagram: z.string().trim().max(120).optional().nullable(),
    /** 제출자 거주지 — 미입력 시 대한민국/서울로 저장한다(대표 지시). */
    countryCode: z.string().trim().length(2).optional().nullable(),
    city: z.string().trim().max(120).optional().nullable(),
  })
  // 기존 카드 찜이 아니면(신규 제안) 안무가 이름·인스타그램이 필수다.
  .refine((d) => !!d.artistId || (!!d.artistName?.trim() && !!d.instagramHandle?.trim()), {
    message: "안무가 이름과 인스타그램을 입력해 주세요.",
    path: ["artistName"],
  });

export type WorkshopDemandInput = z.input<typeof demandSchema>;

/**
 * 안무가 수요 제출.
 * - artistId 있음 = 공개 카드에 '나도 원해요'(vote)
 * - artistId 없음 = 신규 제안(nominate) — 인스타 핸들 기준으로 기존 카드에 합쳐진다.
 * 비로그인 허용: 로그인이 없으면 이메일 또는 인스타 핸들 중 하나로 중복을 막는다.
 */
export async function submitWorkshopDemandAction(
  input: WorkshopDemandInput,
): Promise<ActionResult<{ artistId: string; already: boolean; isFirst: boolean }>> {
  const parsed = demandSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }
  const d = parsed.data;

  const user = await getUser();
  const contactEmail = d.contactEmail?.trim() || null;
  const contactInstagram = d.contactInstagram?.trim()
    ? normalizeInstagramHandle(d.contactInstagram)
    : null;

  if (!user && !contactEmail && !contactInstagram) {
    return { ok: false, error: "이메일 또는 인스타그램 아이디를 입력해 주세요. 진행 소식을 전해드릴 연락 수단이 필요해요." };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: GENERIC };
  }

  // 0) IP 레이트리밋 — 비로그인 제출이 열려 있어 무제한이면 카운트 오염·메일 폭주가 가능하다.
  const submitIp = await getClientIp();
  if (submitIp) {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60_000).toISOString();
    const { count: recentCount } = await admin
      .from("workshop_demands")
      .select("id", { count: "exact", head: true })
      .eq("submit_ip", submitIp)
      .gte("created_at", since);
    if ((recentCount ?? 0) >= RATE_LIMIT_MAX) {
      return { ok: false, error: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." };
    }
  }

  // 1) 대상 안무가 카드 확정 (vote = 조회, nominate = 핸들 기준 upsert)
  //    같은 안무가가 표기 차이로 중복 카드가 되는 경우의 수를 흡수한다:
  //    - 핸들 완전 일치 → 같은 카드 (unique index)
  //    - 핸들 compact 일치(j.blaze/j_blaze/jblaze) → 같은 카드로 자동 합산
  //    - 이름만 유사(성만·이름만·표기차) → 새 카드를 만들되 possible_duplicate_of 로 표시(운영자 병합)
  let artistId = d.artistId ?? null;
  let artistName = d.artistName?.trim() ?? "";
  let artistHandle = "";
  let artistSlug: string | null = null;
  let artistOpsNotifiedAt: string | null = null;
  let isNewArtist = false;

  if (artistId) {
    const { data: artist } = await admin
      .from("workshop_artists")
      .select("id, name, instagram_handle, slug, status, ops_notified_at")
      .eq("id", artistId)
      .maybeSingle();
    if (!artist) return { ok: false, error: "안무가 카드를 찾을 수 없습니다." };
    artistName = artist.name as string;
    artistHandle = artist.instagram_handle as string;
    artistSlug = (artist.slug as string) ?? null;
    artistOpsNotifiedAt = (artist.ops_notified_at as string | null) ?? null;
  } else {
    artistHandle = normalizeInstagramHandle(d.instagramHandle ?? "");
    if (!artistHandle) return { ok: false, error: "인스타그램 아이디를 확인해 주세요." };

    // 카드 수가 작으므로(수백 규모) 전량 읽어 코드에서 비교한다.
    const { data: candidates } = await admin
      .from("workshop_artists")
      .select("id, name, instagram_handle, slug, status, ops_notified_at")
      .neq("status", "archived")
      .limit(1000);

    const compact = compactInstagramHandle(artistHandle);
    const exact = (candidates ?? []).find(
      (c) => (c.instagram_handle as string).toLowerCase() === artistHandle,
    );
    const compactMatch =
      exact ?? (candidates ?? []).find((c) => compactInstagramHandle(c.instagram_handle as string) === compact);
    const nameMatch =
      compactMatch ??
      (artistName
        ? (candidates ?? []).find((c) => namesLookSimilar(c.name as string, artistName))
        : undefined);

    if (compactMatch) {
      artistId = compactMatch.id as string;
      artistName = compactMatch.name as string;
      artistSlug = (compactMatch.slug as string) ?? null;
      artistOpsNotifiedAt = (compactMatch.ops_notified_at as string | null) ?? null;
    } else {
      // 핸들이 deetz 댄서 풀과 매치되면 프로필을 이어받는다(사진=자사 자산이라 권리 문제 없음).
      // 검색의 dancer 행 탭 제출뿐 아니라 직접 입력도 같은 혜택을 받는다.
      let dancerImage: string | null = null;
      let dancerCountry: string | null = null;
      let dancerGenres: string[] | null = null;
      const { data: dancerRows } = await admin
        .from("dancers")
        .select("stage_name, profile_img, genres, social_links")
        .eq("approval_status", "approved")
        .eq("is_active", true)
        .ilike("social_links->>instagram", `%${artistHandle}%`)
        .limit(5);
      // ilike 는 부분일치라 오매치 가능 — 정규화 후 정확 일치만 인정한다.
      const dancerMatch = (dancerRows ?? []).find(
        (row) =>
          normalizeInstagramHandle(
            ((row.social_links as Record<string, string> | null)?.instagram as string) ?? "",
          ) === artistHandle,
      );
      if (dancerMatch) {
        dancerImage = (dancerMatch.profile_img as string | null) ?? null;
        dancerCountry = "대한민국";
        dancerGenres = (dancerMatch.genres as string[] | null) ?? null;
        if (!artistName) artistName = (dancerMatch.stage_name as string) ?? artistName;
      }

      const { data: created, error: createError } = await admin
        .from("workshop_artists")
        .insert({
          name: artistName,
          instagram_handle: artistHandle,
          image_url: dancerImage,
          country: dancerCountry,
          genres: dancerGenres ?? [],
          status: "suggested",
          created_by: user?.id ?? null,
          // 이름만 비슷한 건 다른 사람일 수 있어 자동 합산하지 않고 표시만 한다.
          possible_duplicate_of: nameMatch ? (nameMatch.id as string) : null,
        })
        .select("id")
        .single();
      if (createError || !created) {
        // 동시 제안 레이스 — unique(lower(instagram_handle)) 충돌이면 다시 읽는다.
        if (createError?.code === "23505") {
          const { data: raced } = await admin
            .from("workshop_artists")
            .select("id, name, slug")
            .ilike("instagram_handle", artistHandle)
            .maybeSingle();
          if (raced) {
            artistId = raced.id as string;
            artistName = raced.name as string;
            artistSlug = (raced.slug as string) ?? null;
          }
        }
        if (!artistId) {
          console.error("[workshopDemand] artist insert failed:", createError);
          return { ok: false, error: GENERIC };
        }
      } else {
        artistId = created.id as string;
        isNewArtist = true;
      }
    }
  }

  // 2) 수요 레코드 적재 (unique 인덱스가 중복을 막는다 — 이메일은 정규화 값 기준)
  const { error: demandError } = await admin.from("workshop_demands").insert({
    artist_id: artistId,
    source: d.artistId ? "vote" : "nominate",
    contact_email: contactEmail,
    contact_email_norm: contactEmail ? normalizeContactEmail(contactEmail) : null,
    contact_instagram: contactInstagram,
    user_id: user?.id ?? null,
    submit_ip: submitIp,
    comment: d.comment?.trim() || null,
    // 거주지 기본값 = 대한민국/서울 (대표 지시). 해외 수요는 향후 "한국 댄서 해외 진출 창구" 근거 데이터.
    country_code: (d.countryCode?.trim().toUpperCase() || "KR").slice(0, 2),
    city: d.city?.trim() || "서울",
  });

  let already = false;
  if (demandError) {
    if (demandError.code === "23505") {
      already = true; // 이미 등록된 수요 — 성공으로 안내한다.
    } else {
      console.error("[workshopDemand] insert failed:", demandError);
      return { ok: false, error: GENERIC };
    }
  }

  // 3) 첫 요청 판정 + 운영자 알림 (신규 수요만, 비치명적) — 메일은 안무가 단위 30분 스로틀.
  //    홍보가 터져 수요가 몰릴 때 건당 1통이면 메일함이 마비된다. 스킵된 건은 다음 메일의 누적 수로 확인된다.
  let isFirst = false;
  if (!already) {
    const { count } = await admin
      .from("workshop_demands")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", artistId);
    const demandCount = count ?? 1;
    isFirst = demandCount === 1;

    const throttled =
      !isNewArtist &&
      !!artistOpsNotifiedAt &&
      Date.now() - new Date(artistOpsNotifiedAt).getTime() < OPS_MAIL_THROTTLE_MIN * 60_000;
    if (!throttled) {
      try {
        await sendWorkshopNominationOpsMail({
          artistName,
          instagramHandle: artistHandle || normalizeInstagramHandle(d.instagramHandle ?? ""),
          isNewArtist,
          wantType: null,
          comment: d.comment?.trim() || null,
          contactEmail,
          contactInstagram,
          demandCount,
        });
        await admin
          .from("workshop_artists")
          .update({ ops_notified_at: new Date().toISOString() })
          .eq("id", artistId!);
      } catch (e) {
        console.error("[workshopDemand] ops mail failed (non-fatal):", e);
      }
    }
  }

  revalidateWorkshops(artistSlug);
  return { ok: true, data: { artistId: artistId!, already, isFirst } };
}

// ── 어드민: 카드 생성·수정·상태 전환 ────────────────────────────────────────

const adminUpsertSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1, "이름을 입력해 주세요.").max(120),
  instagramHandle: z.string().trim().min(1, "인스타그램을 입력해 주세요.").max(120),
  slug: z
    .string()
    .trim()
    .max(60)
    .regex(/^[a-z0-9-]*$/, "slug는 영문 소문자·숫자·하이픈만 가능합니다.")
    .optional()
    .nullable()
    .or(z.literal("")),
  imageUrl: z.string().trim().url().max(2000).optional().nullable().or(z.literal("")),
  country: z.string().trim().max(80).optional().nullable(),
  genres: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  headline: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  status: z.enum(WORKSHOP_STATUSES).optional().nullable(),
  depositAmount: z.number().int().positive().optional().nullable(),
  totalPrice: z.number().int().positive().optional().nullable(),
  minHeadcount: z.number().int().positive().optional().nullable(),
  maxHeadcount: z.number().int().positive().optional().nullable(),
  expectedPeriod: z.string().trim().max(120).optional().nullable(),
  recruitDeadline: z.string().trim().optional().nullable().or(z.literal("")),
});

export type WorkshopArtistUpsertInput = z.input<typeof adminUpsertSchema>;

export async function adminUpsertWorkshopArtistAction(
  input: WorkshopArtistUpsertInput,
): Promise<ActionResult<{ id: string; slug: string | null }>> {
  await requireAdmin();
  const parsed = adminUpsertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }
  const d = parsed.data;
  const admin = createAdminClient();

  const handle = normalizeInstagramHandle(d.instagramHandle);
  if (!handle) return { ok: false, error: "인스타그램 아이디를 확인해 주세요." };

  const nextStatus: WorkshopStatus | null = d.status ?? null;

  // 공개 이후 상태는 상세 URL이 필요하므로 slug를 보장한다.
  let slug = d.slug?.trim() || null;
  const needsSlug = nextStatus && nextStatus !== "suggested" && nextStatus !== "archived";
  if (!slug && needsSlug) {
    slug = suggestSlug(d.name) || suggestSlug(handle) || null;
    if (!slug) return { ok: false, error: "slug를 입력해 주세요. (영문 소문자·숫자·하이픈)" };
  }

  // 모집 오픈은 예약금·최소 인원이 확정돼야 한다.
  if (nextStatus === "recruiting") {
    if (!d.depositAmount) return { ok: false, error: "모집 오픈에는 예약금 금액이 필요합니다." };
    if (!d.minHeadcount) return { ok: false, error: "모집 오픈에는 최소 인원이 필요합니다." };
  }
  if (d.minHeadcount && d.maxHeadcount && d.maxHeadcount < d.minHeadcount) {
    return { ok: false, error: "최대 인원은 최소 인원보다 커야 합니다." };
  }

  const patch: Record<string, unknown> = {
    name: d.name,
    instagram_handle: handle,
    slug,
    image_url: d.imageUrl?.trim() || null,
    country: d.country?.trim() || null,
    genres: d.genres,
    headline: d.headline?.trim() || null,
    description: d.description?.trim() || null,
    deposit_amount: d.depositAmount ?? null,
    total_price: d.totalPrice ?? null,
    min_headcount: d.minHeadcount ?? null,
    max_headcount: d.maxHeadcount ?? null,
    expected_period: d.expectedPeriod?.trim() || null,
    recruit_deadline: d.recruitDeadline?.trim() ? new Date(d.recruitDeadline).toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  if (nextStatus) {
    patch.status = nextStatus;
    if (nextStatus === "recruiting") patch.recruit_opened_at = new Date().toISOString();
    if (nextStatus === "confirmed") patch.confirmed_at = new Date().toISOString();
  }

  if (d.id) {
    const { data: row, error } = await admin
      .from("workshop_artists")
      .update(patch)
      .eq("id", d.id)
      .select("id, slug")
      .single();
    if (error || !row) {
      if (error?.code === "23505") return { ok: false, error: "같은 인스타그램 또는 slug의 카드가 이미 있습니다." };
      console.error("[adminUpsertWorkshopArtist] update failed:", error);
      return { ok: false, error: GENERIC };
    }
    revalidateWorkshops(row.slug as string | null);
    return { ok: true, data: { id: row.id as string, slug: (row.slug as string) ?? null } };
  }

  const { data: row, error } = await admin
    .from("workshop_artists")
    .insert({ ...patch, status: nextStatus ?? "published" })
    .select("id, slug")
    .single();
  if (error || !row) {
    if (error?.code === "23505") return { ok: false, error: "같은 인스타그램 또는 slug의 카드가 이미 있습니다." };
    console.error("[adminUpsertWorkshopArtist] insert failed:", error);
    return { ok: false, error: GENERIC };
  }
  revalidateWorkshops(row.slug as string | null);
  return { ok: true, data: { id: row.id as string, slug: (row.slug as string) ?? null } };
}

// ── 어드민: 중복 카드 병합 ──────────────────────────────────────────────────

const mergeSchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
});

const MERGE_ERRORS: Record<string, string> = {
  SAME_ARTIST: "같은 카드입니다.",
  SOURCE_NOT_FOUND: "병합할 카드를 찾을 수 없습니다.",
  TARGET_NOT_FOUND: "대상 카드를 찾을 수 없습니다.",
  HAS_RESERVATIONS: "결제가 붙은 카드는 병합할 수 없습니다. 예약 건을 먼저 정리하세요.",
};

/** 중복 카드 병합 — source 의 수요를 target 으로 이관하고 source 는 보관 처리한다. */
export async function adminMergeWorkshopArtistsAction(
  input: z.input<typeof mergeSchema>,
): Promise<ActionResult<{ moved: number }>> {
  await requireAdmin();
  const parsed = mergeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("merge_workshop_artist", {
    p_source: parsed.data.sourceId,
    p_target: parsed.data.targetId,
  });
  if (error) {
    console.error("[adminMergeWorkshopArtists] rpc failed:", error);
    return { ok: false, error: GENERIC };
  }
  const result = data as { ok: boolean; error?: string; moved?: number } | null;
  if (!result?.ok) {
    return { ok: false, error: MERGE_ERRORS[result?.error ?? ""] ?? GENERIC };
  }
  revalidateWorkshops();
  return { ok: true, data: { moved: result.moved ?? 0 } };
}

// ── 어드민: 예약 운영 상태 기록 ──
// 환불은 통합 결제 장부의 2인 승인 흐름에서만 실행한다.

const reservationStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["paid", "transferred", "confirmed"]),
  memo: z.string().trim().max(2000).optional().nullable(),
});

export async function adminSetWorkshopReservationStatusAction(
  input: z.input<typeof reservationStatusSchema>,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = reservationStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }
  const { id, status, memo } = parsed.data;
  const admin = createAdminClient();

  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (memo !== undefined && memo !== null) patch.memo = memo;
  const { error } = await admin.from("workshop_reservations").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateWorkshops();
  return { ok: true };
}

// ── 공개: 안무가 검색 (검색 우선 제출 플로우) ───────────────────────────────
// RPC `search_workshop_artists` 가 DEFINER 로 최소 필드만 반환한다(수요 수 미포함, 상한 20).

const searchSchema = z.object({ q: z.string().trim().min(1).max(80) });

export type WorkshopSearchResult = {
  id: string;
  name: string;
  instagram_handle: string;
  genres: string[] | null;
  country: string | null;
  headline: string | null;
  status: string;
  slug: string | null;
  image_url: string | null;
  /** 'artist' = workshop_artists 카드 / 'dancer' = deetz 댄서 풀(카드 미생성, 탭 시 nominate 경로로 생성·합산) */
  source: "artist" | "dancer";
};

export async function searchWorkshopArtistsAction(
  input: z.input<typeof searchSchema>,
): Promise<ActionResult<{ results: WorkshopSearchResult[] }>> {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return { ok: true, data: { results: [] } };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_workshop_artists", { q: parsed.data.q });
  if (error) {
    console.error("[workshopSearch] rpc failed:", error);
    return { ok: false, error: GENERIC };
  }
  return { ok: true, data: { results: (data ?? []) as WorkshopSearchResult[] } };
}

// ── 어드민: 인스타 핸들 존재 확인 ───────────────────────────────────────────
// 제출된 핸들의 오타를 잡는 보조 수단. ⚠ 인스타그램은 비로그인 요청에 없는 핸들도 200(로그인월)을
// 반환할 수 있어 200 을 "존재 확인"으로 믿지 않는다 — 404 만 신호로 쓰고 나머지는 unknown.
// (실시간 프로필 조회를 UX 에 걸지 않는 이유이기도 하다 — 기획 정본 제안 C.)

export async function adminCheckWorkshopHandleAction(input: {
  artistId: string;
}): Promise<ActionResult<{ status: "ok" | "not_found" | "unknown" }>> {
  await requireAdmin();
  const artistId = z.string().uuid().safeParse(input.artistId);
  if (!artistId.success) return { ok: false, error: "입력값을 확인해 주세요." };

  const admin = createAdminClient();
  const { data: artist } = await admin
    .from("workshop_artists")
    .select("id, instagram_handle")
    .eq("id", artistId.data)
    .maybeSingle();
  if (!artist) return { ok: false, error: "카드를 찾을 수 없습니다." };

  let status: "ok" | "not_found" | "unknown" = "unknown";
  try {
    const res = await fetch(`https://www.instagram.com/${artist.instagram_handle as string}/`, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        accept: "text/html",
      },
    });
    if (res.status === 404) status = "not_found";
  } catch {
    status = "unknown";
  }

  await admin
    .from("workshop_artists")
    .update({ handle_check_status: status, handle_checked_at: new Date().toISOString() })
    .eq("id", artist.id as string);

  revalidateWorkshops();
  return { ok: true, data: { status } };
}

// ── 어드민: 모집 오픈 → 수요자 일괄 안내 (D4: 자동 발송 없음, 어드민 수동 트리거) ──
// preview=true 면 수신자 수만 세고 발송하지 않는다. 실제 발송은 카드당 1회(demand_notified_at)로 제한.

const notifySchema = z.object({
  artistId: z.string().uuid(),
  preview: z.boolean().optional().default(false),
});

export async function adminNotifyWorkshopDemandersAction(
  input: z.input<typeof notifySchema>,
): Promise<ActionResult<{ recipients: number; sent?: number; failed?: number }>> {
  await requireAdmin();
  const parsed = notifySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "입력값을 확인해 주세요." };
  const admin = createAdminClient();

  const { data: artist } = await admin
    .from("workshop_artists")
    .select(
      "id, name, slug, status, deposit_amount, total_price, expected_period, min_headcount, recruit_deadline, demand_notified_at",
    )
    .eq("id", parsed.data.artistId)
    .maybeSingle();
  if (!artist) return { ok: false, error: "카드를 찾을 수 없습니다." };
  if ((artist.status as string) !== "recruiting") {
    return { ok: false, error: "모집 오픈(recruiting) 상태에서만 발송할 수 있습니다." };
  }
  if (artist.demand_notified_at) {
    return {
      ok: false,
      error: `이미 발송했습니다 (${new Date(artist.demand_notified_at as string).toLocaleString("ko-KR")}).`,
    };
  }
  if (!artist.slug) return { ok: false, error: "상세 페이지 slug 가 필요합니다." };

  // 수신자 수집: 폼 이메일 + 로그인 수요자의 계정 이메일. 정규화 값으로 dedup.
  const { data: demands } = await admin
    .from("workshop_demands")
    .select("contact_email, user_id")
    .eq("artist_id", artist.id as string);

  const recipients = new Map<string, string>();
  const userIds: string[] = [];
  for (const row of demands ?? []) {
    const email = (row.contact_email as string | null)?.trim();
    if (email) recipients.set(normalizeContactEmail(email), email);
    else if (row.user_id) userIds.push(row.user_id as string);
  }
  for (const uid of userIds) {
    try {
      const { data: u } = await admin.auth.admin.getUserById(uid);
      const email = u?.user?.email?.trim();
      if (email && !recipients.has(normalizeContactEmail(email))) {
        recipients.set(normalizeContactEmail(email), email);
      }
    } catch {
      // 계정 조회 실패는 건너뛴다 (비치명적)
    }
  }

  if (recipients.size === 0) return { ok: false, error: "이메일이 있는 수요자가 없습니다." };
  if (parsed.data.preview) return { ok: true, data: { recipients: recipients.size } };

  let sent = 0;
  let failed = 0;
  for (const email of recipients.values()) {
    try {
      await sendWorkshopRecruitOpenMail({
        to: email,
        artistName: artist.name as string,
        detailUrl: `https://deetz.kr/workshops/${artist.slug as string}`,
        depositAmount: (artist.deposit_amount as number | null) ?? null,
        totalPrice: (artist.total_price as number | null) ?? null,
        expectedPeriod: (artist.expected_period as string | null) ?? null,
        minHeadcount: (artist.min_headcount as number | null) ?? null,
        recruitDeadline: (artist.recruit_deadline as string | null) ?? null,
      });
      sent += 1;
    } catch (e) {
      failed += 1;
      console.error("[workshopNotify] mail failed:", email, e);
    }
  }

  await admin
    .from("workshop_artists")
    .update({ demand_notified_at: new Date().toISOString() })
    .eq("id", artist.id as string);

  revalidateWorkshops(artist.slug as string);
  return { ok: true, data: { recipients: recipients.size, sent, failed } };
}
