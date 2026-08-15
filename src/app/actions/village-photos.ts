"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { VILLAGE_PHOTO_BUCKET, VILLAGE_PHOTO_MAX_BYTES } from "@/lib/village/photos";
import type { ActionResult } from "./auth";

// deetz Village 건물 사진 업로드.
//
// ⚠ 인증 없음 — 대표 지시로 "링크를 아는 사람은 누구나 올릴 수 있게" 열어둔 공개 창구다(/village/upload).
//    그래서 여기서 하는 일은 사진 추가·숨김뿐이고, 다른 데이터는 건드리지 않는다.
//
// ⚠ 파일 본문은 이 서버 액션을 통과하지 않는다.
//    Vercel Functions 요청 본문 한도가 4.5MB라 서버 액션으로 사진을 프록시하면
//    4.5MB를 넘는 사진이 next.config 의 bodySizeLimit 에 닿기도 전에 413 으로 죽는다.
//    그래서 ① 여기서 signed upload URL 만 발급하고 ② 브라우저가 Supabase Storage 로 직접 올린 뒤
//    ③ 업로드된 오브젝트를 확인하고 DB 행을 만든다. (Codex 교차검토 2026-08-15 지적 반영)

const BUCKET = VILLAGE_PHOTO_BUCKET;
/** 옵션당·전체 상한 — 인증이 없으므로 무한 적재만 막는다. */
const MAX_PER_OPTION = 40;
const MAX_TOTAL = 120;

const ALLOWED_MIME = ["image/jpeg", "image/pjpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp", "gif"];

const OPTION_KEYS = ["a", "b", "common"] as const;
export type VillagePhotoOption = (typeof OPTION_KEYS)[number];

export type VillagePhotoRow = {
  id: string;
  option_key: string;
  public_url: string;
  caption: string | null;
  created_at: string;
};

/** 업로드 화면·랜딩이 함께 쓰는 조회. 숨김 처리한 사진은 어느 쪽에도 안 보인다. */
export async function listVillagePhotos(): Promise<VillagePhotoRow[]> {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return [];
  }
  const { data } = await admin
    .from("village_photos")
    .select("id, option_key, public_url, caption, created_at")
    .eq("hidden", false)
    .order("option_key", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(MAX_TOTAL + 60);
  return (data ?? []) as VillagePhotoRow[];
}

