"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTeamAction, updateTeamAction } from "@/app/actions/teams";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  isCreate: boolean;
  teamId?: string;
  defaultValues: {
    team_name: string;
    korean_name: string;
    slug: string;
    bio: string;
    location: string;
    specialties: string[];
    genres: string[];
    social_instagram: string;
    social_youtube: string;
    social_tiktok: string;
  };
};

export function TeamProfileForm({ isCreate, teamId, defaultValues }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        if (!isCreate && teamId) formData.set("team_id", teamId);
        setMessage(null);
        startTransition(async () => {
          const result = isCreate
            ? await createTeamAction(formData)
            : await updateTeamAction(formData);
          if (!result.ok) {
            setMessage({ kind: "error", text: result.error });
            return;
          }
          setMessage({
            kind: "ok",
            text: isCreate ? "팀이 생성됐습니다 (관리자 승인 대기)." : "저장됐습니다.",
          });
          if (isCreate && result.data) {
            router.push(`/me/teams/${result.data.id}`);
          } else {
            router.refresh();
          }
        });
      }}
      className="flex flex-col gap-5"
    >
      <Field label="팀명" htmlFor="team_name">
        <Input
          id="team_name"
          name="team_name"
          required
          maxLength={80}
          defaultValue={defaultValues.team_name}
          placeholder="예: KASPER"
        />
      </Field>
      <Field label="한글 팀명 (선택)" htmlFor="korean_name">
        <Input
          id="korean_name"
          name="korean_name"
          maxLength={40}
          defaultValue={defaultValues.korean_name}
          placeholder="예: 캐스퍼"
        />
      </Field>
      <Field label="공개 URL slug (선택)" htmlFor="slug" hint="영문 소문자/숫자/하이픈. 예: kasper → /t/kasper">
        <Input
          id="slug"
          name="slug"
          maxLength={40}
          pattern="[a-z0-9-]+"
          defaultValue={defaultValues.slug}
          placeholder="kasper"
        />
      </Field>
      <Field label="팀 소개" htmlFor="bio">
        <textarea
          id="bio"
          name="bio"
          rows={4}
          maxLength={1000}
          defaultValue={defaultValues.bio}
          placeholder="팀 소개와 활동 방향을 적어주세요"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
        />
      </Field>
      <Field label="활동 지역" htmlFor="location">
        <Input
          id="location"
          name="location"
          maxLength={80}
          defaultValue={defaultValues.location}
          placeholder="예: 서울"
        />
      </Field>
      <Field label="특기 (쉼표로 구분)" htmlFor="specialties">
        <Input
          id="specialties"
          name="specialties"
          defaultValue={defaultValues.specialties.join(", ")}
          placeholder="choreo, performance"
        />
      </Field>
      <Field label="장르 (쉼표로 구분)" htmlFor="genres">
        <Input
          id="genres"
          name="genres"
          defaultValue={defaultValues.genres.join(", ")}
          placeholder="Hip Hop, K-Pop"
        />
      </Field>
      <Field label="팀 프로필 사진" htmlFor="profile_img" hint="5MB 이하, JPG/PNG/WEBP/GIF">
        <Input
          id="profile_img"
          name="profile_img"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
        />
      </Field>

      <fieldset className="flex flex-col gap-3 rounded-md border border-input p-4">
        <legend className="px-1 text-sm font-medium">SNS 링크</legend>
        <Field label="Instagram" htmlFor="social_instagram">
          <Input
            id="social_instagram"
            name="social_instagram"
            type="url"
            defaultValue={defaultValues.social_instagram}
            placeholder="https://www.instagram.com/..."
          />
        </Field>
        <Field label="YouTube" htmlFor="social_youtube">
          <Input
            id="social_youtube"
            name="social_youtube"
            type="url"
            defaultValue={defaultValues.social_youtube}
            placeholder="https://www.youtube.com/@..."
          />
        </Field>
        <Field label="TikTok" htmlFor="social_tiktok">
          <Input
            id="social_tiktok"
            name="social_tiktok"
            type="url"
            defaultValue={defaultValues.social_tiktok}
            placeholder="https://www.tiktok.com/@..."
          />
        </Field>
      </fieldset>

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
        {pending ? "저장 중..." : isCreate ? "팀 만들기" : "저장하기"}
      </Button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
