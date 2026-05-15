"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Image as ImageIcon, Trash2, Upload, Video } from "lucide-react";
import {
  removeDancerPortfolioFileAction,
  setDancerPortfolioFileAction,
} from "@/app/actions/portfolio";
import {
  formatBytes,
  MAX_PORTFOLIO_FILE_BYTES,
  ALLOWED_PORTFOLIO_FILE_TYPES,
} from "@/lib/storage/dancer-portfolio-file";
import { uploadDancerPortfolioFileFromBrowser } from "@/lib/storage/upload-dancer-portfolio-file";
import { Button } from "@/components/ui/button";

type CurrentFile = {
  url: string;
  name: string | null;
  sizeBytes: number | null;
  mime: string | null;
  uploadedAt: string | null;
} | null;

function FileIcon({ mime }: { mime: string | null }) {
  if (!mime) return <FileText size={16} aria-hidden />;
  if (mime.startsWith("image/")) return <ImageIcon size={16} aria-hidden />;
  if (mime.startsWith("video/")) return <Video size={16} aria-hidden />;
  return <FileText size={16} aria-hidden />;
}

export function PortfolioFileUploader({
  dancerId,
  initialFile,
}: {
  dancerId: string;
  initialFile: CurrentFile;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [current, setCurrent] = useState<CurrentFile>(initialFile);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, startRemove] = useTransition();

  function pick() {
    inputRef.current?.click();
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const upload = await uploadDancerPortfolioFileFromBrowser(file, dancerId);
      if (!upload.ok) {
        setError(upload.error);
        return;
      }
      const fd = new FormData();
      fd.set("dancer_id", dancerId);
      fd.set("url", upload.url);
      fd.set("name", upload.name);
      fd.set("size", String(upload.size));
      fd.set("mime", upload.mime);
      const result = await setDancerPortfolioFileAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCurrent({
        url: upload.url,
        name: upload.name,
        sizeBytes: upload.size,
        mime: upload.mime,
        uploadedAt: new Date().toISOString(),
      });
      router.refresh();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onRemove() {
    if (!current) return;
    if (!confirm("첨부된 포트폴리오 파일을 삭제하시겠습니까?")) return;
    setError(null);
    startRemove(async () => {
      const fd = new FormData();
      fd.set("dancer_id", dancerId);
      const result = await removeDancerPortfolioFileAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCurrent(null);
      router.refresh();
    });
  }

  const accept = ALLOWED_PORTFOLIO_FILE_TYPES.join(",");

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-semibold leading-snug">포트폴리오 파일</p>
          <p className="text-xs text-ink-3">
            PDF · JPG · PNG · MP4 · 최대 {formatBytes(MAX_PORTFOLIO_FILE_BYTES)}.
            공개 프로필에서 누구나 다운받을 수 있어요.
          </p>
        </div>
      </div>

      {current ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-ink-2">
            <FileIcon mime={current.mime} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <a
              href={current.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              {current.name ?? "포트폴리오 파일"}
            </a>
            <p className="text-[11px] text-ink-3">
              {current.sizeBytes ? formatBytes(current.sizeBytes) : ""}
              {current.sizeBytes && current.mime ? " · " : ""}
              {current.mime ?? ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onRemove}
            disabled={removing || uploading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            aria-label="삭제"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={onFileSelected}
        className="hidden"
      />

      <Button
        type="button"
        variant={current ? "outline" : "default"}
        onClick={pick}
        disabled={uploading || removing}
        className="w-full gap-2"
      >
        <Upload size={16} aria-hidden />
        {uploading
          ? "업로드 중..."
          : current
            ? "다른 파일로 교체"
            : "파일 선택해서 업로드"}
      </Button>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
