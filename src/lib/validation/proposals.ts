import { z } from "zod";

// 다이렉트 제안은 댄서(dancer_id) 또는 팀(team_id) 하나를 대상으로 한다.
// dancer_id는 미claim(profile_id NULL) 댄서도 가리킬 수 있다 — 라이브 스키마의
// applications_dancer_team_xor(dancer_id XOR team_id) 제약과 정확히 일치.
export const sendProposalSchema = z
  .object({
    project_id: z.string().uuid(),
    dancer_id: z.string().uuid().optional().nullable(),
    team_id: z.string().uuid().optional().nullable(),
    cover_message: z.string().trim().max(500).optional().nullable(),
  })
  .refine((v) => Boolean(v.dancer_id) !== Boolean(v.team_id), {
    message: "dancer_id 또는 team_id 중 하나만 지정해야 합니다.",
  });

export type SendProposalInput = z.infer<typeof sendProposalSchema>;

export const respondProposalSchema = z.object({
  application_id: z.string().uuid(),
  decision: z.enum(["accepted", "declined"]),
});
