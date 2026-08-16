"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Check, UserPlus, History, X } from "lucide-react";
import { toast } from "sonner";
import { addSettlementDancerAction } from "@/app/actions/settlements";
import {
  frequentDancersAction,
  pastProjectsAction,
  projectRosterAction,
  type PastProject,
  type RosterDancer,
} from "@/app/actions/settlement-roster";
import { loadMoreDancersAction } from "@/app/actions/dancers-list";

// 이미 구두·SNS로 섭외가 끝난 뒤 "정산만 기입"하는 경우를 위한 명단 추가 패널.
// 캐스팅 제안(수락 대기)과는 다른 흐름이라 화면과 액션을 분리해 둔다.

type SearchDancer = {
  id: string;
  stage_name: string;
  korean_name: string | null;
  profile_img: string | null;
  location: string | null;
  profile_id: string | null;
};

function toRoster(d: SearchDancer): RosterDancer {
  return {
    id: d.id,
    stageName: d.stage_name,
    koreanName: d.korean_name,
    profileImg: d.profile_img,
    location: d.location,
    hasAccount: !!d.profile_id,
    workedCount: 0,
    lastWorkedAt: null,
  };
}

export function AddSettlementDancer({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RosterDancer[]>([]);
  const [frequent, setFrequent] = useState<RosterDancer[]>([]);
  const [pastProjects, setPastProjects] = useState<PastProject[]>([]);
  const [searching, startSearch] = useTransition();
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);

  // 패널을 열면 "자주 함께한 댄서"와 지난 프로젝트를 먼저 보여준다.
  // 검색어를 치기 전에 대부분의 경우가 여기서 끝나는 게 목표.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    frequentDancersAction(projectId).then((r) => {
      if (alive && r.ok && r.data) setFrequent(r.data.dancers);
    });
    pastProjectsAction(projectId).then((r) => {
      if (alive && r.ok && r.data) setPastProjects(r.data.projects);
    });
    return () => {
      alive = false;
    };
  }, [open, projectId]);

  const search = useCallback((q: string) => {
    setQuery(q);
    if (q.trim().length < 1) {
      setResults([]);
      return;
    }
    startSearch(async () => {
      const r = await loadMoreDancersAction({ q: q.trim(), offset: 0 });
      if (r.ok && r.data) {
        setResults((r.data.dancers as SearchDancer[]).map(toRoster));
      }
    });
  }, []);

  function add(dancerId: string) {
    setAdding(dancerId);
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("dancer_id", dancerId);
    addSettlementDancerAction(fd).then((r) => {
      setAdding(null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setAdded((prev) => new Set(prev).add(dancerId));
      toast.success(
        r.data?.created
          ? "정산 명단에 추가했어요. 금액을 입력해 주세요."
          : "이미 명단에 있는 댄서예요.",
      );
      router.refresh();
    });
  }

  function addFromProject(sourceProjectId: string, title: string) {
    setBulkBusy(sourceProjectId);
    projectRosterAction(projectId, sourceProjectId).then(async (r) => {
      if (!r.ok || !r.data) {
        setBulkBusy(null);
        toast.error(r.ok ? "불러올 댄서가 없어요." : r.error);
        return;
      }
      const list = r.data.dancers;
      if (list.length === 0) {
        setBulkBusy(null);
        toast.message("이미 전원이 명단에 있어요.");
        return;
      }
      let created = 0;
      for (const d of list) {
        const fd = new FormData();
        fd.set("project_id", projectId);
        fd.set("dancer_id", d.id);
        const res = await addSettlementDancerAction(fd);
        if (res.ok && res.data?.created) created += 1;
      }
      setBulkBusy(null);
      toast.success(`‘${title}’에서 ${created}명을 추가했어요.`);
      router.refresh();
    });
  }

  const showList = query.trim().length > 0 ? results : frequent;
  const listLabel =
    query.trim().length > 0 ? "검색 결과" : "자주 함께한 댄서";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card px-4 py-3.5 text-sm font-semibold text-ink-2 active:bg-secondary"
      >
        <UserPlus size={16} aria-hidden />
        참여 댄서 직접 추가
      </button>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-bold text-ink-2">참여 댄서 직접 추가</h2>
          <p className="text-xs text-ink-3">
            이미 섭외·협의가 끝난 댄서를 바로 정산 명단에 올려요. 수락 절차 없이
            추가되고, 계좌·주민번호는 댄서에게 등록 요청이 갑니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-ink-3 active:bg-secondary"
          aria-label="닫기"
        >
          <X size={15} aria-hidden />
        </button>
      </div>

      {/* 지난 프로젝트 명단 통째로 불러오기 — 같은 팀과 반복 작업할 때 가장 빠른 길 */}
      {pastProjects.length > 0 && query.trim().length === 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1 text-[11px] font-semibold text-ink-3">
            <History size={12} aria-hidden />
            지난 프로젝트에서 불러오기
          </span>
          <div className="flex flex-wrap gap-1.5">
            {pastProjects.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={bulkBusy !== null}
                onClick={() => addFromProject(p.id, p.title)}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-ink-2 active:bg-secondary disabled:opacity-50"
              >
                {bulkBusy === p.id
                  ? "추가 중…"
                  : `${p.title} · ${p.dancerCount}명`}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3">
        <Search size={15} className="shrink-0 text-ink-3" aria-hidden />
        <input
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="댄서 이름·활동명 검색"
          className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-ink-3">{listLabel}</span>
        {searching ? (
          <p className="py-4 text-center text-xs text-ink-3">찾는 중…</p>
        ) : showList.length === 0 ? (
          <p className="py-4 text-center text-xs text-ink-3">
            {query.trim().length > 0
              ? "검색 결과가 없어요."
              : "아직 함께한 기록이 없어요. 위에서 검색해 주세요."}
          </p>
        ) : (
          <ul className="flex flex-col">
            {showList.map((d) => {
              const isAdded = added.has(d.id);
              return (
                <li
                  key={d.id}
                  className="flex items-center gap-3 border-b border-hairline-2 py-2.5 last:border-b-0"
                >
                  <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-secondary">
                    {d.profileImg ? (
                      <Image
                        src={d.profileImg}
                        alt=""
                        fill
                        sizes="36px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {d.stageName}
                      {d.koreanName && d.koreanName !== d.stageName ? (
                        <span className="ml-1 text-xs font-normal text-ink-3">
                          {d.koreanName}
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-[11px] text-ink-3">
                      {d.workedCount > 0 ? `함께한 프로젝트 ${d.workedCount}건` : null}
                      {d.workedCount > 0 && d.location ? " · " : null}
                      {d.location}
                      {!d.hasAccount ? (
                        <span className="text-warn">
                          {d.workedCount > 0 || d.location ? " · " : ""}
                          계정 없음 — 링크 직접 전달 필요
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isAdded || adding === d.id}
                    onClick={() => add(d.id)}
                    className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground active:opacity-80 disabled:bg-secondary disabled:text-ink-3"
                  >
                    {isAdded ? (
                      <>
                        <Check size={13} aria-hidden />
                        추가됨
                      </>
                    ) : adding === d.id ? (
                      "추가 중…"
                    ) : (
                      "추가"
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
