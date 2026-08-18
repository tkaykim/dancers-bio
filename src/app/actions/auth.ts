"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, signupSchema } from "@/lib/validation/auth";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function signupAction(formData: FormData): Promise<ActionResult> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    display_name: formData.get("display_name"),
    phone: formData.get("phone"),
    phone_country: formData.get("phone_country"),
    phone_unavailable: formData.get("phone_unavailable"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        display_name: parsed.data.display_name,
        phone: parsed.data.phone ?? "",
        phone_unavailable: parsed.data.phone_unavailable,
        phone_country: parsed.data.phone_country,
      },
    },
  });
  if (error) {
    if (error.message.toLowerCase().includes("registered")) {
      return { ok: false, error: "이미 가입된 이메일입니다." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function loginAction(formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  // Auto-claim any pre-curated dancer rows that were provisioned for this
  // email (e.g. via grigoent agency-pool migration). Safe no-op when none.
  try {
    await supabase.rpc("auto_claim_dancers_for_email");
  } catch {
    // Non-fatal — the user still logs in; backup cron will retry.
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function forgotPasswordAction(
  formData: FormData,
): Promise<ActionResult> {
  const email = (formData.get("email") ?? "").toString().trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "올바른 이메일 주소를 입력해 주세요." };
  }
  const supabase = await createClient();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://deetz.kr";
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });
  return { ok: true };
}

export async function changePasswordAction(
  formData: FormData,
): Promise<ActionResult> {
  const password = (formData.get("password") ?? "").toString();
  if (password.length < 8 || password.length > 72) {
    return { ok: false, error: "비밀번호는 8~72자여야 합니다." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };

  // After password set (e.g. invite-flow recovery), auto-claim any
  // pre-curated dancer rows provisioned for this email.
  try {
    await supabase.rpc("auto_claim_dancers_for_email");
  } catch {
    // Non-fatal.
  }

  return { ok: true };
}

/**
 * 비밀번호 설정/로그인 직후 호출 — 지원 이메일로 미리 만들어둔(curation) 댄서 프로필을
 * 현재 계정에 자동 연결. updateUser는 하지 않음 (호출 측에서 이미 비번 설정 완료).
 */
export async function autoClaimDancersAction(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "로그인 세션을 찾을 수 없습니다." };
  }
  try {
    await supabase.rpc("auto_claim_dancers_for_email");
  } catch {
    // 연결 실패는 치명적 아님 — 다음 로그인 때 재시도 가능.
  }
  return { ok: true };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
