import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { retryBackoffMinutes } from "./types";

// 지연 발송 아웃박스. Vercel Cron(1분)이 claim_message_jobs(SKIP LOCKED)로 선점한다.
// Vercel Cron 은 중복 호출·누락이 정상 스펙 — 멱등키(idem_key UNIQUE)와
// 조건부 완료(status·attempt_count 가드)로 흡수한다.

export type MessageJob = {
  id: string;
  job_type: string;
  idem_key: string;
  available_at: string;
  status: "pending" | "processing" | "done" | "cancelled" | "failed";
  room_id: string | null;
  dancer_id: string | null;
  campaign_id: string | null;
  payload: Record<string, unknown>;
  locked_until: string | null;
  attempt_count: number;
  last_error: string | null;
};

const MAX_ATTEMPTS = 3;

/** true = 잡 존재 보장(신규 생성 또는 멱등 중복). false = 실제 실패 — 호출부가 처리해야 한다. */
export async function enqueueJob(params: {
  jobType: string;
  idemKey: string;
  availableAt: Date;
  roomId?: string | null;
  dancerId?: string | null;
  campaignId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.from("message_jobs").insert({
    job_type: params.jobType,
    idem_key: params.idemKey,
    available_at: params.availableAt.toISOString(),
    room_id: params.roomId ?? null,
    dancer_id: params.dancerId ?? null,
    campaign_id: params.campaignId ?? null,
    payload: params.payload ?? {},
  });
  if (!error) return true;
  // 23505 = 같은 에피소드 잡이 이미 있음 — 멱등이므로 성공으로 본다.
  if (error.code === "23505") return true;
  console.error("[message_jobs] enqueue failed:", error.message);
  return false;
}

/** 방의 대기 중 잡 취소(읽음·답장·처리 완료 시). jobTypes 미지정이면 전체. */
export async function cancelPendingRoomJobs(
  roomId: string,
  jobTypes?: string[],
  filter?: (job: Pick<MessageJob, "payload" | "job_type">) => boolean,
): Promise<void> {
  const admin = createAdminClient();
  let query = admin
    .from("message_jobs")
    .select("id, job_type, payload")
    .eq("room_id", roomId)
    .eq("status", "pending");
  if (jobTypes && jobTypes.length > 0) query = query.in("job_type", jobTypes);
  const { data: jobs } = await query;
  const targets = (jobs ?? []).filter((j) =>
    filter ? filter(j as Pick<MessageJob, "payload" | "job_type">) : true,
  );
  if (targets.length === 0) return;
  await admin
    .from("message_jobs")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .in(
      "id",
      targets.map((j) => (j as { id: string }).id),
    )
    .eq("status", "pending");
}

export async function cancelJobByIdemKey(idemKey: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("message_jobs")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("idem_key", idemKey)
    .eq("status", "pending");
}

export type JobHandlerResult =
  | { done: true; note?: string }
  /** 성공적으로 청크를 처리했고 잔여가 남음 — 실패가 아니므로 attempt 를 소모하지 않는다. */
  | { continue: true }
  | { retry: true; error: string };

export type JobHandlers = Record<
  string,
  (job: MessageJob) => Promise<JobHandlerResult>
>;

/** 크론 스위퍼 본체. 핸들러는 호출부(크론 route)에서 주입한다 — 순환 import 방지. */
export async function processDueJobs(
  handlers: JobHandlers,
  limit = 25,
): Promise<{ claimed: number; done: number; retried: number; failed: number }> {
  const admin = createAdminClient();
  const now = new Date();

  // janitor — lease 만료된 processing 회수(좀비 워커).
  await admin
    .from("message_jobs")
    .update({ status: "pending", updated_at: now.toISOString() })
    .eq("status", "processing")
    .lt("locked_until", now.toISOString())
    .lt("attempt_count", MAX_ATTEMPTS);
  await admin
    .from("message_jobs")
    .update({ status: "failed", last_error: "lease expired", updated_at: now.toISOString() })
    .eq("status", "processing")
    .lt("locked_until", now.toISOString())
    .gte("attempt_count", MAX_ATTEMPTS);

  const { data: claimed, error: claimError } = await admin.rpc("claim_message_jobs", {
    p_limit: limit,
    p_lease_seconds: 240,
  });
  if (claimError) {
    console.error("[message_jobs] claim failed:", claimError.message);
    return { claimed: 0, done: 0, retried: 0, failed: 0 };
  }
  const jobs = (claimed ?? []) as MessageJob[];
  let done = 0;
  let retried = 0;
  let failed = 0;

  for (const job of jobs) {
    const handler = handlers[job.job_type];
    let result: JobHandlerResult;
    try {
      result = handler
        ? await handler(job)
        : { done: true, note: `unknown job_type ${job.job_type}` };
    } catch (err) {
      result = { retry: true, error: (err as Error).message?.slice(0, 500) ?? "unknown error" };
    }

    // stale 워커 가드 — 내가 클레임한 시점의 attempt_count 일 때만 상태를 만질 수 있다.
    const guard = admin
      .from("message_jobs")
      .update(
        "continue" in result && result.continue
          ? {
              // 청크 성공 후 잔여 처리 — 실패가 아니므로 attempt 를 0으로 되돌린다.
              status: "pending",
              attempt_count: 0,
              available_at: new Date().toISOString(),
              locked_until: null,
              updated_at: new Date().toISOString(),
            }
          : "done" in result && result.done
            ? {
                status: "done",
                last_error: result.note ?? null,
                locked_until: null,
                updated_at: new Date().toISOString(),
              }
            : job.attempt_count >= MAX_ATTEMPTS
              ? {
                  status: "failed",
                  last_error: (result as { error: string }).error,
                  locked_until: null,
                  updated_at: new Date().toISOString(),
                }
              : {
                  status: "pending",
                  last_error: (result as { error: string }).error,
                  available_at: new Date(
                    Date.now() + retryBackoffMinutes(job.attempt_count) * 60_000,
                  ).toISOString(),
                  locked_until: null,
                  updated_at: new Date().toISOString(),
                },
      )
      .eq("id", job.id)
      .eq("status", "processing")
      .eq("attempt_count", job.attempt_count);
    await guard;

    if ("done" in result && result.done) done += 1;
    else if ("continue" in result && result.continue) retried += 0;
    else if (job.attempt_count >= MAX_ATTEMPTS) failed += 1;
    else retried += 1;
  }

  return { claimed: jobs.length, done, retried, failed };
}
