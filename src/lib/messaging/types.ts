// 메시지 센터 공용 타입. DB 타입은 permissive 스텁(Database=any)이라 앱 레벨에서 고정한다.

export type ChatSenderRole = "team" | "member" | "system";
export type ChatMessageKind = "text" | "notice" | "action_request" | "system";

/** action_request 카드의 정의(chat_messages.action / broadcast_campaigns.action). */
export type MessageAction = {
  choices: string[];
  /** ISO — 지나면 응답 변경 불가. 없으면 무기한. */
  deadline?: string | null;
  /** 이 선택지를 고르면 자유 입력(detail)을 요구한다. 예: ["일부만 가능"] */
  detail_required_for?: string[];
};

export type ChatMessageRow = {
  id: string;
  room_id: string;
  room_seq: number;
  sender_user_id: string | null;
  sender_role: ChatSenderRole;
  kind: ChatMessageKind;
  body: string;
  application_id: string | null;
  action: MessageAction | null;
  deleted_at: string | null;
  created_at: string;
};

export type RoomActor =
  | { role: "staff"; userId: string }
  | { role: "member"; userId: string; dancerId: string };

export type ChatRoomRow = {
  id: string;
  project_id: string;
  kind: "direct" | "group";
  direct_dancer_id: string | null;
  title: string | null;
  last_seq: number;
  staff_last_read_seq: number;
  awaiting_staff_since: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  last_message_at: string | null;
  archived_at: string | null;
};

/** 운영자 인박스 SLA 단계 — 미답변 경과 기준(회색/주황/빨강). */
export function slaTier(awaitingSince: string | null, now = Date.now()): "none" | "ok" | "warn" | "late" {
  if (!awaitingSince) return "none";
  const hours = (now - new Date(awaitingSince).getTime()) / 3_600_000;
  if (hours >= 24) return "late";
  if (hours >= 4) return "warn";
  return "ok";
}

/** 재시도 백오프(분): 1 → 4 → 16. attempt_count 는 claim 시 이미 +1 된 값이다. */
export function retryBackoffMinutes(attemptCount: number): number {
  return Math.pow(4, Math.max(0, attemptCount - 1));
}

/** 미읽음 에피소드 멱등키 — 미읽음 0→1 전환 시점의 첫 미읽음 seq 로 고정된다. */
export function unreadMailIdemKey(roomId: string, firstUnreadSeq: number): string {
  return `unread_mail:${roomId}:${firstUnreadSeq}`;
}

export function campaignFanoutIdemKey(campaignId: string): string {
  return `campaign_fanout:${campaignId}`;
}

/** 메일·목록 미리보기용 본문 요약 — 줄바꿈 정리 + 길이 제한. */
export function previewText(body: string, max = 80): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max - 1) + "…";
}
