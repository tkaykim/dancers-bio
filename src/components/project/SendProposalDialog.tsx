"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { sendDirectProposalAction } from "@/app/actions/proposals";

type ProposalProject = {
  id: string;
  title: string;
  visibility: "public" | "private";
  status: string;
  allow_team_apply: boolean;
};

type Props = {
  target:
    | { kind: "dancer"; profile_id: string; name: string }
    | { kind: "team"; team_id: string; name: string };
  myProjects: ProposalProject[];
};

export function SendProposalDialog({ target, myProjects }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  const eligible = myProjects.filter((p) => {
    if (p.status !== "open" && p.status !== "draft") return false;
    if (target.kind === "team" && !p.allow_team_apply) return false;
    return true;
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          setSuccess(false);
        }
      }}
    >
      <DialogTrigger>
        <span className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:opacity-90">
          제안 보내기
        </span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight">
            {target.name}에게 제안
          </DialogTitle>
          <DialogDescription>
            본인의 프로젝트 중 하나를 선택해 다이렉트 제안을 보냅니다.
            {target.kind === "team" ? " (팀 지원 허용 공고만 노출)" : ""}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col gap-3 py-2">
            <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
              제안을 보냈습니다.
            </p>
            <Button onClick={() => setOpen(false)} variant="outline">
              닫기
            </Button>
          </div>
        ) : eligible.length === 0 ? (
          <div className="flex flex-col gap-3 py-2">
            <p className="text-sm text-ink-2">
              {target.kind === "team"
                ? "팀 제안 가능한 프로젝트가 없습니다. 공고에서 '팀 지원 허용'을 켜주세요."
                : "제안 가능한 프로젝트가 없습니다. 먼저 프로젝트를 개설해 주세요."}
            </p>
            <Link
              href="/projects/new"
              className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-secondary"
            >
              + 프로젝트 개설
            </Link>
          </div>
        ) : (
          <form
            action={(formData) => {
              setError(null);
              if (target.kind === "dancer") {
                formData.set("applicant_id", target.profile_id);
                formData.delete("team_id");
              } else {
                formData.set("team_id", target.team_id);
                formData.delete("applicant_id");
              }
              startTransition(async () => {
                const result = await sendDirectProposalAction(formData);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setSuccess(true);
                router.refresh();
              });
            }}
            className="flex flex-col gap-4 pt-2"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="project_id">프로젝트</Label>
              <select
                id="project_id"
                name="project_id"
                required
                defaultValue=""
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="" disabled>
                  선택해 주세요
                </option>
                {eligible.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                    {p.visibility === "private" ? " · 비공개" : ""}
                    {p.status === "draft" ? " · 임시저장" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="cover_message">제안 메시지 (선택)</Label>
              <textarea
                id="cover_message"
                name="cover_message"
                rows={3}
                maxLength={500}
                placeholder="이 프로젝트에 함께하고 싶은 이유를 적어주세요."
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            {error ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                취소
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "보내는 중..." : "제안 보내기"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
