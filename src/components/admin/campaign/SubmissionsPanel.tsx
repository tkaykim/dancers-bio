"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  mutateSubmissionAction,
  refreshSubmissionsAction,
  searchSubmissionMembersAction,
  submissionEventsAction,
} from "@/app/actions/campaign-submissions";
import {
  currentSubmissions,
  isOverdue,
  publicUploads,
  uploadCounts,
  uploadLabels,
  uploadStatus,
  type Participant,
  type Submission,
  type SubmissionData,
} from "@/lib/campaign/submissions";
import { SubmissionForm } from "@/components/campaign/SubmissionForm";
import { UploadProgress } from "@/components/campaign/UploadProgress";
import { buttonClass, inputClass } from "./Controls";
import { date, tableClass } from "@/components/campaign/ResultsReport";

function localDate(value: string | null) {
  return value
    ? new Date(Date.parse(value) + 9 * 3600000).toISOString().slice(0, 16)
    : "";
}
function isoDate(value: string) {
  return value ? new Date(`${value}:00+09:00`).toISOString() : null;
}
export function SubmissionsPanel({
  initial,
  boards,
}: {
  initial: SubmissionData;
  boards: { id: string; title: string | null }[];
}) {
  const router = useRouter(),
    [data, setData] = useState(initial);
  const [q, setQ] = useState(""),
    [filter, setFilter] = useState("all"),
    [owner, setOwner] = useState("all"),
    [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null),
    [preview, setPreview] = useState(false),
    [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const project = data.settings.project_id,
    counts = uploadCounts(data);
  async function reload() {
    setData(await refreshSubmissionsAction(project));
    router.refresh();
  }
  async function mutate(
    action: "sync" | "configure",
    input: Record<string, unknown>,
  ) {
    setMessage("");
    start(async () => {
      try {
        const r = await mutateSubmissionAction(project, action, input);
        if (!r.ok) setMessage(r.error);
        else {
          setMessage(
            action === "sync"
              ? `${r.data.added}명을 추가했습니다. 기존 참여자는 유지됩니다.`
              : "설정을 저장했습니다.",
          );
          await reload();
        }
      } catch {
        setMessage("저장 결과를 확인하지 못했습니다. 새로고침해 주세요.");
      }
    });
  }
  const owners = [
    ...new Set(data.participants.map((p) => p.owner_label).filter(Boolean)),
  ];
  const items = data.participants
    .filter((p) => {
      if (filter === "inactive" ? p.active : !p.active) return false;
      if (
        !`${p.display_name} ${p.ig_handle ?? ""} ${p.owner_label}`
          .toLowerCase()
          .includes(q.toLowerCase())
      )
        return false;
      if (owner !== "all" && p.owner_label !== owner) return false;
      if (filter === "overdue") return isOverdue(data, p);
      return (
        ["all", "inactive"].includes(filter) ||
        uploadStatus(data, p.id) === filter
      );
    })
    .sort((a, b) => {
      if (filter === "missing")
        return (
          (Date.parse(a.deadline ?? data.settings.deadline ?? "") || Infinity) -
          (Date.parse(b.deadline ?? data.settings.deadline ?? "") || Infinity)
        );
      const latest = (p: Participant) =>
        Math.max(
          0,
          ...currentSubmissions(data, p.id).map((s) =>
            Date.parse(s.submitted_at),
          ),
        );
      return (
        latest(b) - latest(a) ||
        a.display_name.localeCompare(b.display_name, "ko")
      );
    });
  const pages = Math.max(1, Math.ceil(items.length / 50)),
    currentPage = Math.min(page, pages);
  const person = data.participants.find((p) => p.id === selected);
  const unlinked = data.posts.filter(
    (p) =>
      !["removed", "excluded"].includes(p.status) &&
      !data.submissions.some((s) => s.post_id === p.id),
  );
  return (
    <section className="space-y-5">
      {unlinked.length > 0 && (
        <details className="rounded-xl border border-amber-300 p-4">
          <summary className="cursor-pointer font-semibold">
            참여자 미연결 게시물 {unlinked.length}개
          </summary>
          <p className="my-3 text-sm text-ink-3">
            등록된 링크를 확정 참여자에게 연결해 주세요. 연결 전에는 제출 완료
            수에 포함되지 않습니다.
          </p>
          <div className="space-y-3">
            {unlinked.map((post) => (
              <UnlinkedPost
                key={post.id}
                post={post}
                data={data}
                onSaved={reload}
              />
            ))}
          </div>
        </details>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold">제출 현황</h2>
        <span className="text-sm text-ink-3">확정 참여 {counts.total}명</span>
        <button
          className={buttonClass}
          disabled={pending || !data.settings.version}
          onClick={() => mutate("sync", {})}
        >
          확정 명단에서 추가
        </button>
        <button className={buttonClass} onClick={() => setPreview(!preview)}>
          클라이언트 보기 미리보기
        </button>
      </div>
      <details
        className="rounded-xl border border-border bg-card p-4"
        open={!data.settings.enabled}
      >
        <summary className="cursor-pointer font-semibold">
          제출·공개 설정
        </summary>
        <form
          key={data.settings.version}
          className="mt-4 flex flex-wrap items-end gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            mutate("configure", {
              version: data.settings.version,
              enabled: f.get("enabled") === "on",
              board_id: f.get("board") || null,
              deadline: isoDate(String(f.get("deadline") || "")),
              client_visible: f.get("visible") === "on",
            });
          }}
        >
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={data.settings.enabled}
            />
            본인 제출 사용
          </label>
          <label className="text-sm">
            확정 명단 기준
            <select
              name="board"
              className={`${inputClass} block`}
              defaultValue={data.settings.board_id ?? ""}
            >
              <option value="">최종 확정 지원서</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title ?? "캐스팅 보드"}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            기본 마감 (한국시간)
            <input
              name="deadline"
              type="datetime-local"
              className={`${inputClass} block`}
              defaultValue={localDate(data.settings.deadline)}
            />
          </label>
          <label className="flex max-w-xs gap-2 text-sm">
            <input
              type="checkbox"
              name="visible"
              defaultChecked={data.settings.client_visible}
            />
            확인 완료 링크를 클라이언트 보드에 공개
          </label>
          <button className={buttonClass} disabled={pending}>
            설정 저장
          </button>
        </form>
        <p className="mt-3 text-xs text-ink-3">
          명단 추가는 선택한 보드의 확정자만 가져옵니다. 보드를 선택하지 않으면
          최종 확정 지원서를 사용합니다.
          <br />
          기존 참여자를 자동 삭제하거나 이탈 처리하지 않습니다.
        </p>
      </details>
      <p role="status" className="text-sm text-ink-2">
        {message}
      </p>
      {preview && (
        <div className="rounded-xl border border-dashed border-border p-4">
          <p className="mb-3 text-xs text-ink-3">
            내부 미리보기 · 공개 설정과 무관하게 운영자에게만 표시됩니다.
          </p>
          <UploadProgress uploads={publicUploads(data)} />
        </div>
      )}
      <div className="flex flex-wrap gap-2" aria-label="제출 상태 필터">
        {Object.entries({
          all: `전체 ${counts.total}`,
          ...Object.fromEntries(
            Object.entries(uploadLabels).map(([key, value]) => [
              key,
              `${value} ${counts[key as keyof typeof uploadLabels]}`,
            ]),
          ),
          overdue: `기한 초과 ${data.participants.filter((p) => isOverdue(data, p)).length}`,
          inactive: "이탈",
        }).map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setFilter(key);
              setPage(1);
            }}
            aria-pressed={filter === key}
            className={`rounded-full border border-border px-3 py-2 text-sm ${filter === key ? "bg-foreground text-background" : "bg-card"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="참여자·계정 검색"
          placeholder="이름 · 계정 · 담당자 검색"
          className={inputClass}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="담당자 필터"
          className={inputClass}
          value={owner}
          onChange={(e) => {
            setOwner(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">담당자 전체</option>
          <option value="">미지정</option>
          {owners.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <button
          className={buttonClass}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                items
                  .map(
                    (p) =>
                      `${p.display_name}\t${uploadLabels[uploadStatus(data, p.id)]}\t${p.ig_handle ?? ""}`,
                  )
                  .join("\n"),
              );
              setMessage(`${items.length}명 명단을 복사했습니다.`);
            } catch {
              setMessage("클립보드에 접근할 수 없습니다.");
            }
          }}
        >
          현재 명단 복사
        </button>
        <button
          className={buttonClass}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                `안녕하세요, deetz입니다.\n참여하신 챌린지의 게시물 링크를 제출해 주세요.\nhttps://www.deetz.kr/campaigns/${project}/submit\n이미 제출하셨다면 같은 화면에서 확인하실 수 있습니다.`,
              );
              setMessage("제출 안내 문구를 복사했습니다.");
            } catch {
              setMessage("클립보드에 접근할 수 없습니다.");
            }
          }}
        >
          제출 안내 문구 복사
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={`${tableClass} [&_td]:whitespace-nowrap`}>
          <thead>
            <tr>
              {[
                "참여자",
                "계정",
                "제출 상태",
                "마감 (KST)",
                "게시물",
                "최근 접수",
                "담당자",
                "작업",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.slice((currentPage - 1) * 50, currentPage * 50).map((p) => {
              const subs = currentSubmissions(data, p.id),
                latest = [...subs].sort((a, b) =>
                  b.submitted_at.localeCompare(a.submitted_at),
                )[0];
              const post = data.posts.find((x) => x.id === latest?.post_id);
              return (
                <tr key={p.id}>
                  <td className="sticky left-0 z-10 bg-card font-semibold">
                    <button
                      className="underline underline-offset-4"
                      onClick={() => setSelected(p.id)}
                    >
                      {p.display_name}
                    </button>
                  </td>
                  <td>{p.ig_handle ? `@${p.ig_handle}` : "미연결"}</td>
                  <td>
                    {uploadLabels[uploadStatus(data, p.id)]}
                    {isOverdue(data, p) && (
                      <span className="ml-2 text-amber-700">기한 초과</span>
                    )}
                  </td>
                  <td>{date(p.deadline ?? data.settings.deadline)}</td>
                  <td>
                    {post ? (
                      <a
                        className="underline"
                        href={post.post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        릴스 열기
                        {subs.length > 1 ? ` 외 ${subs.length - 1}개` : ""}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{date(latest?.submitted_at ?? null)}</td>
                  <td>{p.owner_label || "미지정"}</td>
                  <td>
                    <button
                      className={buttonClass}
                      onClick={() => setSelected(p.id)}
                    >
                      {subs.length ? "검토" : "대신 등록"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!items.length && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-ink-3">
                  {counts.total
                    ? "조건에 맞는 참여자가 없습니다."
                    : "설정을 저장한 뒤 확정 명단에서 참여자를 추가해 주세요."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-3 text-sm">
        <span>
          {items.length}명 · {currentPage}/{pages} 페이지
        </span>
        <button
          className={buttonClass}
          disabled={currentPage <= 1}
          onClick={() => setPage(currentPage - 1)}
        >
          이전
        </button>
        <button
          className={buttonClass}
          disabled={currentPage >= pages}
          onClick={() => setPage(currentPage + 1)}
        >
          다음
        </button>
      </div>
      {person && (
        <ParticipantSheet
          key={person.id}
          person={person}
          data={data}
          onClose={() => setSelected(null)}
          onSaved={reload}
        />
      )}
    </section>
  );
}

function UnlinkedPost({
  post,
  data,
  onSaved,
}: {
  post: SubmissionData["posts"][number];
  data: SubmissionData;
  onSaved: () => Promise<void>;
}) {
  const [pending, start] = useTransition(),
    [message, setMessage] = useState("");
  return (
    <form
      className="flex flex-wrap items-center gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          try {
            const r = await mutateSubmissionAction(
              data.settings.project_id,
              "submit",
              { participant_id: f.get("participant"), url: post.post_url },
            );
            if (r.ok) await onSaved();
            else setMessage(r.error);
          } catch {
            setMessage("연결 결과를 확인하지 못했습니다.");
          }
        });
      }}
    >
      <a
        href={post.post_url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm underline"
      >
        {post.short_code} ↗
      </a>
      <select
        required
        name="participant"
        aria-label={`${post.short_code} 참여자 연결`}
        className={inputClass}
        defaultValue=""
      >
        <option value="" disabled>
          참여자 선택
        </option>
        {data.participants
          .filter((p) => p.active)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
      </select>
      <button disabled={pending} className={buttonClass}>
        연결
      </button>
      <p role="status" className="text-sm">
        {message}
      </p>
    </form>
  );
}

function ParticipantSheet({
  person,
  data,
  onClose,
  onSaved,
}: {
  person: Participant;
  data: SubmissionData;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [message, setMessage] = useState(""),
    [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null),
    [events, setEvents] = useState<
      Awaited<ReturnType<typeof submissionEventsAction>>
    >([]);
  const [candidates, setCandidates] = useState<
      Awaited<ReturnType<typeof searchSubmissionMembersAction>>
    >([]),
    [memberQuery, setMemberQuery] = useState("");
  const project = data.settings.project_id;
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const subs = currentSubmissions(data, person.id);
  async function run(
    action: "participant" | "review",
    input: Record<string, unknown>,
  ) {
    setMessage("");
    start(async () => {
      try {
        const r = await mutateSubmissionAction(project, action, input);
        if (!r.ok) setMessage(r.error);
        else {
          setMessage("저장했습니다.");
          await onSaved();
        }
      } catch {
        setMessage("저장 결과를 확인하지 못했습니다. 새로고침해 주세요.");
      }
    });
  }
  return (
    <dialog
      ref={ref}
      aria-labelledby="participant-title"
      onCancel={onClose}
      onClose={onClose}
      className="fixed inset-y-0 left-auto right-0 m-0 h-full max-h-none w-full max-w-2xl overflow-y-auto border-l border-border bg-card p-6 text-foreground backdrop:bg-black/40"
    >
      <header className="flex items-center justify-between gap-3">
        <h2 id="participant-title" className="text-xl font-bold">
          {person.display_name} · 게시물 관리
        </h2>
        <button className={buttonClass} onClick={onClose}>
          닫기
        </button>
      </header>
      <p className="my-4 text-sm text-ink-3">
        {person.ig_handle ? `@${person.ig_handle}` : "계정 미연결"} ·{" "}
        {uploadLabels[uploadStatus(data, person.id)]}
      </p>
      {!person.active && (
        <p className="text-sm text-amber-700">
          이탈 처리된 참여자입니다. 다시 활성화하면 제출할 수 있습니다.
        </p>
      )}
      <div className="space-y-4">
        {subs.map((s) => (
          <div
            key={`${s.id}-${s.version}`}
            className="space-y-3 rounded-xl border border-border p-4"
          >
            <a
              href={data.posts.find((p) => p.id === s.post_id)?.post_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline"
            >
              Instagram 게시물 열기 ↗
            </a>
            <p className="text-xs text-ink-3">
              {uploadLabels[s.status]} ·{" "}
              {s.source === "admin" ? "관리자 등록" : "본인 제출"} ·{" "}
              {date(s.submitted_at)}
            </p>
            {s.feedback && (
              <p className="whitespace-pre-line text-sm">
                수정 사유: {s.feedback}
              </p>
            )}
            {person.active && (
              <ReviewForm
                submission={s}
                visible={data.settings.client_visible}
                disabled={pending}
                onReview={(input) => run("review", input)}
              />
            )}
            <button
              className={buttonClass}
              disabled={!person.active}
              onClick={() => setEditing(editing === s.id ? null : s.id)}
            >
              링크 수정
            </button>
            {editing === s.id && (
              <SubmissionForm
                projectId={project}
                participantId={person.id}
                submission={s}
                initialUrl={
                  data.posts.find((p) => p.id === s.post_id)?.post_url
                }
                onSaved={() => {
                  setEditing(null);
                  void onSaved();
                }}
              />
            )}
          </div>
        ))}
      </div>
      {person.active && (
        <details
          open={!subs.length}
          className="my-5 rounded-xl border border-border p-4"
        >
          <summary className="cursor-pointer font-semibold">
            {subs.length ? "게시물 추가 등록" : "게시물 대신 등록"}
          </summary>
          <div className="mt-4">
            <SubmissionForm
              projectId={project}
              participantId={person.id}
              onSaved={() => {
                void onSaved();
              }}
            />
          </div>
        </details>
      )}
      <details className="my-5">
        <summary className="cursor-pointer font-semibold">
          담당자·기한·회원 연결
        </summary>
        <form
          key={person.version}
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run("participant", {
              participant_id: person.id,
              version: person.version,
              owner_label: f.get("owner"),
              deadline: isoDate(String(f.get("deadline") || "")),
              note: f.get("note"),
              active: f.get("active") === "on",
              dancer_id: f.get("dancer") || null,
              link_reason: f.get("reason"),
            });
          }}
        >
          <label className="block text-sm">
            담당자
            <input
              name="owner"
              maxLength={100}
              className={`${inputClass} block w-full`}
              defaultValue={person.owner_label}
            />
          </label>
          <label className="block text-sm">
            개별 마감 (한국시간)
            <input
              name="deadline"
              type="datetime-local"
              className={`${inputClass} block w-full`}
              defaultValue={localDate(person.deadline)}
            />
          </label>
          <label className="block text-sm">
            내부 메모 · 개별 기한 변경 사유
            <textarea
              name="note"
              maxLength={5000}
              className={`${inputClass} block w-full`}
              defaultValue={person.note}
            />
          </label>
          {!person.application_id && (
            <div className="space-y-2">
              <label className="block text-sm">
                연결할 회원 검색
                <input
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                  className={`${inputClass} block w-full`}
                  placeholder="활동명 2글자 이상"
                />
              </label>
              <button
                type="button"
                className={buttonClass}
                onClick={async () => {
                  try {
                    setCandidates(
                      await searchSubmissionMembersAction(project, memberQuery),
                    );
                  } catch {
                    setMessage("회원 검색에 실패했습니다.");
                  }
                }}
              >
                회원 검색
              </button>
            </div>
          )}
          <label className="block text-sm">
            본인 제출 계정
            <select
              name="dancer"
              className={`${inputClass} block w-full`}
              defaultValue={person.dancer_id ?? ""}
            >
              <option value="">연결 안 됨 · 관리자 등록만 가능</option>
              {person.dancer_id && (
                <option value={person.dancer_id}>
                  {person.display_name} · 현재 연결
                </option>
              )}
              {!person.application_id &&
                candidates
                  .filter((c) => c.id !== person.dancer_id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.stage_name} ·{" "}
                      {String(
                        (c.social_links as Record<string, unknown> | null)
                          ?.instagram ?? "계정 확인 필요",
                      )}
                    </option>
                  ))}
            </select>
          </label>
          {!person.application_id && (
            <label className="block text-sm">
              회원 연결 확인 근거
              <input
                name="reason"
                className={`${inputClass} block w-full`}
                placeholder="본인 연락으로 계정 소유 확인 등"
              />
            </label>
          )}
          <label className="flex gap-2 text-sm">
            <input
              name="active"
              type="checkbox"
              defaultChecked={person.active}
            />
            참여 유지 · 해제하면 현재 집계에서 제외
          </label>
          <button disabled={pending} className={buttonClass}>
            참여자 정보 저장
          </button>
        </form>
      </details>
      <p role="status" className="my-3 text-sm">
        {message}
      </p>
      <button
        className={buttonClass}
        onClick={async () => {
          try {
            setEvents(await submissionEventsAction(project, person.id));
          } catch {
            setMessage("이력을 불러오지 못했습니다.");
          }
        }}
      >
        최근 변경 이력 보기
      </button>
      <ul className="mt-3 space-y-2 text-xs text-ink-3">
        {events.map((e) => (
          <li key={e.id}>
            {date(e.created_at)} ·{" "}
            {(
              {
                submit: "제출·재검토",
                review: "검토",
                participant: "참여자 정보 변경",
              } as Record<string, string>
            )[e.action] ?? e.action}
            <details>
              <summary>변경 내용</summary>
              <pre className="overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(e.detail, null, 2)}
              </pre>
            </details>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
function ReviewForm({
  submission,
  visible,
  disabled,
  onReview,
}: {
  submission: Submission;
  visible: boolean;
  disabled: boolean;
  onReview: (input: Record<string, unknown>) => void;
}) {
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const status = (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
          "value",
        );
        onReview({
          submission_id: submission.id,
          version: submission.version,
          status,
          feedback: f.get("feedback"),
          checks: {
            public: f.get("public") === "on",
            account: f.get("account") === "on",
            guidelines: f.get("guidelines") === "on",
          },
        });
      }}
    >
      <fieldset className="space-y-2 text-sm">
        <legend className="mb-2 font-medium">게시물 확인</legend>
        {Object.entries({
          public: "공개 상태와 게시물 접근을 확인했습니다.",
          account: "본인 계정 또는 공동작업 참여를 확인했습니다.",
          guidelines: "음원·태그 등 전달한 제작 조건을 확인했습니다.",
        }).map(([key, label]) => (
          <label key={key} className="flex items-start gap-2">
            <input type="checkbox" name={key} className="mt-1" />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="block text-sm">
        참여자에게 보이는 수정 사유
        <textarea
          name="feedback"
          maxLength={2000}
          defaultValue={submission.feedback}
          className={`${inputClass} block w-full`}
        />
      </label>
      {visible && (
        <p className="text-xs text-ink-3">
          확인 완료로 저장하면 클라이언트 진행 보드에 게시물 링크가 표시됩니다.
        </p>
      )}
      <div className="flex gap-2">
        <button
          disabled={disabled}
          name="status"
          value="approved"
          className={buttonClass}
        >
          확인 완료
        </button>
        <button
          disabled={disabled}
          name="status"
          value="changes_requested"
          className={buttonClass}
        >
          수정 요청
        </button>
      </div>
    </form>
  );
}
