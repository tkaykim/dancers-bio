"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfileAction } from "@/app/actions/profile";
import { uploadAvatarFromBrowser } from "@/lib/storage/upload-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InternationalPhoneField } from "@/components/auth/InternationalPhoneField";
import { useT } from "@/lib/i18n/provider";
import profile from "@/lib/i18n/messages/profile";

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
  const t = useT(profile);
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
          setMessage({ kind: "ok", text: t("edit.saved") });
          if (fileRef.current) fileRef.current.value = "";
          router.refresh();
          onSaved?.();
        });
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="display_name">{t("edit.name")}</Label>
        <Input
          id="display_name"
          name="display_name"
          defaultValue={defaultValues.display_name}
          maxLength={50}
          required
        />
      </div>

      <InternationalPhoneField
        idPrefix="profile"
        defaultValue={defaultValues.phone}
        defaultUnavailable={!defaultValues.phone}
        privacyHint
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="bio">{t("edit.bio")}</Label>
        <textarea
          id="bio"
          name="bio"
          defaultValue={defaultValues.bio ?? ""}
          rows={4}
          maxLength={500}
          placeholder={t("edit.bio_placeholder")}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="avatar">{t("edit.avatar")}</Label>
        <Input
          ref={fileRef}
          id="avatar"
          name="avatar"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
        />
        <p className="text-xs text-muted-foreground">{t("edit.avatar_hint")}</p>
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
        {uploading
          ? t("edit.uploading")
          : pending
            ? t("edit.saving")
            : t("edit.submit")}
      </Button>
    </form>
  );
}
