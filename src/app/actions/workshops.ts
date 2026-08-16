"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getUser, requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWorkshopNominationOpsMail } from "@/lib/notify/workshop-mails";
import {
  compactInstagramHandle,
  namesLookSimilar,
  normalizeInstagramHandle,
  suggestSlug,
  WORKSHOP_STATUSES,
  type WorkshopStatus,
} from "@/lib/workshops/shared";
import type { ActionResult } from "./auth";

// deetz Workshop — 수요 접수(비로그인 허용) + 어드민 큐레이션.
// workshop_* 테이블은 전부 RLS default-deny(service-role 전용)라 admin client로만 접근한다.

const GENERIC = "오류가 발생했습니다. 다시 시도해 주세요.";

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
): Promise<ActionResult<{ artistId: string; already: boolean }>> {
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

  // 1) 대상 안무가 카드 확정 (vote = 조회, nominate = 핸들 기준 upsert)
  //    같은 안무가가 표기 차이로 중복 카드가 되는 경우의 수를 흡수한다:
  //    - 핸들 완전 일치 → 같은 카드 (unique index)
  //    - 핸들 compact 일치(j.blaze/j_blaze/jblaze) → 같은 카드로 자동 합산
  //    - 이름만 유사(성만·이름만·표기차) → 새 카드를 만들되 possible_duplicate_of 로 표시(운영자 병합)
  let artistId = d.artistId ?? null;
  let artistName = d.artistName?.trim() ?? "";
  let artistHandle = "";
  let artistSlug: string | null = null;
  let isNewArtist = false;

  if (artistId) {
    const { data: artist } = await admin
      .from("workshop_artists")
      .select("id, name, instagram_handle, slug, status")
      .eq("id", artistId)
      .maybeSingle();
    if (!artist) return { ok: false, error: "안무가 카드를 찾을 수 없습니다." };
    artistName = artist.name as string;
    artistHandle = artist.instagram_handle as string;
    artistSlug = (artist.slug as string) ?? null;
  } else {
    artistHandle = normalizeInstagramHandle(d.instagramHandle ?? "");
    if (!artistHandle) return { ok: false, error: "인스타그램 아이디를 확인해 주세요." };

    // 카드 수가 작으므로(수백 규모) 전량 읽어 코드에서 비교한다.
    const { data: candidates } = await admin
      .from("workshop_artists")
      .select("id, name, instagram_handle, slug, status")
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
    } else {
      const { data: created, error: createError } = await admin
        .from("workshop_artists")
        .insert({
          name: artistName,
          instagram_handle: artistHandle,
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

  // 2) 수요 레코드 적재 (unique 인덱스가 중복을 막는다)
  const { error: demandError } = await admin.from("workshop_demands").insert({
    artist_id: artistId,
    source: d.artistId ? "vote" : "nominate",
    contact_email: contactEmail,
    contact_instagram: contactInstagram,
    user_id: user?.id ?? null,
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

  // 3) 운영자 알림 (신규 수요만, 비치명적)
  if (!already) {
    try {
      const { count } = await admin
        .from("workshop_demands")
        .select("id", { count: "exact", head: true })
        .eq("artist_id", artistId);
      await sendWorkshopNominationOpsMail({
        artistName,
        instagramHandle: artistHandle || normalizeInstagramHandle(d.instagramHandle ?? ""),
        isNewArtist,
        wantType: null,
        comment: d.comment?.trim() || null,
        contactEmail,
        contactInstagram,
        demandCount: count ?? 1,
      });
    } catch (e) {
      console.error("[workshopDemand] ops mail failed (non-fatal):", e);
    }
  }

  revalidateWorkshops(artistSlug);
  return { ok: true, data: { artistId: artistId!, already } };
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

// ── 어드민: 예약 상태 기록 (환불·양도·참가확정 — 실제 환불은 PG 콘솔에서 수동) ──

const reservationStatusSchema = z.object({
  id: z.string().uuid(),
  // recovery_required(돈은 받았으나 자동 확정 실패)는 운영자가 paid 로 살리거나 refunded 로 닫는다.
  status: z.enum(["paid", "cancelled", "refunded", "transferred", "confirmed"]),
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
  if (status === "refunded") patch.refunded_at = new Date().toISOString();

  const { error } = await admin.from("workshop_reservations").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateWorkshops();
  return { ok: true };
}
