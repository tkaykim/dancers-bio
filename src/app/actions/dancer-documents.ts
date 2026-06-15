"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "./auth";

const BUCKET = "dancer-docs";
type DocType = "id_card" | "bankbook";

const COL: Record<DocType, { path: string; at: string }> = {
  id_card: { path: "id_card_path", at: "id_card_uploaded_at" },
  bankbook: { path: "bankbook_path", at: "bankbook_uploaded_at" },
};

function parseDocType(v: FormDataEntryValue | null): DocType | null {
  const t = (v ?? "").toString();
  return t === "id_card" || t === "bankbook" ? t : null;
}

// 본인(can_act_as_dancer) 또는 슈퍼관리자만 이 댄서의 서류에 접근 가능.
async function canAccessDocs(userId: string, dancerId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.is_admin) return true;
  const { data } = await supabase.rpc("can_act_as_dancer", { d_id: dancerId });
  return data === true;
}

// 브라우저가 비공개 버킷에 직접 업로드한 뒤, 그 path를 프로필에 기록.
export async function saveDancerDocumentPathAction(
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const dancerId = (fd.get("dancer_id") ?? "").toString().trim();
  const docType = parseDocType(fd.get("doc_type"));
  const path = (fd.get("path") ?? "").toString().trim();
  if (!dancerId || !docType || !path)
    return { ok: false, error: "잘못된 요청입니다." };
  // path 위조 방지: 반드시 해당 dancer 폴더 하위여야 함.
  if (!path.startsWith(`${dancerId}/`))
    return { ok: false, error: "잘못된 파일 경로입니다." };
  if (!(await canAccessDocs(user.id, dancerId)))
    return { ok: false, error: "권한이 없습니다." };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("dancer_private_info")
    .select("dancer_id")
    .eq("dancer_id", dancerId)
    .maybeSingle();
  const patch = {
    [COL[docType].path]: path,
    [COL[docType].at]: new Date().toISOString(),
  };
  const { error } = existing
    ? await admin.from("dancer_private_info").update(patch).eq("dancer_id", dancerId)
    : await admin.from("dancer_private_info").insert({ dancer_id: dancerId, ...patch });
  if (error) return { ok: false, error: "저장에 실패했습니다. 다시 시도해 주세요." };

  revalidatePath("/me/settlements");
  revalidatePath("/admin/settlements");
  return { ok: true };
}

// 서명 URL 발급 (60초). 본인 또는 admin.
export async function getDancerDocumentUrlAction(
  dancerId: string,
  docType: DocType,
): Promise<ActionResult<{ url: string }>> {
  const user = await requireUser();
  if (!dancerId || (docType !== "id_card" && docType !== "bankbook"))
    return { ok: false, error: "잘못된 요청입니다." };
  if (!(await canAccessDocs(user.id, dancerId)))
    return { ok: false, error: "권한이 없습니다." };

  const admin = createAdminClient();
  const { data: pi } = await admin
    .from("dancer_private_info")
    .select(COL[docType].path)
    .eq("dancer_id", dancerId)
    .maybeSingle();
  const path = (pi as Record<string, string | null> | null)?.[COL[docType].path];
  if (!path) return { ok: false, error: "등록된 파일이 없습니다." };

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, 60);
  if (error || !data?.signedUrl)
    return { ok: false, error: "파일을 여는 데 실패했습니다." };
  return { ok: true, data: { url: data.signedUrl } };
}

// 서류 삭제 (스토리지 + 경로 비우기). 본인 또는 admin.
export async function deleteDancerDocumentAction(
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const dancerId = (fd.get("dancer_id") ?? "").toString().trim();
  const docType = parseDocType(fd.get("doc_type"));
  if (!dancerId || !docType) return { ok: false, error: "잘못된 요청입니다." };
  if (!(await canAccessDocs(user.id, dancerId)))
    return { ok: false, error: "권한이 없습니다." };

  const admin = createAdminClient();
  const { data: pi } = await admin
    .from("dancer_private_info")
    .select(COL[docType].path)
    .eq("dancer_id", dancerId)
    .maybeSingle();
  const path = (pi as Record<string, string | null> | null)?.[COL[docType].path];
  if (path) await admin.storage.from(BUCKET).remove([path]);

  const { error } = await admin
    .from("dancer_private_info")
    .update({ [COL[docType].path]: null, [COL[docType].at]: null })
    .eq("dancer_id", dancerId);
  if (error) return { ok: false, error: "삭제에 실패했습니다." };

  revalidatePath("/me/settlements");
  revalidatePath("/admin/settlements");
  return { ok: true };
}
