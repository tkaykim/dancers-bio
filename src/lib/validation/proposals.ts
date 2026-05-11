import { z } from "zod";

export const sendProposalSchema = z
  .object({
    project_id: z.string().uuid(),
    applicant_id: z.string().uuid().optional().nullable(),
    team_id: z.string().uuid().optional().nullable(),
    cover_message: z.string().trim().max(500).optional().nullable(),
  })
  .refine(
    (v) => Boolean(v.applicant_id) !== Boolean(v.team_id),
    { message: "applicant_id 또는 team_id 중 하나만 지정해야 합니다." },
  );

export type SendProposalInput = z.infer<typeof sendProposalSchema>;

export const respondProposalSchema = z.object({
  application_id: z.string().uuid(),
  decision: z.enum(["accepted", "declined"]),
});
