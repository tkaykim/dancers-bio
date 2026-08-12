export const CLIENT_DECISIONS = [
  "undecided",
  "selected",
  "hold",
  "excluded",
] as const;

export type ClientDecision = (typeof CLIENT_DECISIONS)[number];

export const CANDIDATE_STATUSES = ["pending", "accepted", "confirmed"] as const;

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export type ClientReviewSettings = {
  enabled?: boolean;
  candidateStatuses?: CandidateStatus[];
  applySelectedAs?: "accepted" | "confirmed";
};

export function normalizeClientDecision(value: unknown): ClientDecision | null {
  return typeof value === "string" &&
    (CLIENT_DECISIONS as readonly string[]).includes(value)
    ? (value as ClientDecision)
    : null;
}

export function normalizeCandidateStatuses(value: unknown): CandidateStatus[] {
  if (!Array.isArray(value)) return ["pending", "accepted", "confirmed"];
  const normalized = CANDIDATE_STATUSES.filter((status) => value.includes(status));
  return normalized.length > 0
    ? normalized
    : ["pending", "accepted", "confirmed"];
}

export function applicationMatchesCandidateStatuses(
  application: { status: string; confirmedAt: string | null },
  candidateStatuses: CandidateStatus[],
): boolean {
  if (application.confirmedAt) {
    return candidateStatuses.includes("confirmed");
  }
  if (application.status === "accepted" && candidateStatuses.includes("accepted")) {
    return true;
  }
  return application.status === "pending" && candidateStatuses.includes("pending");
}
