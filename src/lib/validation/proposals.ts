import { z } from "zod";

export const sendProposalSchema = z.object({
  project_id: z.string().uuid(),
  applicant_id: z.string().uuid(),
  cover_message: z.string().trim().max(500).optional().nullable(),
});

export type SendProposalInput = z.infer<typeof sendProposalSchema>;

export const respondProposalSchema = z.object({
  application_id: z.string().uuid(),
  decision: z.enum(["accepted", "declined"]),
});
