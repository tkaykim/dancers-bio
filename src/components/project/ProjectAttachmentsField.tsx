"use client";

import { useState } from "react";
import { FileText, ImageIcon, Upload, Video, X } from "lucide-react";
import { formatBytes } from "@/lib/storage/dancer-portfolio-file";
import {
  PROJECT_FILE_MAX_COUNT,
  type ProjectAttachmentDraft,
} from "@/lib/storage/project-file";
import {
  deleteUploadedProjectFileFromBrowser,
  uploadProjectFileFromBrowser,
} from "@/lib/storage/upload-project-file";
import { Label } from "@/components/ui/label";

function AttachmentIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <ImageIcon className="size-4" aria-hidden />;
  if (mime.startsWith("video/")) return <Video className="size-4" aria-hidden />;
  return <FileText className="size-4" aria-hidden />;
}

export function ProjectAttachmentsField({
  initial = [],
  disabled = false,
  onUploadingChange,
}: {
  initial?: ProjectAttachmentDraft[];
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [attachments, setAttachments] = useState<ProjectAttachmentDraft[]>(initial);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPickFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    setError(null);
    setUploading(true);
    onUploadingChange?.(true);
    let nextCount = attachments.length;

    try {
      for (const file of files) {
        if (nextCount >= PROJECT_FILE_MAX_COUNT) {
          setError(`사진·영상·문서는 합쳐서 최대 ${PROJECT_FILE_MAX_COUNT}개까지 첨부할 수 있습니다.`);
          break;
        }

        const result = await uploadProjectFileFromBrowser(file);
        if (!result.ok) {
          setError(result.error);
          continue;
        }

        nextCount += 1;
        setAttachments((current) => [...current, result.file]);
      }
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  }

  async function removeAttachment(index: number) {
    const target = attachments[index];
    setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));

    if (target && !target.id) {
      const result = await deleteUploadedProjectFileFromBrowser(target.path);
      if (!result.ok) setError(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="project-files">사진·영상·참고자료 (선택)</Label>
      <input
        type="hidden"
        name="attachments"
        value={JSON.stringify(attachments)}
        readOnly
      />
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background px-4 py-6 text-sm text-ink-2 transition hover:border-foreground/40">
        <input
          id="project-files"
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
          onChange={onPickFiles}
          disabled={disabled || uploading || attachments.length >= PROJECT_FILE_MAX_COUNT}
          className="hidden"
        />
        <Upload className="size-4" aria-hidden />
        {uploading
          ? "업로드 중..."
          : attachments.length >= PROJECT_FILE_MAX_COUNT
            ? "첨부 가능 개수를 모두 사용했습니다."
            : "+ 사진·영상·파일 선택"}
      </label>

      {attachments.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {attachments.map((attachment, index) => (
            <li
              key={attachment.id ?? attachment.path}
              className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm"
            >
              <AttachmentIcon mime={attachment.mime} />
              <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
              <span className="shrink-0 text-[11px] text-ink-3">
                {formatBytes(attachment.size)}
              </span>
              <button
                type="button"
                onClick={() => void removeAttachment(index)}
                disabled={disabled || uploading}
                aria-label={`${attachment.name} 제거`}
                className="shrink-0 rounded p-1 text-ink-3 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <p className="text-xs leading-relaxed text-muted-foreground">
        사진은 공고 본문에 바로 표시되고, 영상은 본문에서 재생됩니다.
        PDF는 참고자료로 제공됩니다.
        파일당 최대 50MB, 전체 최대 10개까지 첨부할 수 있습니다.
      </p>
    </div>
  );
}
