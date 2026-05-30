"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  approveDancerIngestionAction,
  dismissDancerIngestionAction,
} from "@/app/actions/dancer-ingestion";

export function IngestionReview({
  ingestionId,
  defaultStageName,
  defaultSlug,
}: {
  ingestionId: string;
  defaultStageName: string;
  defaultSlug: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [approvedSlug, setApprovedSlug] = useState<string | null>(null);
  const [stageName, setStageName] = useState(defaultStageName);
  const [slug, setSlug] = useState(defaultSlug);

  function approve() {
    setError(null);
    const fd = new FormData();
    fd.set("ingestion_id", ingestionId);
    if (stageName.trim()) fd.set("stage_name", stageName.trim());
    if (slug.trim()) fd.set("slug", slug.trim());
    startTransition(async () => {
      const r = await approveDancerIngestionAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setApprovedSlug(slug.trim() || defaultSlug);
      router.refresh();
    });
  }

  function dismiss() {
    setError(null);
    if (!confirm("이 검수 항목을 기각하시겠어요?")) return;
    const fd = new FormData();
    fd.set("ingestion_id", ingestionId);
    startTransition(async () => {
      const r = await dismissDancerIngestionAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  if (approvedSlug) {
    return (
      <div className="rounded-md border border-ok/30 bg-ok/5 p-3 text-sm text-ok">
        승인 완료.{" "}
        <Link
          href={`/d/${approvedSlug}`}
          target="_blank"
          className="underline underline-offset-4"
        >
          /d/{approvedSlug} 보기 →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`stage_name-${ingestionId}`}>활동명 (수정 가능)</Label>
          <Input
            id={`stage_name-${ingestionId}`}
            value={stageName}
            onChange={(e) => setStageName(e.target.value)}
            maxLength={120}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`slug-${ingestionId}`}>slug (수정 가능)</Label>
          <Input
            id={`slug-${ingestionId}`}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            maxLength={120}
            placeholder="자동 생성"
          />
        </div>
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={dismiss}
          className="flex-1"
        >
          기각
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={approve}
          className="flex-1"
        >
          {pending ? "처리 중..." : "승인"}
        </Button>
      </div>
    </div>
  );
}

export function CareersPreview({
  careers,
}: {
  careers: Array<Record<string, unknown>>;
}) {
  if (careers.length === 0) {
    return (
      <p className="text-[11px] text-ink-3">추출된 경력이 없습니다.</p>
    );
  }
  return (
    <details className="rounded-md border border-border bg-secondary/40 p-3">
      <summary className="cursor-pointer text-xs font-medium text-ink-2">
        경력 미리보기 ({careers.length})
      </summary>
      <ul className="mt-2 flex flex-col gap-1">
        {careers.map((c, i) => {
          const title =
            (c.title as string | undefined) ??
            (c.role as string | undefined) ??
            (c.name as string | undefined) ??
            "(제목 없음)";
          const detail =
            (c.year as string | number | undefined) ??
            (c.date as string | undefined) ??
            (c.category as string | undefined) ??
            "";
          return (
            <li
              key={i}
              className="flex items-start justify-between gap-2 font-mono text-[11px] text-ink-2"
            >
              <span className="min-w-0 truncate">{title}</span>
              {detail !== "" ? (
                <span className="shrink-0 text-ink-3">{String(detail)}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
