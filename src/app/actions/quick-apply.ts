"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/alimtalk/solapi";
import { z } from "zod";

/**
 * 로그인 없이 공고에 접수한다.
 *
 * 왜 필요한가
 *   챌린지처럼 단발성으로 사람을 많이 모아야 하는 공고에서, 회원가입·로그인 단계가
 *   유입을 깎아먹는다. 그래서 이름·이메일·전화번호·인스타 핸들만 받고
 *   계정은 서버가 뒤에서 만든다. 지원자는 가입 화면을 보지 않는다.
 *
 * 계정을 아예 안 만들 수는 없다. 지급(3.3% 원천징수)·제출 토큰·중복 차단·발송 이력이
 * 전부 applications/dancers 행에 걸려 있기 때문이다. 그래서 '계정 없음'이 아니라
 * '계정을 감춤'으로 간다.
 *
 * 인스타 핸들은 필수다. Drive 파일명이 핸들이고, 중복 접수 차단과 업로드 확인도
 * 핸들 기준이라, 없으면 영상을 받아도 누구 것인지 대조할 수 없다.
 *
 * 접수되면 제출 토큰까지 만들어 업로드 링크를 즉시 돌려준다.
 * 가이드라인 메일은 기존 오토파일럿이 발송한다(이미 토큰이 있으면 재생성하지 않는다).
 */

const Input = z.object({
  name: z.string().trim().min(1, "이름을 입력해 주세요.").max(40),
  email: z.string().trim().toLowerCase().email("이메일 형식을 확인해 주세요."),
  phone: z.string().trim().min(1, "전화번호를 입력해 주세요."),
  instagram: z.string().trim().min(1, "인스타그램 아이디를 입력해 주세요."),
});

export type QuickApplyResult =
  | { ok: true; submitUrl: string; state: "new" | "existing" | "rejoined" }
  | { ok: false; error: string };

/** 입력이 URL이든 @붙은 형태든 순수 핸들만 남긴다. */
function toHandle(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "")
    .trim();
}

