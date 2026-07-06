import { requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { PopupAdminForm, type PopupRow } from "./PopupAdminForm";

export const dynamic = "force-dynamic";

// 사이트 진입 팝업 관리 (미수·정산 제보 안내 등). 슈퍼관리자 전용.
export default async function AdminPopupPage() {
  await requireAdmin();

  const admin = createAdminClient();
  const { data } = await admin
    .from("site_popups")
    .select("id, title, body, cta_label, cta_href, is_active, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 py-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight">사이트 팝업 관리</h1>
        <p className="mt-1 text-sm text-ink-2">
          웹사이트 진입 시 1회 표시되는 공지 팝업입니다. (닫기=세션 숨김 / 다시 보지 않음=영구 숨김)
        </p>
      </div>
      <PopupAdminForm initial={(data as PopupRow | null) ?? null} />
    </div>
  );
}
