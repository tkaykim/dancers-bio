"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addCareerAction,
  deleteCareerAction,
  updateCareerAction,
} from "@/app/actions/careers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CAREER_CATEGORY_LABELS,
  type CareerInput,
} from "@/lib/validation/portfolio";
import { VideoThumbnail } from "@/components/portfolio/VideoEmbed";

type ExistingCareer = {
  id: number;
  type: string;
  title: string;
  date: string;
  details: {
    link?: string;
    role?: string;
    description?: string;
    thumbnail?: string;
  } | null;
  is_public: boolean;
  is_representative: boolean;
};

const CATEGORIES = Object.entries(CAREER_CATEGORY_LABELS) as Array<
  [CareerInput["type"], string]
>;

export function CareerForm({
  existing,
  onDone,
}: {
  existing?: ExistingCareer;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(existing);

  return (
    <form
      action={(formData) => {
        setMessage(null);
        startTransition(async () => {
          const result = isEdit
            ? await updateCareerAction(formData)
            : await addCareerAction(formData);
          if (!result.ok) {
            setMessage({ kind: "error", text: result.error });
            return;
          }
          setMessage({ kind: "ok", text: isEdit ? "수정됐습니다." : "추가됐습니다." });
          router.refresh();
          onDone?.();
        });
      }}
      className="flex flex-col gap-3 rounded-md border border-input p-4"
    >
      {existing ? <input type="hidden" name="id" value={existing.id} /> : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="type">분류</Label>
          <select
            id="type"
            name="type"
            defaultValue={existing?.type ?? "choreo"}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date">날짜</Label>
          <Input
            id="date"
            name="date"
            type="date"
            defaultValue={existing?.date ?? new Date().toISOString().slice(0, 10)}
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">제목</Label>
        <Input
          id="title"
          name="title"
          required
          maxLength={120}
          defaultValue={existing?.title ?? ""}
          placeholder="예: aespa - Whiplash"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="role">역할 (선택)</Label>
        <Input
          id="role"
          name="role"
          maxLength={40}
          defaultValue={existing?.details?.role ?? ""}
          placeholder="예: 공동제작 · 출연 · 안무"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="link">영상 링크 (YouTube/Vimeo, 선택)</Label>
        <Input
          id="link"
          name="link"
          type="url"
          maxLength={500}
          defaultValue={existing?.details?.link ?? ""}
          placeholder="https://youtu.be/..."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">설명 (선택)</Label>
        <textarea
          id="description"
          name="description"
          rows={2}
          maxLength={500}
          defaultValue={existing?.details?.description ?? ""}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="is_public"
            defaultChecked={existing?.is_public ?? true}
            className="h-4 w-4"
          />
          공개
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="is_representative"
            defaultChecked={existing?.is_representative ?? false}
            className="h-4 w-4"
          />
          대표 경력
        </label>
      </div>

      {message ? (
        <p
          className={
            "rounded-md px-3 py-2 text-sm " +
            (message.kind === "ok"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive")
          }
        >
          {message.text}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "저장 중..." : isEdit ? "수정" : "추가"}
        </Button>
        {isEdit && existing ? (
          <DeleteCareerButton id={existing.id} onDone={onDone} />
        ) : null}
      </div>
    </form>
  );
}

function DeleteCareerButton({ id, onDone }: { id: number; onDone?: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!confirm("이 경력을 삭제할까요?")) return;
        const fd = new FormData();
        fd.set("id", String(id));
        startTransition(async () => {
          const result = await deleteCareerAction(fd);
          if (!result.ok) {
            alert(result.error);
            return;
          }
          router.refresh();
          onDone?.();
        });
      }}
    >
      삭제
    </Button>
  );
}

export function CareerListItem({ career }: { career: ExistingCareer }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return <CareerForm existing={career} onDone={() => setEditing(false)} />;
  }
  return (
    <div className="flex gap-3 rounded-md border border-input p-3">
      {career.details?.link ? (
        <div className="w-32 shrink-0">
          <VideoThumbnail url={career.details.link} />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
            {CAREER_CATEGORY_LABELS[career.type as keyof typeof CAREER_CATEGORY_LABELS] ?? career.type}
          </span>
          <span className="text-xs text-muted-foreground">{career.date}</span>
          {!career.is_public ? (
            <span className="text-xs text-amber-600">비공개</span>
          ) : null}
          {career.is_representative ? (
            <span className="text-xs text-blue-600">★ 대표</span>
          ) : null}
        </div>
        <h3 className="text-base font-semibold">{career.title}</h3>
        {career.details?.role ? (
          <p className="text-sm text-muted-foreground">{career.details.role}</p>
        ) : null}
        {career.details?.description ? (
          <p className="text-sm text-muted-foreground">{career.details.description}</p>
        ) : null}
        <div className="mt-1">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            편집
          </Button>
        </div>
      </div>
    </div>
  );
}
