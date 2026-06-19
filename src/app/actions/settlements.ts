"use server";

import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { canManageProject, requireAdmin, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_WITHHOLDING_RATE, calcSettlement, formatWon } from "@/lib/settlement";
import { sendGmailEmail } from "@/lib/gmail";
import { buildWithdrawalRequestEmail } from "@/lib/notify/settlement-mail";
import { notify } from "@/lib/notify";
import type { ActionResult } from "./auth";

const SITE = "https://deetz.kr";

function parseWon(v: FormDataEntryValue | null): number | null {
  const t = (v ?? "").toString().replace(/[,\s원]/g, "").trim();
  if (!t) return null;
  const n = Math.round(Number(t));
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000_000 ? n : null;
}

function strOrNull(fd: FormData, k: string): string | null {
  const v = (fd.get(k) ?? "").toString().trim();
  return v ? v : null;
}

// 보내는분 통장표시 메모: 우리 통장에 찍힐 식별 문구(프로젝트+댄서).
// 통장표시는 길이 제한이 있어, 댄서명은 보존하고 프로젝트명은 남는 길이만큼만.
function transferMemo(project: string, dancer: string): string {
  const MAX = 14;
  const d = (dancer ?? "").replace(/\s/g, "");
  const p = (project ?? "").replace(/\s/g, "");
  const room = Math.max(0, MAX - d.length);
  return (p.slice(0, room) + d).slice(0, MAX);
}

