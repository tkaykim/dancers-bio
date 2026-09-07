import type { CampaignData } from "./types";

export type SubmissionStatus =
  "pending_review" | "changes_requested" | "approved";
export type UploadStatus = "missing" | SubmissionStatus;
export const uploadLabels: Record<UploadStatus, string> = {
  missing: "미제출",
  pending_review: "검토 대기",
  changes_requested: "수정 요청",
  approved: "확인 완료",
};
export type SubmissionSettings = {
  project_id: string;
  enabled: boolean;
  board_id: string | null;
  deadline: string | null;
  client_visible: boolean;
  version: number;
};
export type Participant = {
  id: string;
  project_id: string;
  board_member_id: string | null;
  application_id: string | null;
  dancer_id: string | null;
  display_name: string;
  ig_handle: string | null;
  owner_label: string;
  deadline: string | null;
  active: boolean;
  note: string;
  version: number;
};
export type Submission = {
  id: string;
  project_id: string;
  participant_id: string;
  post_id: string;
  status: SubmissionStatus;
  feedback: string;
  submitted_at: string;
  source: "participant" | "admin";
  reviewed_at: string | null;
  replaced_at: string | null;
  version: number;
};
export type SubmissionPost = {
  id: string;
  post_url: string;
  short_code: string;
  status: string;
};
export type SubmissionData = {
  settings: SubmissionSettings;
  participants: Participant[];
  submissions: Submission[];
  posts: SubmissionPost[];
};
export type PublicUploads = {
  total: number;
  approved: number;
  participants: { memberId: string | null; name?: string; urls: string[] }[];
};
export function currentSubmissions(
  data: SubmissionData,
  participantId: string,
) {
  return data.submissions.filter(
    (s) => s.participant_id === participantId && !s.replaced_at,
  );
}
export function usableApproval(s: Submission, data: SubmissionData) {
  return (
    s.status === "approved" &&
    !s.replaced_at &&
    data.posts.some(
      (p) => p.id === s.post_id && !["removed", "excluded"].includes(p.status),
    )
  );
}
export function uploadStatus(
  data: SubmissionData,
  participantId: string,
): UploadStatus {
  const subs = currentSubmissions(data, participantId);
  if (subs.some((s) => usableApproval(s, data))) return "approved";
  if (subs.some((s) => s.status === "pending_review")) return "pending_review";
  if (subs.some((s) => s.status === "changes_requested"))
    return "changes_requested";
  // A previously reviewed post can later be removed; keep the review decision separate.
  if (subs.length) return "pending_review";
  return "missing";
}
export function uploadCounts(data: SubmissionData) {
  const counts = {
    total: 0,
    missing: 0,
    pending_review: 0,
    changes_requested: 0,
    approved: 0,
  };
  for (const p of data.participants.filter((p) => p.active)) {
    counts.total++;
    counts[uploadStatus(data, p.id)]++;
  }
  return counts;
}
export function isOverdue(
  data: SubmissionData,
  p: Participant,
  now = Date.now(),
) {
  const due = p.deadline ?? data.settings.deadline;
  return (
    p.active &&
    !!due &&
    Date.parse(due) < now &&
    uploadStatus(data, p.id) !== "approved"
  );
}
// Explicit public projection. Internal notes, user ids, feedback and review checks never escape.
export function publicUploads(data: SubmissionData): PublicUploads {
  const participants = data.participants
    .filter((p) => p.active)
    .map((p) => ({
      memberId: p.board_member_id,
      name: p.display_name,
      urls: [
        ...new Set(
          currentSubmissions(data, p.id)
            .filter((s) => usableApproval(s, data))
            .flatMap((s) =>
              data.posts
                .filter((post) => post.id === s.post_id)
                .map((post) => post.post_url),
            ),
        ),
      ],
    }));
  return {
    total: participants.length,
    approved: participants.filter((p) => p.urls.length).length,
    participants,
  };
}
export function approvedCampaignData(
  data: CampaignData,
  submissions: SubmissionData,
): CampaignData {
  // Closing intake must never switch a configured campaign back to unreviewed legacy reporting.
  if (!submissions.settings.version) return data;
  const active = new Set(
    submissions.participants.filter((p) => p.active).map((p) => p.id),
  );
  const ids = new Set(
    submissions.submissions
      .filter(
        (s) => active.has(s.participant_id) && usableApproval(s, submissions),
      )
      .map((s) => s.post_id),
  );
  return {
    ...data,
    posts: data.posts.filter((p) => ids.has(p.id)),
    metrics: data.metrics.filter((m) => ids.has(m.post_id)),
  };
}
export function participantView(
  data: SubmissionData,
  id: string,
): SubmissionData {
  const submissions = data.submissions.filter((s) => s.participant_id === id);
  return {
    settings: { ...data.settings, board_id: null, client_visible: false },
    participants: data.participants
      .filter((p) => p.id === id)
      .map((p) => ({ ...p, owner_label: "", note: "" })),
    submissions,
    posts: data.posts.filter((p) =>
      submissions.some((s) => s.post_id === p.id),
    ),
  };
}
export function submissionError(e: unknown) {
  const raw = e instanceof Error ? e.message : "";
  const messages: Record<string, string> = {
    CAMPAIGN_DEADLINE_REASON: "개별 마감 변경 사유를 내부 메모에 남겨 주세요.",
    CAMPAIGN_STALE:
      "다른 변경이 먼저 저장되었습니다. 새로고침한 뒤 다시 확인해 주세요.",
    CAMPAIGN_DENIED: "이 참여자의 게시물을 처리할 권한이 없습니다.",
    CAMPAIGN_INVALID_URL: "Instagram 게시물 링크를 확인해 주세요.",
    CAMPAIGN_COLLAB_REVIEW:
      "다른 참여자에게 연결된 게시물입니다. 공동작업 연결은 담당자에게 요청해 주세요.",
    CAMPAIGN_CHECKS_REQUIRED:
      "공개 접근, 참여 계정, 제작 조건을 확인해 주세요.",
    CAMPAIGN_FEEDBACK_REQUIRED: "참여자에게 전달할 수정 사유를 입력해 주세요.",
    CAMPAIGN_POST_UNAVAILABLE:
      "삭제 또는 집계 제외된 게시물입니다. 운영자에게 확인해 주세요.",
    CAMPAIGN_ALREADY_LINKED:
      "이미 제출한 링크입니다. 해당 제출 건에서 수정해 주세요.",
    CAMPAIGN_BOARD_LOCKED:
      "참여자가 등록된 뒤에는 기준 보드를 바꿀 수 없습니다.",
    CAMPAIGN_LINK_REASON: "회원 연결을 확인한 근거를 입력해 주세요.",
    CAMPAIGN_APPLICATION_LOCKED:
      "지원서에 연결된 회원은 이 화면에서 바꿀 수 없습니다.",
    CAMPAIGN_MEMBER_MISSING: "로그인 계정에 연결된 댄서를 선택해 주세요.",
  };
  return (
    messages[raw] ??
    "저장하지 못했습니다. 입력 내용과 연결 상태를 확인해 주세요."
  );
}
