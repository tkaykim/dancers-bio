"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "./auth";

// deetz Village 건물 사진 업로드.
//
// ⚠ 인증 없음 — 대표 지시로 "링크를 아는 사람은 누구나 올릴 수 있게" 열어둔 공개 창구다(/village/upload).
//    그래서 여기서 하는 일은 사진 추가·삭제뿐이고, 다른 데이터는 건드리지 않는다.
//    사진은 랜딩(/village)에 바로 노출되므로 링크는 필요한 사람에게만 전달한다.

const BUCKET = "village-photos";
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];

const OPTION_KEYS = ["a", "b", "common"] as const;
export type VillagePhotoOption = (typeof OPTION_KEYS)[number];

export type VillagePhotoRow = {
  id: string;
  option_key: string;
  public_url: string;
  caption: string | null;
  created_at: string;
};

/** 업로드 화면·랜딩이 함께 쓰는 조회. hidden 은 랜딩에서만 제외한다. */
export async function listVillagePhotos(includeHidden = false): Promise<VillagePhotoRow[]> {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return [];
  }
  let q = admin
    .from("village_photos")
    .select("id, option_key, public_url, caption, created_at")
    .order("option_key", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(200);
  if (!includeHidden) q = q.eq("hidden", false);
  const { data } = await q;
  return (data ?? []) as VillagePhotoRow[];
}

const uploadSchema = z.object({
  optionKey: z.enum(OPTION_KEYS),
  caption: z.string().trim().max(200).optional().nullable(),
});

/**
 * 사진 1장 업로드. 여러 장은 클라이언트가 파일마다 순차 호출한다.
 * (한 요청에 몰아넣으면 서버 액션 body 한도에 먼저 걸린다.)
 */
export async function uploadVillagePhotoAction(form: FormData): Promise<ActionResult<VillagePhotoRow>> {
  const parsed = uploadSchema.safeParse({
    optionKey: form.get("optionKey"),
    caption: form.get("caption"),
  });
  if (!parsed.success) return { ok: false, error: "옵션을 선택해 주세요." };

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "사진 파일이 없습니다." };
  if (file.size > MAX_BYTES) return { ok: false, error: "사진 1장은 8MB까지 올릴 수 있습니다." };
  if (file.type && !ALLOWED.includes(file.type.toLowerCase())) {
    return { ok: false, error: "이미지 파일만 올릴 수 있습니다." };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "서버 설정 오류로 업로드에 실패했습니다." };
  }

  const ext = (file.name.split(".").pop() ?? "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const path = `${parsed.data.optionKey}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (upErr) return { ok: false, error: `업로드 실패: ${upErr.message}` };

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);

  const { data: row, error: insErr } = await admin
    .from("village_photos")
    .insert({
      option_key: parsed.data.optionKey,
      storage_path: path,
      public_url: pub.publicUrl,
      caption: parsed.data.caption?.trim() || null,
    })
    .select("id, option_key, public_url, caption, created_at")
    .single();
  if (insErr || !row) {
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, error: "사진 정보 저장에 실패했습니다." };
  }

  revalidatePath("/village");
  revalidatePath("/village/upload");
  return { ok: true, data: row as VillagePhotoRow };
}

const deleteSchema = z.object({ id: z.string().uuid() });

/** 잘못 올린 사진 되돌리기. 업로드와 같은 공개 화면에서 쓰므로 인증을 요구하지 않는다. */
export async function deleteVillagePhotoAction(
  input: z.input<typeof deleteSchema>,
): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "서버 설정 오류입니다." };
  }

  const { data: row } = await admin
    .from("village_photos")
    .select("id, storage_path")
    .eq("id", parsed.data.id)
    .single();
  if (!row) return { ok: false, error: "사진을 찾을 수 없습니다." };

  const { error } = await admin.from("village_photos").delete().eq("id", parsed.data.id);
  if (error) return { ok: false, error: error.message };
  await admin.storage.from(BUCKET).remove([row.storage_path as string]);

  revalidatePath("/village");
  revalidatePath("/village/upload");
  return { ok: true };
}
