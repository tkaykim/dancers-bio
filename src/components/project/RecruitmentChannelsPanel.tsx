"use client";

import Image from "next/image";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ChevronDown,
  Copy,
  ExternalLink,
  Plus,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  addRecruitmentChannelMemberAction,
  archiveRecruitmentChannelAction,
  createRecruitmentChannelAction,
  removeRecruitmentChannelMemberAction,
  searchRecruitmentChannelMemberCandidatesAction,
  updateRecruitmentChannelMemberPermissionsAction,
} from "@/app/actions/recruitment-channels";
import type { ManagerCandidate } from "@/app/actions/project-managers";

export type RecruitmentChannelMember = {
  profile_id: string;
  role: string;
  display_name: string;
  avatar_url: string | null;
  instagram_handle: string | null;
  can_view_applicants: boolean;
  can_decide_applications: boolean;
};

export type RecruitmentChannel = {
  id: string;
  name: string;
  share_code: string;
  channel_type: string;
  status: string;
  manager_label: string | null;
  applicantCount: number;
  acceptedCount: number;
  pendingCount: number;
  members: RecruitmentChannelMember[];
};

const CHANNEL_TYPE_LABELS: Record<string, string> = {
  general: "기본",
  external: "외부",
  partner: "파트너",
  school: "학교",
  direct: "직접",
  legacy: "기존",
  other: "기타",
};

type SortKey = "applicants" | "name";

