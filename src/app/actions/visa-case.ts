"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyVisaCaseToken } from "@/lib/quick-token";
import {
  consultationSlotsFromAnswers,
  hasThreeUniqueConsultationSlots,
  normalizeConsultationSlot,
} from "@/lib/visa/consultation-slots";
import type { ActionResult } from "./auth";

const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "날짜 형식을 확인해 주세요.");

const consultationSlot = z
  .string()
  .trim()
  .refine(
    (value) => normalizeConsultationSlot(value) === value,
    "온라인 미팅 후보 날짜와 시간을 확인해 주세요.",
  );

const followUpSchema = z
  .object({
    token: z.string().min(20).max(1000),
    goal: z.enum(["new_visa", "visa_change", "career", "unsure"]),
    passportExpiry: optionalDate,
    visaExpiry: optionalDate,
    residenceCountry: z.string().trim().max(120),
    immigrationHistory: z.enum(["none", "needs_review", "private_consultation"]),
    auditionAvailability: z.string().trim().max(1500),
    careerHighlights: z.string().trim().max(3000),
    contractReadiness: z.enum(["ready", "needs_translation", "needs_explanation"]),
    settlementNeeds: z
      .array(z.enum(["training", "housing", "korean", "banking", "transport", "none"]))
      .max(5),
    projectOpportunityOptIn: z.boolean(),
    consultationTimezone: z.string().trim().min(1).max(120),
    consultationSlots: z
      .array(consultationSlot)
      .length(3)
      .refine(
        hasThreeUniqueConsultationSlots,
        "서로 다른 온라인 미팅 후보 일정을 3개 선택해 주세요.",
      )
      .optional(),
    consultationAvailability: z.string().trim().min(2).max(1500),
    processAcknowledged: z.literal(true),
    priceAcknowledged: z.literal(true),
  })
  .superRefine((value, context) => {
    const slots =
      value.consultationSlots ??
      consultationSlotsFromAnswers({
        consultationAvailability: value.consultationAvailability,
      });
    if (!hasThreeUniqueConsultationSlots(slots)) {
      context.addIssue({
        code: "custom",
        path: ["consultationSlots"],
        message: "서로 다른 온라인 미팅 후보 일정을 3개 선택해 주세요.",
      });
    }
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
      next_action: "온라인 상담 일정 협의",
      declined_at: null,
      decline_reason: null,
      decline_reason_detail: null,
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

// 지원자가 "지금은 진행하지 않겠다"를 직접 남기는 경로.
// 사유는 5지선다이고, other일 때만 직접입력을 필수로 받는다.
const declineSchema = z
  .object({
    token: z.string().min(20).max(1000),
    reason: z.enum(["other_agency", "price", "schedule", "not_ready", "other"]),
    reasonDetail: z.string().trim().max(1000),
  })
  .superRefine((value, context) => {
    if (value.reason === "other" && value.reasonDetail.length < 2) {
      context.addIssue({
        code: "custom",
        path: ["reasonDetail"],
        message: "기타 사유를 직접 입력해 주세요.",
      });
    }
  });

export type VisaCaseDeclineInput = z.input<typeof declineSchema>;

export async function submitVisaCaseDeclineAction(
  input: VisaCaseDeclineInput,
): Promise<ActionResult<{ declinedAt: string }>> {
  const parsed = declineSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }

  const applicationId = verifyVisaCaseToken(parsed.data.token);
  if (!applicationId) {
    return { ok: false, error: "링크가 유효하지 않습니다." };
  }

  const declinedAt = new Date().toISOString();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("dancer_visa_applications")
    .update({
      declined_at: declinedAt,
      decline_reason: parsed.data.reason,
      decline_reason_detail: parsed.data.reasonDetail || null,
      status: "on_hold",
      case_stage: "on_hold",
      next_action: "지원자 요청으로 진행 보류",
    })
    .eq("id", applicationId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath(`/visa/case/${parsed.data.token}`);
  revalidatePath("/admin/visa");
  return { ok: true, data: { declinedAt } };
}

const resumeSchema = z.object({ token: z.string().min(20).max(1000) });

export async function resumeVisaCaseAction(
  input: z.input<typeof resumeSchema>,
): Promise<ActionResult<{ resumed: true }>> {
  const parsed = resumeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "입력값을 확인해 주세요." };
  }

  const applicationId = verifyVisaCaseToken(parsed.data.token);
  if (!applicationId) {
    return { ok: false, error: "링크가 유효하지 않습니다." };
  }

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("dancer_visa_applications")
    .select("follow_up_submitted_at")
    .eq("id", applicationId)
    .maybeSingle();
  const alreadySubmitted = Boolean(
    (current as { follow_up_submitted_at?: string | null } | null)?.follow_up_submitted_at,
  );

  const { data, error } = await admin
    .from("dancer_visa_applications")
    .update({
      declined_at: null,
      decline_reason: null,
      decline_reason_detail: null,
      status: alreadySubmitted ? "reviewing" : "new",
      case_stage: alreadySubmitted ? "triage_submitted" : "application_received",
      next_action: alreadySubmitted ? "온라인 상담 일정 협의" : "추가 정보 입력 대기",
    })
    .eq("id", applicationId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath(`/visa/case/${parsed.data.token}`);
  revalidatePath("/admin/visa");
  return { ok: true, data: { resumed: true } };
}
