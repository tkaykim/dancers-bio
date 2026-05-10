"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfileAction } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  defaultValues: {
    display_name: string;
    bio: string | null;
  };
};

export function ProfileEditForm({ defaultValues }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        setMessage(null);
        startTransition(async () => {
          const result = await updateProfileAction(formData);
          if (!result.ok) {
            setMessage({ kind: "error", text: result.error });
            return;
          }
          setMessage({ kind: "ok", text: "저장됐습니다." });
          router.refresh();
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
          id="avatar"
          name="avatar"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
        />
        <p className="text-xs text-muted-foreground">5MB 이하 JPG/PNG/WEBP/GIF</p>
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
        {pending ? "저장 중..." : "저장하기"}
      </Button>
    </form>
  );
}
