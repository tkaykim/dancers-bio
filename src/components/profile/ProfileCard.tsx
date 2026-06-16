"use client";

import Image from "next/image";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { ProfileEditForm } from "./ProfileEditForm";

type Props = {
  userId: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  phone: string | null;
};

export function ProfileCard({
  userId,
  displayName,
  bio,
  avatarUrl,
  phone,
}: Props) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink-2">프로필 수정</h2>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs font-medium text-ink-3 underline-offset-4 hover:underline"
          >
            취소
          </button>
        </div>
        <ProfileEditForm
          userId={userId}
          defaultValues={{ display_name: displayName, bio, phone }}
          onSaved={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4 rounded-2xl border border-border bg-card p-4">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={displayName}
          width={64}
          height={64}
          className="h-16 w-16 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-secondary text-xl font-bold">
          {displayName?.[0] ?? "U"}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h1 className="truncate text-xl font-extrabold tracking-tight">
          {displayName}
        </h1>
        {bio ? (
          <p className="line-clamp-2 text-sm leading-relaxed text-ink-2">
            {bio}
          </p>
        ) : (
          <p className="text-xs text-ink-3">소개를 추가해 보세요.</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label="프로필 수정"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline-2 text-ink-2 transition-colors hover:bg-secondary"
      >
        <Pencil size={15} />
      </button>
    </div>
  );
}