export function RecruitmentChannelsPanel({
  projectId,
  canEdit,
  channels,
}: {
  projectId: string;
  canEdit: boolean;
  channels: RecruitmentChannel[];
}) {
  const router = useRouter();
  const [openCreate, setOpenCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("applicants");
  const [showArchived, setShowArchived] = useState(false);
  const [memberChannelId, setMemberChannelId] = useState<string | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<ManagerCandidate[]>([]);
  const [newMemberCanDecide, setNewMemberCanDecide] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [creating, startCreate] = useTransition();

  const origin =
    typeof window === "undefined" ? "https://deetz.kr" : window.location.origin;
  const activeChannels = channels.filter((ch) => ch.status !== "archived");
  const archivedCount = channels.length - activeChannels.length;
  const openedChannel = channels.find((ch) => ch.id === memberChannelId) ?? null;
  const existingMemberIds = useMemo(
    () => new Set(openedChannel?.members.map((m) => m.profile_id) ?? []),
    [openedChannel],
  );

  const summary = useMemo(
    () =>
      activeChannels.reduce(
        (acc, ch) => ({
          applicants: acc.applicants + ch.applicantCount,
          accepted: acc.accepted + ch.acceptedCount,
          pending: acc.pending + ch.pendingCount,
        }),
        { applicants: 0, accepted: 0, pending: 0 },
      ),
    [activeChannels],
  );

  const visibleChannels = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = channels
      .filter((ch) =>
        showArchived ? ch.status === "archived" : ch.status !== "archived",
      )
      .filter((ch) => (q ? ch.name.toLowerCase().includes(q) : true));
    const sorted = [...list];
    if (sortKey === "applicants") {
      sorted.sort((a, b) => b.applicantCount - a.applicantCount);
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    }
    return sorted;
  }, [channels, showArchived, query, sortKey]);

  const showToolbar = channels.length > 4;

  const runSearch = useCallback(
    (q: string) => {
      setMemberQuery(q);
      if (q.trim().length < 1) {
        setMemberResults([]);
        return;
      }
      startSearch(async () => {
        const result = await searchRecruitmentChannelMemberCandidatesAction(
          q.trim(),
          projectId,
        );
        if (result.ok && result.data) {
          setMemberResults(result.data);
        }
      });
    },
    [projectId],
  );

  function toggleExpand(channelId: string) {
    setExpandedId((cur) => {
      if (cur === channelId) {
        setMemberChannelId(null);
        setMemberQuery("");
        setMemberResults([]);
        setNewMemberCanDecide(false);
        return null;
      }
      return channelId;
    });
  }

  function openMemberForm(channelId: string) {
    setExpandedId(channelId);
    setMemberChannelId(channelId);
    setMemberQuery("");
    setMemberResults([]);
    setNewMemberCanDecide(false);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("복사했습니다");
    } catch {
      toast.error("복사하지 못했습니다");
    }
  }

  function createChannel(formData: FormData) {
    startCreate(async () => {
      formData.set("project_id", projectId);
      const result = await createRecruitmentChannelAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setOpenCreate(false);
      toast.success("모집채널을 만들었습니다");
      router.refresh();
    });
  }

  function addMember(profileId: string) {
    if (!memberChannelId) return;
    setBusyId(profileId);
    const fd = new FormData();
    fd.set("channel_id", memberChannelId);
    fd.set("profile_id", profileId);
    fd.set("can_decide_applications", newMemberCanDecide ? "true" : "false");
    addRecruitmentChannelMemberAction(fd).then((result) => {
      setBusyId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("담당자를 추가했습니다");
      setMemberQuery("");
      setMemberResults([]);
      setNewMemberCanDecide(false);
      router.refresh();
    });
  }

  function updateMemberPermission(
    channelId: string,
    profileId: string,
    canDecideApplications: boolean,
  ) {
    setBusyId(`${channelId}:${profileId}:permission`);
    const fd = new FormData();
    fd.set("channel_id", channelId);
    fd.set("profile_id", profileId);
    fd.set("can_decide_applications", canDecideApplications ? "true" : "false");
    updateRecruitmentChannelMemberPermissionsAction(fd).then((result) => {
      setBusyId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("담당자 권한을 변경했습니다");
      router.refresh();
    });
  }

  function removeMember(channelId: string, profileId: string) {
    if (!confirm("이 채널 담당자를 삭제할까요?")) return;
    setBusyId(profileId);
    const fd = new FormData();
    fd.set("channel_id", channelId);
    fd.set("profile_id", profileId);
    removeRecruitmentChannelMemberAction(fd).then((result) => {
      setBusyId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("담당자를 삭제했습니다");
      router.refresh();
    });
  }

  function archiveChannel(channelId: string) {
    if (!confirm("이 모집채널을 보관 처리할까요? 기존 지원자는 유지됩니다.")) return;
    setBusyId(channelId);
    const fd = new FormData();
    fd.set("channel_id", channelId);
    archiveRecruitmentChannelAction(fd).then((result) => {
      setBusyId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("보관 처리했습니다");
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            ↳ 모집채널 ({activeChannels.length})
          </p>
          <p className="mt-1 text-xs text-ink-3">
            채널별 링크를 배포하면 지원 출처가 자동 기록됩니다.
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setOpenCreate((v) => !v)}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-3 text-xs font-semibold text-primary hover:bg-primary/10"
          >
            <Plus className="size-3.5" />
            채널
          </button>
        ) : null}
      </div>

      {activeChannels.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          <SummaryStat label="총 지원" value={summary.applicants} />
          <SummaryStat label="수락" value={summary.accepted} />
          <SummaryStat label="대기" value={summary.pending} />
        </div>
      ) : null}

      {openCreate && canEdit ? (
        <form
          action={createChannel}
          className="grid gap-2 rounded-xl border border-hairline-2 bg-background p-3 sm:grid-cols-[1fr_120px]"
        >
          <input
            name="name"
            required
            maxLength={80}
            placeholder="예: 서울문화예술대"
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
          />
          <select
            name="channel_type"
            defaultValue="external"
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
          >
            <option value="general">기본</option>
            <option value="external">외부</option>
            <option value="partner">파트너</option>
            <option value="school">학교</option>
            <option value="direct">직접</option>
            <option value="other">기타</option>
          </select>
          <input
            name="manager_label"
            maxLength={80}
            placeholder="담당자 표기 예: SCAU"
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm sm:col-span-2"
          />
          <button
            type="submit"
            disabled={creating}
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:col-span-2"
          >
            {creating ? "생성 중..." : "모집채널 만들기"}
          </button>
        </form>
      ) : null}

      {showToolbar ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3">
              <Search className="size-3.5 shrink-0 text-ink-3" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="채널 검색"
                className="h-full w-full bg-transparent text-sm outline-none placeholder:text-ink-3"
              />
            </div>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="h-9 shrink-0 rounded-lg border border-border bg-background px-2 text-xs text-ink-2"
              aria-label="정렬"
            >
              <option value="applicants">지원 많은 순</option>
              <option value="name">이름순</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <FilterChip
              active={!showArchived}
              onClick={() => setShowArchived(false)}
            >
              활성 {activeChannels.length}
            </FilterChip>
            {archivedCount > 0 ? (
              <FilterChip
                active={showArchived}
                onClick={() => setShowArchived(true)}
              >
                보관 {archivedCount}
              </FilterChip>
            ) : null}
          </div>
        </div>
      ) : null}

      {channels.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline-2 p-5 text-center text-sm text-ink-3">
          아직 모집채널이 없습니다. 새 프로젝트는 기본 채널이 자동 생성됩니다.
        </p>
      ) : visibleChannels.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline-2 p-5 text-center text-sm text-ink-3">
          {query.trim() ? "검색 결과가 없습니다." : "표시할 채널이 없습니다."}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border">
          {visibleChannels.map((channel, index) => {
            const applyUrl = `${origin}/c/${channel.share_code}`;
            const managerUrl = `${origin}/channels/${channel.share_code}/applicants`;
            const archived = channel.status === "archived";
            const expanded = expandedId === channel.id;
            const empty = channel.applicantCount === 0 && !archived;
            return (
              <li
                key={channel.id}
                className={index > 0 ? "border-t border-hairline-2" : ""}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleExpand(channel.id)}
                    aria-expanded={expanded}
                    className={`flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left hover:bg-secondary/40 ${
                      empty ? "opacity-65" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">
                          {channel.name}
                        </span>
                        <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-ink-2">
                          {CHANNEL_TYPE_LABELS[channel.channel_type] ??
                            channel.channel_type}
                        </span>
                        {archived ? (
                          <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-ink-3">
                            보관
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-ink-3">
                        {channel.applicantCount > 0
                          ? `지원 ${channel.applicantCount} · 수락 ${channel.acceptedCount} · 대기 ${channel.pendingCount}`
                          : "아직 지원 없음"}
                      </p>
                    </div>
                    <MemberAvatars members={channel.members} />
                    <ChevronDown
                      className={`size-4 shrink-0 text-ink-3 transition-transform ${
                        expanded ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => copy(applyUrl)}
                    className="mr-2 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-secondary hover:text-foreground"
                    aria-label="지원 링크 복사"
                    title="지원 링크 복사"
                  >
                    <Copy className="size-3.5" />
                  </button>
                </div>

                {expanded ? (
                  <div className="flex flex-col gap-3 border-t border-hairline-2 bg-background/40 px-3 pb-3 pt-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <ChannelLink
                        label="지원 링크"
                        href={applyUrl}
                        onCopy={() => copy(applyUrl)}
                      />
                      <ChannelLink
                        label="담당자 명단"
                        href={managerUrl}
                        onCopy={() => copy(managerUrl)}
                      />
                    </div>

                    <div className="flex flex-col gap-2 border-t border-hairline-2 pt-3">
                      <div className="flex items-center justify-between">
                        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2">
                          <Users className="size-3.5" />
                          채널 담당자 {channel.members.length}
                        </p>
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() =>
                              memberChannelId === channel.id
                                ? setMemberChannelId(null)
                                : openMemberForm(channel.id)
                            }
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <UserPlus className="size-3.5" />
                            {memberChannelId === channel.id
                              ? "닫기"
                              : "담당자 추가"}
                          </button>
                        ) : null}
                      </div>

                      {channel.members.length > 0 ? (
                        <ul className="flex flex-col gap-1">
                          {channel.members.map((member) => (
                            <li
                              key={member.profile_id}
                              className="flex items-center gap-2 rounded-lg px-1 py-1"
                            >
                              <MemberAvatar
                                avatarUrl={member.avatar_url}
                                name={member.display_name}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium">
                                  {member.display_name}
                                </p>
                                {member.instagram_handle ? (
                                  <p className="truncate text-[10px] text-ink-3">
                                    @{member.instagram_handle}
                                  </p>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={member.can_decide_applications}
                                disabled={
                                  !canEdit ||
                                  busyId ===
                                    `${channel.id}:${member.profile_id}:permission`
                                }
                                onClick={() =>
                                  updateMemberPermission(
                                    channel.id,
                                    member.profile_id,
                                    !member.can_decide_applications,
                                  )
                                }
                                className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                                  member.can_decide_applications
                                    ? "border-primary/40 bg-primary/10 text-primary"
                                    : "border-border bg-secondary/40 text-ink-3"
                                }`}
                                title={
                                  member.can_decide_applications
                                    ? "승인/거절 권한 있음"
                                    : "명단 보기만 가능"
                                }
                              >
                                <ShieldCheck className="size-3" />
                                {member.can_decide_applications
                                  ? "승인 가능"
                                  : "보기만"}
                              </button>
                              {canEdit ? (
                                <button
                                  type="button"
                                  disabled={busyId === member.profile_id}
                                  onClick={() =>
                                    removeMember(channel.id, member.profile_id)
                                  }
                                  className="text-[11px] text-ink-3 hover:text-destructive disabled:opacity-50"
                                >
                                  삭제
                                </button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-ink-3">
                          담당자가 없으면 프로젝트 관리자만 이 채널을 관리합니다.
                        </p>
                      )}

                      {canEdit && memberChannelId === channel.id ? (
                        <div className="flex flex-col gap-2 rounded-lg bg-card p-2">
                          <input
                            type="text"
                            value={memberQuery}
                            onChange={(e) => runSearch(e.target.value)}
                            placeholder="이름 · 이메일 · 인스타 핸들로 검색"
                            className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
                          />
                          <button
                            type="button"
                            role="switch"
                            aria-checked={newMemberCanDecide}
                            onClick={() => setNewMemberCanDecide((v) => !v)}
                            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                              newMemberCanDecide
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-border bg-background text-ink-2"
                            }`}
                          >
                            <span className="inline-flex items-center gap-1.5 font-medium">
                              <ShieldCheck className="size-3.5" />
                              승인/거절 권한
                            </span>
                            <span className="text-[11px]">
                              {newMemberCanDecide ? "켬" : "끔"}
                            </span>
                          </button>
                          {searching ? (
                            <p className="py-2 text-center text-xs text-ink-3">
                              검색 중...
                            </p>
                          ) : memberResults.length > 0 ? (
                            <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                              {memberResults.map((candidate) => {
                                const already = existingMemberIds.has(
                                  candidate.id,
                                );
                                return (
                                  <li
                                    key={candidate.id}
                                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-secondary/50"
                                  >
                                    <MemberAvatar
                                      avatarUrl={candidate.avatar_url}
                                      name={candidate.display_name ?? "?"}
                                    />
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-xs font-medium">
                                        {candidate.display_name}
                                      </p>
                                      <p className="truncate text-[10px] text-ink-3">
                                        {candidate.email ??
                                          candidate.instagram_handle ??
                                          ""}
                                      </p>
                                    </div>
                                    {already ? (
                                      <span className="text-[11px] text-ink-3">
                                        등록됨
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={busyId === candidate.id}
                                        onClick={() => addMember(candidate.id)}
                                        className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                                      >
                                        추가
                                      </button>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : memberQuery.trim() ? (
                            <p className="py-2 text-center text-xs text-ink-3">
                              결과가 없습니다. 가입된 계정만 담당자로 지정할 수 있습니다.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {canEdit && !archived ? (
                      <button
                        type="button"
                        disabled={busyId === channel.id}
                        onClick={() => archiveChannel(channel.id)}
                        className="inline-flex items-center gap-1.5 self-start rounded-full px-2 py-1 text-[11px] text-ink-3 hover:bg-secondary hover:text-foreground disabled:opacity-50"
                      >
                        <Archive className="size-3.5" />
                        채널 보관
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-hairline-2 bg-background px-2.5 py-2">
      <p className="text-[11px] text-ink-3">{label}</p>
      <p className="text-lg font-semibold leading-tight">{value}</p>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? "border-primary/40 bg-primary/10 font-medium text-primary"
          : "border-border text-ink-3 hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function MemberAvatar({
  avatarUrl,
  name,
}: {
  avatarUrl: string | null;
  name: string;
}) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={28}
        height={28}
        className="size-7 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="flex size-7 items-center justify-center rounded-full bg-secondary text-[11px] font-bold">
      {name[0] ?? "?"}
    </div>
  );
}

function MemberAvatars({ members }: { members: RecruitmentChannelMember[] }) {
  if (members.length === 0) {
    return (
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-hairline-2 text-ink-3"
        title="담당자 없음"
      >
        <UserPlus className="size-3" />
      </span>
    );
  }
  const shown = members.slice(0, 3);
  const extra = members.length - shown.length;
  return (
    <div className="flex shrink-0 items-center">
      {shown.map((m, i) => (
        <div
          key={m.profile_id}
          className={`size-6 overflow-hidden rounded-full border-[1.5px] border-card ${
            i > 0 ? "-ml-2" : ""
          }`}
          title={m.display_name}
        >
          {m.avatar_url ? (
            <Image
              src={m.avatar_url}
              alt={m.display_name}
              width={24}
              height={24}
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-secondary text-[10px] font-bold">
              {m.display_name[0] ?? "?"}
            </div>
          )}
        </div>
      ))}
      {extra > 0 ? (
        <div className="-ml-2 flex size-6 items-center justify-center rounded-full border-[1.5px] border-card bg-secondary text-[10px] font-bold text-ink-2">
          +{extra}
        </div>
      ) : null}
    </div>
  );
}

function ChannelLink({
  label,
  href,
  onCopy,
}: {
  label: string;
  href: string;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-1 rounded-lg border border-hairline-2 bg-card px-2.5 py-2">
      <span className="text-[11px] font-medium text-ink-2">{label}</span>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-secondary hover:text-foreground"
          aria-label={`${label} 복사`}
        >
          <Copy className="size-3.5" />
        </button>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-secondary hover:text-foreground"
          aria-label={`${label} 열기`}
        >
          <ExternalLink className="size-3.5" />
        </a>
      </div>
    </div>
  );
}
