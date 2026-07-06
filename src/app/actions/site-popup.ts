"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "./auth";

// 사이트 진입 팝업 관리 (site_popups). 슈퍼관리자 전용.
// 정책: 활성 팝업은 항상 1개 이하 — 활성화 시 나머지 자동 비활성.

function clamp(v: FormDataEntryValue | null, max: number): string {
  const t = (v ?? "").toString().trim();
  return t.length > max ? t.slice(0, max) : t;
}

// 기존 팝업 수정 (id 유지 → '다시 보지 않음' 사용자에겐 계속 숨김)
export async function updateSitePopupAction(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = clamp(fd.get("id"), 64);
  const title = clamp(fd.get("title"), 200);
  const body = clamp(fd.get("body"), 2000);
  const cta_label = clamp(fd.get("cta_label"), 60) || null;
  const cta_href = clamp(fd.get("cta_href"), 500) || null;
  const is_active = fd.get("is_active") === "true";
  if (!id) return { ok: false, error: "잘못된 요청입니다." };
  if (!title) return { ok: false, error: "제목을 입력해 주세요." };

  const admin = createAdminClient();
  if (is_active) {
    await admin.from("site_popups").update({ is_active: false }).neq("id", id);
  }
  const { error } = await admin
    .from("site_popups")
    .update({ title, body, cta_label, cta_href, is_active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/popup");
  return { ok: true };
}

// 새 팝업으로 등록 (새 id → '다시 보지 않음' 했던 사용자에게도 다시 노출)
export async function createSitePopupAction(fd: FormData): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  const title = clamp(fd.get("title"), 200);
  const body = clamp(fd.get("body"), 2000);
  const cta_label = clamp(fd.get("cta_label"), 60) || null;
  const cta_href = clamp(fd.get("cta_href"), 500) || null;
  const is_active = fd.get("is_active") === "true";
  if (!title) return { ok: false, error: "제목을 입력해 주세요." };

  const admin = createAdminClient();
  if (is_active) {
    await admin.from("site_popups").update({ is_active: false }).eq("is_active", true);
  }
  const { data, error } = await admin
    .from("site_popups")
    .insert({ title, body, cta_label, cta_href, is_active })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "등록 실패" };
  revalidatePath("/admin/popup");
  return { ok: true, data: { id: data.id as string } };
}
