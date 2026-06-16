"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfileAction } from "@/app/actions/profile";
import { uploadAvatarFromBrowser } from "@/lib/storage/upload-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  userId: string;
  defaultValues: {
    display_name: string;
    bio: string | null;
    phone: string | null;
  };
  onSaved?: () => void;
};

export function ProfileEditForm({ userId, defaultValues, onSaved }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  return (
    <form
      action={(formData) => {
        setMessage(null);
        startTransition(async () => {
          const file = fileRef.current?.files?.[0];
          if (file && file.size > 0) {
            setUploading(true);
            const result = await uploadAvatarFromBrowser(file, userId, "avatar");
            setUploading(false);
            if (!result.ok) {
              setMessage({ kind: "error", text: result.error });
              return;
            }
            formData.set("avatar_url", result.url);
          }
          formData.delete("avatar");

          const result = await updateProfileAction(formData);
          if (!result.ok) {
            setMessage({ kind: "error", text: result.error });
            return;
          }
          setMessage({ kind: "ok", text: "저장됐습니다." });
          if (fileRef.current) fileRef.current.value = "";
          router.refresh();
          onSaved?.();
        });
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="display_name">이름</Label>
        <Input
          id="display_name"
          name="display_name"
          defaultValue={defaultValues.display_name}
          maxLength={50}
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">휴대폰 번호</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          defaultValue={defaultValues.phone ?? ""}
          placeholder="010-1234-5678"
          maxLength={20}
        />
        <p className="text-xs text-muted-foreground">
          섭외·정산 연락용. 입력하면 매니저에게만 보입니다.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="bio">소개</Label>
        <textarea
          id="bio"
          name="bio"
          defaultValue={defaultValues.bio ?? ""}
          rows={4}
          maxLength={500}
          placeholder="자신을 소개해 주세요"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="avatar">프로필 사진 (선택)</Label>
        <Input
          ref={fileRef}
          id="avatar"
          name="avatar"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
        />
        <p className="text-xs text-muted-foreground">10MB 이하 JPG/PNG/WEBP/GIF</p>
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

      <Button type="submit" disabled={pending} className="w-fit">
        {uploading ? "업로드 중..." : pending ? "저장 중..." : "저장하기"}
      </Button>
    </form>
  );
}
