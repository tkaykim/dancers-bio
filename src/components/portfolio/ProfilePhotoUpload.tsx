"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, Upload, X } from "lucide-react";

import { MAX_AVATAR_BYTES } from "@/lib/storage/profile-photos";
import { cn } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const MAX_BYTES = MAX_AVATAR_BYTES; // 10MB (서버 검증과 일치)
const MAX_MB = Math.round(MAX_BYTES / (1024 * 1024));
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

type Props = {
  file: File | null;
  onChange: (file: File | null) => void;
};

export function ProfilePhotoUpload({ file, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const [error, setError] = useState<string | null>(null);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.files?.[0];
    if (!next) return;
    setError(null);
    if (!ACCEPTED_TYPES.includes(next.type)) {
      setError("JPG, PNG, WEBP, GIF 형식만 업로드할 수 있습니다.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setError(`이미지는 ${MAX_MB}MB 이하만 업로드할 수 있습니다.`);
      return;
    }
    onChange(next);
  };

  const handleRemove = () => {
    onChange(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "relative flex size-32 items-center justify-center overflow-hidden rounded-xl border border-hairline-2 bg-surface-2",
          )}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="프로필 미리보기"
              className="size-full object-cover"
            />
          ) : (
            <ImageIcon className="size-10 text-ink-4" />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            onChange={handleSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Upload className="size-4" />
            {preview ? "사진 변경" : "사진 업로드"}
          </button>
          {preview ? (
            <button
              type="button"
              onClick={handleRemove}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-hairline-2 px-4 py-2 text-sm text-ink-2 transition-colors hover:bg-secondary"
            >
              <X className="size-4" />
              제거
            </button>
          ) : null}
          <p className="text-xs text-ink-3">JPG, PNG, WEBP, GIF · 최대 {MAX_MB}MB</p>
        </div>
      </div>
      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
