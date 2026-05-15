"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteProjectAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DeleteProjectButton({
  projectId,
  variant = "outline",
  size = "lg",
  redirectTo = "/me/projects",
  label = "공고 삭제",
}: {
  projectId: string;
  variant?: "outline" | "destructive" | "ghost";
  size?: "sm" | "default" | "lg";
  redirectTo?: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    setError(null);
    const fd = new FormData();
    fd.set("id", projectId);
    startTransition(async () => {
      const result = await deleteProjectAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.push(redirectTo);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant={variant} size={size} className="w-full">
            {label}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>이 공고를 삭제할까요?</DialogTitle>
          <DialogDescription>
            삭제하면 피드와 검색에서 즉시 사라집니다. 지원자 데이터는 보존되지만
            다시 복구하려면 관리자에게 문의해야 합니다.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>취소</DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "삭제 중..." : "삭제"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
