"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyVisaCaseToken } from "@/lib/quick-token";
import type { ActionResult } from "./auth";

const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "날짜 형식을 확인해 주세요.");

const followUpSchema = z.object({
  token: z.string().min(20).max(1000),
  goal: z.enum(["new_visa", "visa_change", "career", "unsure"]),
  passportExpiry: optionalDate,
  visaExpiry: optionalDate,
  residenceCountry: z.string().trim().max(120),
  immigrationHistory: z.enum(["none", "needs_review", "private_consultation"]),
  auditionAvailability: z.string().trim().min(2).max(1500),
  careerHighlights: z.string().trim().max(3000),
  contractReadiness: z.enum(["ready", "needs_translation", "needs_explanation"]),
  settlementNeeds: z
    .array(z.enum(["housing", "korean", "banking", "transport", "none"]))
    .max(5),
  projectOpportunityOptIn: z.boolean(),
  consultationTimezone: z.string().trim().min(1).max(120),
  consultationAvailability: z.string().trim().min(2).max(1500),
  processAcknowledged: z.literal(true),
  priceAcknowledged: z.literal(true),
});

export type VisaCaseFollowUpInput = z.input<typeof followUpSchema>;

export async function submitVisaCaseFollowUpAction(
  input: VisaCaseFollowUpInput,
): Promise<ActionResult<{ submittedAt: string }>> {
  const parsed = followUpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }

  const applicationId = verifyVisaCaseToken(parsed.data.token);
  if (!applicationId) {
    return { ok: false, error: "링크가 유효하지 않습니다." };
  }

  const { token: _token, projectOpportunityOptIn, ...answers } = parsed.data;
  void _token;
  const submittedAt = new Date().toISOString();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("dancer_visa_applications")
    .update({
      follow_up_answers: answers,
      follow_up_submitted_at: submittedAt,
      project_opportunity_opt_in: projectOpportunityOptIn,
      case_stage: "triage_submitted",
      status: "reviewing",
      next_action: "오디션 일정 협의",
    })
    .eq("id", applicationId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath(`/visa/case/${parsed.data.token}`);
  revalidatePath("/admin/visa");
  return { ok: true, data: { submittedAt } };
}
