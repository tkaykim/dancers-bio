"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loginSchema,
  signupSchema,
  emailSchema,
  newPasswordSchema,
  displayNameLookupSchema,
} from "@/lib/validation/auth";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function signupAction(formData: FormData): Promise<ActionResult> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    display_name: formData.get("display_name"),
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
      data: { display_name: parsed.data.display_name },
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

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function requestPasswordResetAction(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }

  const headerStore = await headers();
  const origin =
    headerStore.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${origin}/reset-password`,
  });

  // 항상 ok 반환 — 이메일 존재 여부 노출 금지
  return { ok: true };
}

function maskEmail(email: string): string {
  const atIdx = email.indexOf("@");
  if (atIdx < 0) return email;
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

export async function findEmailByNameAction(
  formData: FormData,
): Promise<ActionResult<{ maskedEmails: string[] }>> {
  const parsed = displayNameLookupSchema.safeParse({
    display_name: formData.get("display_name"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }

  const supabase = await createClient();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("display_name", parsed.data.display_name)
    .limit(10);

  if (error) {
    return { ok: false, error: "오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  }
  if (!profiles || profiles.length === 0) {
    return { ok: true, data: { maskedEmails: [] } };
  }

  const adminSupabase = createAdminClient();
  const maskedEmails: string[] = [];
  for (const profile of profiles) {
    const { data } = await adminSupabase.auth.admin.getUserById(profile.id);
    if (data.user?.email) {
      maskedEmails.push(maskEmail(data.user.email));
    }
  }

  return { ok: true, data: { maskedEmails } };
}

export async function resetPasswordAction(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = newPasswordSchema.safeParse(formData.get("password"));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    return { ok: false, error: "비밀번호 변경에 실패했습니다. 다시 시도해 주세요." };
  }

  return { ok: true };
}
