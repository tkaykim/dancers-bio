"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImageIcon, X } from "lucide-react";
import { MAX_AVATAR_BYTES } from "@/lib/storage/profile-photos";
import { cn } from "@/lib/utils";

const MAX_BYTES = MAX_AVATAR_BYTES;
const MAX_MB = Math.round(MAX_BYTES / (1024 * 1024));
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ACCEPT = ACCEPTED_TYPES.join(",");

type Shape = "circle" | "rounded";

type Props = {
  /** 현재 저장된 이미지 URL (DB에 저장된 것) */
  currentUrl: string | null;
  /** form 내 hidden file input의 name (submit 시 FormData로 전달됨) */
  name: string;
  /** 사진을 표시할 모양 */
  shape?: Shape;
  /** alt 텍스트 */
  alt?: string;
  /** 변경 알림 (예: dirty 추적용) */
  onChange?: (file: File | null) => void;
  /** size in pixels (정사각) */
  size?: number;
  /** 비활성화 (편집 권한 없을 때) */
  disabled?: boolean;
};

/**
 * 일반 앱 UX 패턴: 아바타 이미지 자체를 클릭하면 사진 변경.
 * - 미리보기는 선택한 파일이 있으면 그것을 보여주고, 없으면 currentUrl.
 * - 변경된 파일은 form submit 시 FormData[`name`]에 자동 포함.
 * - hover 시 "사진 변경" 오버레이 표시.
 */
export function AvatarUpload({
  currentUrl,
  name,
  shape = "rounded",
  alt = "프로필 사진",
  onChange,
  size = 120,
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previewUrl = useMemo(() => {
    if (pickedFile) return URL.createObjectURL(pickedFile);
    return currentUrl ?? null;
  }, [pickedFile, currentUrl]);

  useEffect(() => {
    if (!pickedFile || !previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [pickedFile, previewUrl]);

  const radius = shape === "circle" ? "rounded-full" : "rounded-2xl";

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setError("JPG, PNG, WEBP, GIF 형식만 업로드할 수 있습니다.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`이미지는 ${MAX_MB}MB 이하만 업로드할 수 있습니다.`);
      return;
    }
    setPickedFile(f);
    onChange?.(f);
  }

  function handleClickAvatar() {
    if (disabled) return;
    inputRef.current?.click();
  }

  function handleClearPick() {
    setPickedFile(null);
    onChange?.(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex items-start gap-4">
      <button
        type="button"
        onClick={handleClickAvatar}
        disabled={disabled}
        aria-label={previewUrl ? "프로필 사진 변경" : "프로필 사진 추가"}
        className={cn(
          "group relative flex shrink-0 items-center justify-center overflow-hidden border border-hairline-2 bg-surface-2 transition-colors",
          radius,
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:border-primary/50",
        )}
        style={{ width: size, height: size }}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={alt}
            className="size-full object-cover"
            loading="eager"
          />
        ) : (
          <ImageIcon className="size-10 text-ink-4" />
        )}
        {!disabled ? (
          <span
            className={cn(
              "pointer-events-none absolute inset-0 flex items-center justify-center bg-foreground/55 text-background opacity-0 transition-opacity group-hover:opacity-100",
              radius,
            )}
          >
            <span className="flex flex-col items-center gap-1">
              <Camera size={20} />
              <span className="text-[11px] font-semibold">
                {previewUrl ? "사진 변경" : "사진 추가"}
              </span>
            </span>
          </span>
        ) : null}
      </button>

      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={ACCEPT}
        onChange={handleSelect}
        className="hidden"
        disabled={disabled}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {pickedFile ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-ink-2">
              <span className="font-semibold text-foreground">새 사진 준비됨</span>
              {" · "}
              <span className="truncate">{pickedFile.name}</span>
            </p>
            <button
              type="button"
              onClick={handleClearPick}
              className="inline-flex w-fit items-center gap-1 rounded-full border border-hairline-2 px-2.5 py-1 text-[11px] text-ink-2 transition-colors hover:bg-secondary"
            >
              <X size={12} /> 취소
            </button>
            <p className="text-xs text-ink-3">저장 버튼을 누르면 적용됩니다.</p>
          </div>
        ) : (
          <p className="text-xs text-ink-3">
            사진을 클릭해 변경하세요. <br />
            JPG, PNG, WEBP, GIF · 최대 {MAX_MB}MB
          </p>
        )}
        {error ? (
          <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export type { Props as AvatarUploadProps };