// 파일명 타임스탬프 (KST yyyyMMdd_HHmm).
function kstStamp(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}${g("month")}${g("day")}_${g("hour")}${g("minute")}`;
}

async function isAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  return data?.is_admin === true;
}

// 로그인 사용자가 "본인 댄서로서" 다룰 수 있는 dancer_id 집합 (profile_id = uid).
async function myDancerIds(userId: string): Promise<Set<string>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("dancers")
    .select("id")
    .eq("profile_id", userId);
  return new Set((data ?? []).map((d: { id: string }) => d.id as string));
}

// 댄서 출금신청 → 경영지원실(슈퍼관리자 전원)에게 인앱 + 웹푸시 알림 (비치명적).
// 담당자가 코크핏을 열어보지 않아도 "처리할 출금 신청이 들어왔다"를 즉시 인지.
async function notifyAdminsWithdrawalRequested(
  settlementId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: s } = await admin
      .from("settlements")
      .select("dancer_id, project_id, gross_amount, withholding_rate")
      .eq("id", settlementId)
      .maybeSingle();
    if (!s) return;

    const [{ data: d }, { data: p }, { data: admins }] = await Promise.all([
      admin.from("dancers").select("stage_name").eq("id", s.dancer_id).maybeSingle(),
      admin.from("projects").select("title").eq("id", s.project_id).maybeSingle(),
      admin.from("profiles").select("id").eq("is_admin", true),
    ]);
    const ids = (admins ?? []).map((a: { id: string }) => a.id as string);
    if (ids.length === 0) return;

    const name = (d?.stage_name as string) ?? "댄서";
    const title = (p?.title as string) ?? "프로젝트";
    const net = calcSettlement(
      s.gross_amount as number,
      Number(s.withholding_rate),
    ).net;
    const url = "/admin/settlements";

    await Promise.all(
      ids.map((rid) =>
        notify({
          recipientId: rid,
          type: "settlement_withdrawal_requested",
          payload: {
            kind: "withdrawal_requested",
            settlement_id: settlementId,
            dancer_name: name,
            project_title: title,
            net_amount: net,
            url,
          },
          push: {
            title: "출금 신청 접수",
            body: `${name}님이 '${title}' 정산 출금을 신청했어요 (${formatWon(net)} 입금 예정).`,
            url,
          },
        }),
      ),
    );
  } catch (err) {
    console.error(
      "[notifyAdminsWithdrawalRequested] failed (non-fatal):",
      err,
    );
  }
}

// ── 매니저: 합격 댄서에게 세전 정산금액 등록/수정 ──────────────────────────
export async function setSettlementAmountAction(
  fd: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  const dancerId = (fd.get("dancer_id") ?? "").toString().trim();
  const gross = parseWon(fd.get("gross_amount"));
  const memo = strOrNull(fd, "memo");
  if (!projectId || !dancerId)
    return { ok: false, error: "잘못된 요청입니다." };
  if (gross == null)
    return { ok: false, error: "정산금액(세전, 원)을 숫자로 입력해 주세요." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("settlements")
    .select("id, status")
    .eq("project_id", projectId)
    .eq("dancer_id", dancerId)
    .maybeSingle();

  if (existing?.status === "paid")
    return { ok: false, error: "이미 입금완료된 건은 금액을 수정할 수 없습니다." };

  let id: string;
  if (existing) {
    const { data, error } = await supabase
      .from("settlements")
      .update({ gross_amount: gross, memo })
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    id = data.id as string;
  } else {
    const { data, error } = await supabase
      .from("settlements")
      .insert({
        project_id: projectId,
        dancer_id: dancerId,
        gross_amount: gross,
        withholding_rate: DEFAULT_WITHHOLDING_RATE,
        memo,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    id = data.id as string;
  }

  revalidatePath(`/projects/${projectId}/applicants`);
  revalidatePath("/me/settlements");
  revalidatePath("/admin/settlements");
  return { ok: true, data: { id } };
}

// ── 댄서: 입금 계좌 등록/수정 (민감정보 → dancer_private_info) ──────────────
export async function savePayoutAccountAction(
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const dancerId = (fd.get("dancer_id") ?? "").toString().trim();
  const bank_name = strOrNull(fd, "bank_name");
  const bank_code = strOrNull(fd, "bank_code");
  // 계좌번호는 하이픈·공백 제거(대량이체 파일은 숫자만).
  const bank_account_number = (fd.get("bank_account_number") ?? "")
    .toString()
    .replace(/[\s-]/g, "")
    .trim() || null;
  const bank_account_holder = strOrNull(fd, "bank_account_holder");
  if (!dancerId) return { ok: false, error: "잘못된 요청입니다." };
  if (!bank_name || !bank_account_number || !bank_account_holder)
    return { ok: false, error: "은행·계좌번호·예금주를 모두 입력해 주세요." };

  // 본인 댄서 또는 슈퍼관리자(담당자가 사진 보고 대신 입력)만 허용.
  if (!(await isAdmin(user.id))) {
    const mine = await myDancerIds(user.id);
    if (!mine.has(dancerId))
      return { ok: false, error: "본인 댄서 프로필만 계좌를 등록할 수 있습니다." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("dancer_private_info")
    .select("dancer_id")
    .eq("dancer_id", dancerId)
    .maybeSingle();
  const patch = { bank_name, bank_code, bank_account_number, bank_account_holder };
  const { error } = existing
    ? await admin.from("dancer_private_info").update(patch).eq("dancer_id", dancerId)
    : await admin.from("dancer_private_info").insert({ dancer_id: dancerId, ...patch });
  if (error) return { ok: false, error: "저장에 실패했습니다. 다시 시도해 주세요." };

  revalidatePath("/me/settlements");
  revalidatePath("/admin/settlements");
  return { ok: true };
}

// ── 관리자: 출금신청 안내 메일 발송 (정산완료 → 댄서에게 신청 요청) ─────────
export async function sendWithdrawalRequestEmailAction(
  fd: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const settlementId = (fd.get("settlement_id") ?? "").toString().trim();
  if (!settlementId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: s } = await admin
    .from("settlements")
    .select(
      "id, project_id, dancer_id, gross_amount, withholding_rate, status, project:projects!settlements_project_id_fkey ( title )",
    )
    .eq("id", settlementId)
    .maybeSingle();
  if (!s) return { ok: false, error: "정산 내역을 찾을 수 없습니다." };
  if (s.status !== "pending")
    return { ok: false, error: "정산완료(출금신청 전) 건만 안내를 보낼 수 있어요." };

  const proj = Array.isArray(s.project) ? s.project[0] ?? null : s.project;
  const projectTitle = (proj?.title as string) ?? "프로젝트";

  // 댄서 정보 + 수신 이메일 (지원 계정 우선 → private_info → 클레임 계정)
  const { data: d } = await admin
    .from("dancers")
    .select("stage_name, profile_id")
    .eq("id", s.dancer_id)
    .maybeSingle();
  const name = (d?.stage_name as string) ?? "댄서";

  let email: string | null = null;
  const { data: app } = await admin
    .from("applications")
    .select("applicant_id")
    .eq("project_id", s.project_id)
    .eq("dancer_id", s.dancer_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const acctId = (app?.applicant_id as string | null) ?? (d?.profile_id as string | null);
  if (acctId) {
    const { data: u } = await admin.auth.admin.getUserById(acctId);
    email = u?.user?.email ?? null;
  }
  if (!email) {
    const { data: pi } = await admin
      .from("dancer_private_info")
      .select("email")
      .eq("dancer_id", s.dancer_id)
      .maybeSingle();
    email = (pi?.email as string | null) ?? null;
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email) || /\.con$/i.test(email))
    return { ok: false, error: "댄서의 이메일을 찾을 수 없어요. 계정/연락처를 확인해 주세요." };

  const calc = calcSettlement(
    s.gross_amount as number,
    Number(s.withholding_rate),
  );
  const mail = buildWithdrawalRequestEmail({
    name,
    projectTitle,
    grossText: formatWon(calc.gross),
    taxText: formatWon(calc.tax),
    netText: formatWon(calc.net),
    url: `${SITE}/me/settlements`,
  });
  const r = await sendGmailEmail({ to: email, ...mail });
  if (!r.ok) return { ok: false, error: "메일 발송에 실패했습니다." };
  return { ok: true };
}

// ── 주민등록번호(외국인등록번호) 저장 (슈퍼관리자 또는 본인) ───────────────
export async function saveResidentNumberAction(
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const dancerId = (fd.get("dancer_id") ?? "").toString().trim();
  const rrn = (fd.get("resident_registration_number") ?? "")
    .toString()
    .replace(/\s/g, "")
    .trim();
  if (!dancerId) return { ok: false, error: "잘못된 요청입니다." };
  if (!rrn) return { ok: false, error: "주민(외국인)등록번호를 입력해 주세요." };

  if (!(await isAdmin(user.id))) {
    const mine = await myDancerIds(user.id);
    if (!mine.has(dancerId))
      return { ok: false, error: "권한이 없습니다." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("dancer_private_info")
    .select("dancer_id")
    .eq("dancer_id", dancerId)
    .maybeSingle();
  const patch = { resident_registration_number: rrn };
  const { error } = existing
    ? await admin.from("dancer_private_info").update(patch).eq("dancer_id", dancerId)
    : await admin.from("dancer_private_info").insert({ dancer_id: dancerId, ...patch });
  if (error) return { ok: false, error: "저장에 실패했습니다. 다시 시도해 주세요." };

  revalidatePath("/admin/settlements");
  revalidatePath("/me/settlements");
  return { ok: true };
}

// ── 댄서: 출금 신청 (pending → requested). 계좌 등록 필수. ──────────────────
export async function requestWithdrawalAction(
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const settlementId = (fd.get("settlement_id") ?? "").toString().trim();
  if (!settlementId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: s } = await admin
    .from("settlements")
    .select("id, dancer_id, status")
    .eq("id", settlementId)
    .maybeSingle();
  if (!s) return { ok: false, error: "정산 내역을 찾을 수 없습니다." };

  const mine = await myDancerIds(user.id);
  if (!mine.has(s.dancer_id as string))
    return { ok: false, error: "본인 정산 건만 출금 신청할 수 있습니다." };
  if (s.status === "paid")
    return { ok: false, error: "이미 입금완료된 건입니다." };
  if (s.status === "requested")
    return { ok: false, error: "이미 출금 신청한 건입니다." };
  if (s.status !== "pending")
    return { ok: false, error: "출금 신청할 수 없는 상태입니다." };

  // 계좌 등록 확인
  const { data: pi } = await admin
    .from("dancer_private_info")
    .select("bank_name, bank_account_number, bank_account_holder")
    .eq("dancer_id", s.dancer_id)
    .maybeSingle();
  if (!pi?.bank_name || !pi?.bank_account_number || !pi?.bank_account_holder)
    return { ok: false, error: "먼저 입금 계좌를 등록해 주세요." };

  const { error } = await admin
    .from("settlements")
    .update({ status: "requested", requested_at: new Date().toISOString() })
    .eq("id", settlementId);
  if (error) return { ok: false, error: "신청에 실패했습니다. 다시 시도해 주세요." };

  // 경영지원실(슈퍼관리자)에게 출금신청 접수 알림 (비치명적).
  await notifyAdminsWithdrawalRequested(settlementId);

  revalidatePath("/me/settlements");
  revalidatePath("/admin/settlements");
  return { ok: true };
}

// ── 관리자(담당자): 실제 통장 이체 후 '이체 완료 처리' (requested → paid) ────
// 앱은 금전을 직접 이체하지 않는다. 담당자가 통장에서 이체한 사실을 기록만 한다.
export async function markSettlementPaidAction(
  fd: FormData,
): Promise<ActionResult> {
  const admin_profile = await requireAdmin();
  const settlementId = (fd.get("settlement_id") ?? "").toString().trim();
  if (!settlementId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: s } = await admin
    .from("settlements")
    .select("id, status")
    .eq("id", settlementId)
    .maybeSingle();
  if (!s) return { ok: false, error: "정산 내역을 찾을 수 없습니다." };
  if (s.status === "paid")
    return { ok: false, error: "이미 입금완료 처리된 건입니다." };

  const { error } = await admin
    .from("settlements")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_by: admin_profile.id,
    })
    .eq("id", settlementId);
  if (error) return { ok: false, error: "처리에 실패했습니다. 다시 시도해 주세요." };

  revalidatePath("/admin/settlements");
  revalidatePath("/me/settlements");
  return { ok: true };
}

// ── 관리자: 여러 건 일괄 입금완료 처리 ─────────────────────────────────────
export async function markSettlementsPaidAction(
  fd: FormData,
): Promise<ActionResult<{ updated: number }>> {
  const admin_profile = await requireAdmin();
  let ids: string[] = [];
  try {
    const p = JSON.parse((fd.get("ids") ?? "[]").toString());
    if (Array.isArray(p)) ids = p.filter((x) => typeof x === "string");
  } catch {
    ids = [];
  }
  if (ids.length === 0) return { ok: false, error: "선택된 건이 없습니다." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("settlements")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_by: admin_profile.id,
    })
    .in("id", ids)
    .neq("status", "paid")
    .select("id");
  if (error) return { ok: false, error: "처리에 실패했습니다. 다시 시도해 주세요." };

  revalidatePath("/admin/settlements");
  revalidatePath("/me/settlements");
  return { ok: true, data: { updated: (data ?? []).length } };
}

// ── 관리자: 선택한 정산 건 → 우리은행 '다계좌이체' 업로드 파일(.xls) 생성 ─────
// [GRIGO] 다계좌이체양식.xls 와 동일한 6열 구조(헤더 없음):
//   A 입금은행 / B 입금계좌번호 / C 이체금액(실수령) / D 보내는분 통장표시 / E 받는분 통장표시 / F 집금(CMS)번호
// 실제 이체는 사람이 우리WON비즈에 업로드 → OTP 승인. 이 액션은 파일만 만든다(돈 안 나감).
export async function buildTransferFileAction(
  fd: FormData,
): Promise<
  ActionResult<{
    filename: string;
    base64: string;
    included: number;
    skipped: number;
  }>
> {
  await requireAdmin();
  let ids: string[] = [];
  try {
    const p = JSON.parse((fd.get("ids") ?? "[]").toString());
    if (Array.isArray(p)) ids = p.filter((x) => typeof x === "string");
  } catch {
    ids = [];
  }
  if (ids.length === 0) return { ok: false, error: "선택된 건이 없습니다." };

  const admin = createAdminClient();
  const { data: sRows } = await admin
    .from("settlements")
    .select(
      "id, dancer_id, gross_amount, withholding_rate, status, project:projects!settlements_project_id_fkey ( title )",
    )
    .in("id", ids);
  if (!sRows || sRows.length === 0)
    return { ok: false, error: "정산 내역을 찾을 수 없습니다." };

  const dancerIds = [...new Set(sRows.map((r) => r.dancer_id as string))];
  const [{ data: dRows }, { data: piRows }] = await Promise.all([
    admin.from("dancers").select("id, stage_name").in("id", dancerIds),
    admin
      .from("dancer_private_info")
      .select("dancer_id, bank_name, bank_account_number, bank_account_holder")
      .in("dancer_id", dancerIds),
  ]);
  const nameById = new Map(
    (dRows ?? []).map((d) => [d.id as string, (d.stage_name as string) ?? ""]),
  );
  const acctById = new Map(
    (piRows ?? []).map((p) => [p.dancer_id as string, p]),
  );

  const rows: (string | number)[][] = [];
  let skipped = 0;
  for (const s of sRows) {
    if (s.status === "paid") {
      skipped++;
      continue;
    }
    const acct = acctById.get(s.dancer_id as string);
    const accountNumber = (acct?.bank_account_number ?? "")
      .toString()
      .replace(/[\s-]/g, "");
    if (!acct?.bank_name || !accountNumber || !acct?.bank_account_holder) {
      skipped++;
      continue;
    }
    const net = calcSettlement(
      s.gross_amount as number,
      Number(s.withholding_rate),
    ).net;
    const proj = Array.isArray(s.project) ? s.project[0] ?? null : s.project;
    const projectTitle = (proj?.title as string) ?? "";
    const dancerName = nameById.get(s.dancer_id as string) ?? "";
    rows.push([
      acct.bank_name as string, // A 입금은행
      accountNumber, // B 입금계좌번호 (숫자만, 문자열 — 앞 0 보존)
      net, // C 이체금액 = 실수령액(세전−3.3%)
      transferMemo(projectTitle, dancerName), // D 보내는분 통장표시
      "", // E 받는분 통장표시
      "", // F 집금(CMS)번호
    ]);
  }
  if (rows.length === 0)
    return {
      ok: false,
      error: "이체할 수 있는 건이 없어요(계좌 미등록 또는 이미 입금완료).",
    };

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const base64 = XLSX.write(wb, { type: "base64", bookType: "biff8" });

  return {
    ok: true,
    data: {
      filename: `deetz_다계좌이체_${kstStamp()}.xls`,
      base64,
      included: rows.length,
      skipped,
    },
  };
}