export async function quickApplyAction(
  shortCode: string,
  formData: FormData,
): Promise<QuickApplyResult> {
  const parsed = Input.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    instagram: formData.get("instagram"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }
  const { name, email } = parsed.data;

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { ok: false, error: "전화번호를 다시 확인해 주세요." };

  const handle = toHandle(parsed.data.instagram);
  if (!handle || /\s/.test(handle)) {
    return { ok: false, error: "인스타그램 아이디를 다시 확인해 주세요." };
  }

  const admin = createAdminClient();

  // ── 공고 확인 ────────────────────────────────────────────────
  const { data: project } = await admin
    .from("projects")
    .select("id, status, visibility, application_deadline, recruitment_count, deleted_at")
    .eq("short_code", shortCode)
    .maybeSingle();

  if (!project || project.deleted_at) return { ok: false, error: "공고를 찾을 수 없습니다." };
  if (project.status !== "open") return { ok: false, error: "마감된 공고입니다." };
  if (project.visibility !== "public") return { ok: false, error: "공개 공고가 아닙니다." };
  if (project.application_deadline && new Date(project.application_deadline) < new Date()) {
    return { ok: false, error: "지원 마감일이 지났습니다." };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.deetz.kr";

  // ── 이미 접수했는지 (핸들 기준) ──────────────────────────────
  // 같은 사람이 두 번 넣으면 Drive 파일명이 겹쳐 누구 영상인지 구분할 수 없다.
  // 막기만 하면 "안 된다"만 보이므로, 기존 업로드 링크를 다시 알려준다.
  //
  // ⚠ 단, 지원이 accepted 일 때만 바로 돌려준다.
  //   포기(declined)·철회(withdrawn) 상태에서 링크만 주면 제출 페이지가
  //   "아직 참여가 확정되지 않았습니다"로 막아 막다른 길이 된다.
  //   그 경우는 아래로 흘려보내 지원을 다시 accepted 로 되돌린다.
  const { data: dupSub } = await admin
    .from("project_submissions")
    .select("token, application_id")
    .eq("project_id", project.id)
    .ilike("instagram_handle", handle)
    .maybeSingle();
  if (dupSub?.token) {
    const { data: dupApp } = await admin
      .from("applications")
      .select("id, status, archived_at")
      .eq("id", dupSub.application_id)
      .maybeSingle();

    if (dupApp && !dupApp.archived_at) {
      const rejoined = dupApp.status !== "accepted";
      if (rejoined) {
        // 포기했다가 마음을 바꾼 경우. 새 지원을 만들면 같은 핸들의 제출 행이 둘이 되어
        // Drive 파일명이 겹치므로, 기존 지원을 되살려 같은 토큰을 계속 쓴다.
        await admin
          .from("applications")
          .update({ status: "accepted", responded_at: new Date().toISOString(), rejection_reason: null })
          .eq("id", dupApp.id);
      }
      return {
        ok: true,
        submitUrl: `${siteUrl}/submit/${dupSub.token}`,
        state: rejoined ? "rejoined" : "existing",
      };
    }
  }

  // ── 정원 ─────────────────────────────────────────────────────
  const cap = project.recruitment_count ?? 0;
  if (cap > 0) {
    const { count } = await admin
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id)
      .eq("status", "accepted")
      .is("archived_at", null);
    if ((count ?? 0) >= cap) return { ok: false, error: "모집 정원이 마감되었습니다." };
  }

  // ── 계정 (없으면 만든다) ─────────────────────────────────────
  // 먼저 만들어 보고, 이미 있다는 에러가 오면 그때 찾는다.
  // 순서를 뒤집으면(먼저 조회) 신규 지원자마다 전수 조회가 돌아 느려진다.
  let userId: string | null = null;
  {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { display_name: name, signup_source: "quick_apply" },
    });

    if (created?.user) {
      userId = created.user.id;
    } else {
      const already = /already|exists|registered|duplicate/i.test(createErr?.message ?? "");
      if (!already) {
        return { ok: false, error: "접수 처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요." };
      }
      // 이미 가입된 이메일이면 기존 계정을 그대로 쓴다. 새로 만들면 지원 이력이 갈린다.
      userId = await findUserIdByEmail(admin, email);
      if (!userId) {
        return { ok: false, error: "이미 가입된 이메일입니다. 로그인 후 지원해 주세요." };
      }
    }
  }

  // ── 프로필 ───────────────────────────────────────────────────
  await admin
    .from("profiles")
    .upsert({ id: userId, display_name: name, phone }, { onConflict: "id" });

  // ── 댄서 ─────────────────────────────────────────────────────
  // 기존 지원자와 같은 모양으로 만든다(가이드라인 메일이 social_links.instagram 을 읽는다).
  let dancerId: string | null = null;
  {
    const { data: existing } = await admin
      .from("dancers")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();

    if (existing) {
      dancerId = existing.id;
      await admin
        .from("dancers")
        .update({ social_links: { instagram: `https://www.instagram.com/${handle}` } })
        .eq("id", dancerId);
    } else {
      const { data: made, error: dErr } = await admin
        .from("dancers")
        .insert({
          stage_name: name,
          korean_name: name,
          profile_id: userId,
          social_links: { instagram: `https://www.instagram.com/${handle}` },
          approval_status: "pending",
          is_active: true,
        })
        .select("id")
        .single();
      if (dErr || !made) return { ok: false, error: "접수 처리 중 문제가 생겼습니다." };
      dancerId = made.id;
    }
  }

  // ── 지원 ─────────────────────────────────────────────────────
  // 바로 accepted 로 둔다. 30분마다 도는 오토파일럿을 기다리게 하면
  // 그 사이 이탈한다. 가이드라인 메일은 오토파일럿이 이어서 보낸다.
  let applicationId: string | null = null;
  {
    const { data: existing } = await admin
      .from("applications")
      .select("id, status")
      .eq("project_id", project.id)
      .eq("applicant_id", userId)
      .is("archived_at", null)
      .maybeSingle();

    if (existing) {
      applicationId = existing.id;
      if (existing.status !== "accepted") {
        await admin
          .from("applications")
          .update({ status: "accepted", responded_at: new Date().toISOString(), rejection_reason: null })
          .eq("id", applicationId);
      }
    } else {
      const { data: made, error: aErr } = await admin
        .from("applications")
        .insert({
          project_id: project.id,
          applicant_id: userId,
          dancer_id: dancerId,
          source: "apply",
          status: "accepted",
          responded_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (aErr || !made) return { ok: false, error: "접수 처리 중 문제가 생겼습니다." };
      applicationId = made.id;
    }
  }

  // ── 제출 토큰 ────────────────────────────────────────────────
  const { data: sub } = await admin
    .from("project_submissions")
    .select("token")
    .eq("application_id", applicationId)
    .maybeSingle();

  let token = sub?.token ?? null;
  if (!token) {
    const { data: made, error: sErr } = await admin
      .from("project_submissions")
      .insert({
        project_id: project.id,
        application_id: applicationId,
        dancer_id: dancerId,
        instagram_handle: handle,
        display_name: name,
      })
      .select("token")
      .single();
    if (sErr || !made) return { ok: false, error: "접수는 되었지만 업로드 링크 생성에 실패했습니다. 메일로 다시 안내드리겠습니다." };
    token = made.token;
  }

  return { ok: true, submitUrl: `${siteUrl}/submit/${token}`, state: "new" };
}

/** auth.users 에서 이메일로 id 를 찾는다. admin API 에 단건 조회가 없어 페이지를 훑는다. */
async function findUserIdByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}