function extensionOf(filename: string): string {
  const raw = filename.includes(".") ? filename.split(".").pop() ?? "" : "";
  return raw.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

const signSchema = z.object({
  optionKey: z.enum(OPTION_KEYS),
  filename: z.string().trim().min(1).max(300),
  contentType: z.string().trim().max(120).optional().nullable(),
  size: z.number().int().min(1).max(VILLAGE_PHOTO_MAX_BYTES),
});

/**
 * 1단계: 업로드 자리를 잡고 signed upload URL 을 발급한다.
 * 확장자와 MIME 을 함께 본다 — 아이폰 HEIC 는 브라우저가 `type` 을 빈 문자열로 주는 경우가 있어
 * MIME 만 보면 그대로 통과해버리고, 저장은 되지만 화면에서는 깨져 보인다.
 */
export async function createVillagePhotoUploadUrlAction(
  input: z.input<typeof signSchema>,
): Promise<ActionResult<{ path: string; token: string }>> {
  const parsed = signSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === "size") return { ok: false, error: "사진 1장은 20MB까지 올릴 수 있습니다." };
    return { ok: false, error: "사진 정보를 확인하지 못했습니다." };
  }
  const { optionKey, filename, contentType, size } = parsed.data;

  const ext = extensionOf(filename);
  const mime = (contentType ?? "").toLowerCase();
  if (/hei[cf]/.test(mime) || ["heic", "heif"].includes(ext)) {
    return { ok: false, error: "아이폰 HEIC 사진은 그대로 올리면 화면에서 깨집니다. 사진 앱에서 JPEG로 저장한 뒤 올려 주세요." };
  }
  if (mime && !ALLOWED_MIME.includes(mime)) {
    return { ok: false, error: "JPG·PNG·WEBP·GIF 이미지만 올릴 수 있습니다." };
  }
  // 일부 안드로이드·구형 브라우저는 type 을 빈 문자열로 준다. 그때는 확장자로만 판정한다.
  if (!mime && !ALLOWED_EXT.includes(ext)) {
    return { ok: false, error: "JPG·PNG·WEBP·GIF 이미지만 올릴 수 있습니다." };
  }
  if (size > VILLAGE_PHOTO_MAX_BYTES) {
    return { ok: false, error: "사진 1장은 20MB까지 올릴 수 있습니다." };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "서버 설정 오류로 업로드에 실패했습니다." };
  }

  const { count: total } = await admin
    .from("village_photos")
    .select("id", { count: "exact", head: true })
    .eq("hidden", false);
  if ((total ?? 0) >= MAX_TOTAL) {
    return { ok: false, error: `사진은 전체 ${MAX_TOTAL}장까지 올릴 수 있습니다. 필요 없는 사진을 지운 뒤 다시 시도해 주세요.` };
  }
  const { count: perOption } = await admin
    .from("village_photos")
    .select("id", { count: "exact", head: true })
    .eq("hidden", false)
    .eq("option_key", optionKey);
  if ((perOption ?? 0) >= MAX_PER_OPTION) {
    return { ok: false, error: `한 옵션에는 사진을 ${MAX_PER_OPTION}장까지 올릴 수 있습니다.` };
  }

  // 경로는 UUID 로 만든다 — 타임스탬프+랜덤6자리는 같은 밀리초에 충돌할 여지가 있었다.
  const path = `${optionKey}/${randomUUID()}.${ALLOWED_EXT.includes(ext) ? ext : "jpg"}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return { ok: false, error: `업로드 준비에 실패했습니다: ${error?.message ?? "unknown"}` };
  }
  return { ok: true, data: { path: data.path, token: data.token } };
}

const registerSchema = z.object({
  optionKey: z.enum(OPTION_KEYS),
  path: z.string().trim().min(1).max(400),
  caption: z.string().trim().max(200).optional().nullable(),
});

/**
 * 2단계: 브라우저가 Storage 에 올린 파일을 확인하고 DB 행을 만든다.
 * 실제로 존재하는 오브젝트만 등록해 "행은 있는데 파일이 없는" 깨진 사진을 만들지 않는다.
 */
export async function registerVillagePhotoAction(
  input: z.input<typeof registerSchema>,
): Promise<ActionResult<VillagePhotoRow>> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "사진 정보를 확인하지 못했습니다." };
  const { optionKey, path, caption } = parsed.data;

  // 경로 위조로 다른 버킷·폴더를 가리키지 못하게 막는다.
  if (!path.startsWith(`${optionKey}/`) || path.includes("..")) {
    return { ok: false, error: "잘못된 업로드 경로입니다." };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "서버 설정 오류로 업로드에 실패했습니다." };
  }

  // 파일명은 이 액션이 발급한 UUID 형태만 인정한다 — 같은 폴더의 임의 오브젝트를 등록시키지 못하게.
  const folder = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$/i.test(name)) {
    return { ok: false, error: "잘못된 업로드 경로입니다." };
  }

  // list(search) 는 부분일치 검색이라 이름이 정확히 같은 항목을 직접 골라낸다.
  const { data: found } = await admin.storage.from(BUCKET).list(folder, { search: name, limit: 100 });
  const object = found?.find((item) => item.name === name);
  if (!object) {
    return { ok: false, error: "업로드된 사진을 찾지 못했습니다. 다시 시도해 주세요." };
  }

  // signed URL 발급 때 받은 값은 신고값일 뿐이다. 실제로 올라온 파일을 다시 본다.
  const meta = (object.metadata ?? {}) as { size?: number; mimetype?: string };
  const actualSize = typeof meta.size === "number" ? meta.size : 0;
  const actualMime = (meta.mimetype ?? "").toLowerCase();
  if (actualSize > VILLAGE_PHOTO_MAX_BYTES || (actualMime && !ALLOWED_MIME.includes(actualMime))) {
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, error: "올린 파일이 허용되지 않는 형식이거나 너무 큽니다." };
  }

  // 동시 업로드로 상한이 넘어가지 않게 등록 직전에 한 번 더 센다.
  const { count: liveTotal } = await admin
    .from("village_photos")
    .select("id", { count: "exact", head: true })
    .eq("hidden", false);
  const { count: livePerOption } = await admin
    .from("village_photos")
    .select("id", { count: "exact", head: true })
    .eq("hidden", false)
    .eq("option_key", optionKey);
  if ((liveTotal ?? 0) >= MAX_TOTAL || (livePerOption ?? 0) >= MAX_PER_OPTION) {
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, error: `사진 수 상한(옵션당 ${MAX_PER_OPTION}장·전체 ${MAX_TOTAL}장)에 도달했습니다.` };
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  const { data: row, error } = await admin
    .from("village_photos")
    .insert({
      option_key: optionKey,
      storage_path: path,
      public_url: pub.publicUrl,
      caption: caption?.trim() || null,
    })
    .select("id, option_key, public_url, caption, created_at")
    .single();
  if (error || !row) {
    // 재시도·중복 호출로 같은 path 를 다시 등록하면 storage_path UNIQUE 위반이 난다.
    // 그때 파일을 지우면 이미 등록된 정상 사진이 깨진다 — 기존 행을 그대로 돌려준다.
    if (error?.code === "23505") {
      const { data: existing } = await admin
        .from("village_photos")
        .select("id, option_key, public_url, caption, created_at")
        .eq("storage_path", path)
        .single();
      if (existing) return { ok: true, data: existing as VillagePhotoRow };
      return { ok: false, error: "사진 정보 저장에 실패했습니다." };
    }
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, error: "사진 정보 저장에 실패했습니다." };
  }

  revalidatePath("/village");
  revalidatePath("/village/upload");
  return { ok: true, data: row as VillagePhotoRow };
}

const hideSchema = z.object({ id: z.string().uuid() });

/**
 * 잘못 올린 사진 내리기.
 * 인증 없는 공개 화면이라 **파일을 지우지 않고 숨김 처리만** 한다 —
 * 링크가 도는 상황에서 hard delete 를 열어두면 올린 사진 전부가 복구 불가로 날아간다.
 * (Codex 교차검토 2026-08-15 지적 반영. 실제 파일 정리는 관리자가 따로 한다.)
 */
export async function hideVillagePhotoAction(
  input: z.input<typeof hideSchema>,
): Promise<ActionResult> {
  const parsed = hideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "서버 설정 오류입니다." };
  }

  const { error } = await admin
    .from("village_photos")
    .update({ hidden: true })
    .eq("id", parsed.data.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/village");
  revalidatePath("/village/upload");
  return { ok: true };
}
