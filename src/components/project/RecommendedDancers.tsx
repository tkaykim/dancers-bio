"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendDirectProposalAction } from "@/app/actions/proposals";

type RecommendedDancer = {
  dancer_id: string;
  stage_name: string;
  slug: string | null;
  profile_img: string | null;
  genres: string[] | null;
  location: string | null;
  profile_id: string | null;
  genre_match: boolean;
  location_match: boolean;
};

type Props = {
  projectId: string;
  dancers: RecommendedDancer[];
};

type CardState =
  | { kind: "idle" }
  | { kind: "form" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

export function RecommendedDancers({ projectId, dancers }: Props) {
  if (dancers.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 추천 댄서
        </p>
        <p className="text-[11px] leading-relaxed text-ink-3">
          이 공고에 어울리는 댄서예요. 미claim 댄서에게 제안하면 가입·응답
          유도가 됩니다.
        </p>
      </div>

      <div className="scrollbar-none -mx-6 flex gap-3 overflow-x-auto px-6 pb-1">
        {dancers.map((d) => (
          <DancerCard key={d.dancer_id} projectId={projectId} dancer={d} />
        ))}
      </div>
    </section>
  );
}

function DancerCard({
  projectId,
  dancer,
}: {
  projectId: string;
  dancer: RecommendedDancer;
}) {
  const router = useRouter();
  const [state, setState] = useState<CardState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  const href = `/d/${dancer.slug ?? dancer.dancer_id}`;
  const genres = (dancer.genres ?? []).filter(Boolean).slice(0, 2);
  const isUnclaimed = dancer.profile_id === null;
  const sent = state.kind === "sent";

  return (
    <div className="flex w-44 shrink-0 flex-col gap-3 rounded-2xl border border-border bg-card p-3">
      <Link href={href} className="flex flex-col gap-2">
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-secondary">
          {dancer.profile_img ? (
            <Image
              src={dancer.profile_img}
              alt={dancer.stage_name}
              fill
              sizes="176px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-ink-3">
              {dancer.stage_name[0] ?? "?"}
            </div>
          )}
          {isUnclaimed ? (
            <span className="absolute left-1.5 top-1.5 rounded-full border border-hairline-2 bg-background/80 px-2 py-0.5 text-[10px] font-medium text-ink-3 backdrop-blur">
              미claim
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-0.5">
          <p className="truncate text-sm font-semibold tracking-tight">
            {dancer.stage_name}
          </p>
          {genres.length > 0 ? (
            <p className="truncate text-[11px] text-ink-2">
              {genres.join(" · ")}
            </p>
          ) : null}
          {dancer.location ? (
            <p className="truncate text-[11px] text-ink-3">{dancer.location}</p>
          ) : null}
        </div>
      </Link>

      {dancer.genre_match || dancer.location_match ? (
        <div className="flex flex-wrap gap-1">
          {dancer.genre_match ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              장르 일치
            </span>
          ) : null}
          {dancer.location_match ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              지역 일치
            </span>
          ) : null}
        </div>
      ) : null}

      {state.kind === "form" ? (
        <form
          action={(formData) => {
            setState({ kind: "form" });
            formData.set("project_id", projectId);
            formData.set("dancer_id", dancer.dancer_id);
            startTransition(async () => {
              const result = await sendDirectProposalAction(formData);
              if (!result.ok) {
                setState({ kind: "error", message: result.error });
                return;
              }
              setState({ kind: "sent" });
              router.refresh();
            });
          }}
          className="flex flex-col gap-2"
        >
          <textarea
            name="cover_message"
            rows={2}
            maxLength={500}
            placeholder="한 줄 메시지 (선택)"
            className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-[11px]"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setState({ kind: "idle" })}
              disabled={pending}
              className="inline-flex h-8 flex-1 items-center justify-center rounded-md border border-input bg-background text-[11px] font-medium hover:bg-secondary disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-8 flex-1 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "전송 중…" : "보내기"}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          disabled={sent}
          onClick={() => setState({ kind: "form" })}
          className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-3 text-[12px] font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-default disabled:bg-secondary disabled:text-ink-3 disabled:opacity-100"
        >
          {sent ? "제안 전송됨" : "제안 보내기"}
        </button>
      )}

      {state.kind === "error" ? (
        <p className="rounded-md bg-destructive/10 px-2 py-1 text-[10px] leading-snug text-destructive">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
