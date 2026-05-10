"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertDancerProfileAction } from "@/app/actions/portfolio";
import { uploadAvatarFromBrowser } from "@/lib/storage/upload-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  userId: string;
  defaultValues: {
    stage_name: string;
    korean_name: string;
    slug: string;
    gender: string;
    bio: string;
    location: string;
    specialties: string[];
    genres: string[];
    social_instagram: string;
    social_youtube: string;
    social_tiktok: string;
  };
  isCreate: boolean;
};

export function DancerProfileForm({ userId, defaultValues, isCreate }: Props) {
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
            const upload = await uploadAvatarFromBrowser(file, userId, "profile");
            setUploading(false);
            if (!upload.ok) {
              setMessage({ kind: "error", text: upload.error });
              return;
            }
            formData.set("profile_img_url", upload.url);
          }
          formData.delete("profile_img");

          const result = await upsertDancerProfileAction(formData);
          if (!result.ok) {
            setMessage({ kind: "error", text: result.error });
            return;
          }
          setMessage({ kind: "ok", text: isCreate ? "댄서 프로필이 생성됐습니다." : "저장됐습니다." });
          if (fileRef.current) fileRef.current.value = "";
          router.refresh();
        });
      }}
      className="flex flex-col gap-5"
    >
      <Field label="활동명 (영문/예명)" htmlFor="stage_name">
        <Input
          id="stage_name"
          name="stage_name"
          required
          maxLength={80}
          defaultValue={defaultValues.stage_name}
          placeholder="예: HIYORI"
        />
      </Field>
      <Field label="한글 이름 (선택)" htmlFor="korean_name">
        <Input
          id="korean_name"
          name="korean_name"
          maxLength={40}
          defaultValue={defaultValues.korean_name}
          placeholder="예: 히요리"
        />
      </Field>
      <Field label="공개 URL slug (선택)" htmlFor="slug" hint="영문 소문자/숫자/하이픈. 예: hiyori → /d/hiyori">
        <Input
          id="slug"
          name="slug"
          maxLength={40}
          pattern="[a-z0-9-]+"
          defaultValue={defaultValues.slug}
          placeholder="hiyori"
        />
      </Field>
      <Field label="성별 (선택)" htmlFor="gender">
        <select
          id="gender"
          name="gender"
          defaultValue={defaultValues.gender}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">선택 안 함</option>
          <option value="female">여성</option>
          <option value="male">남성</option>
          <option value="other">기타</option>
        </select>
      </Field>
      <Field label="소개" htmlFor="bio">
        <textarea
          id="bio"
          name="bio"
          rows={4}
          maxLength={1000}
          defaultValue={defaultValues.bio}
          placeholder="댄서로서의 자신을 소개해 주세요"
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
      <Field label="특기 (쉼표로 구분)" htmlFor="specialties" hint="예: choreo, broadcast, workshop">
        <Input
          id="specialties"
          name="specialties"
          defaultValue={defaultValues.specialties.join(", ")}
          placeholder="choreo, performance, judge"
        />
      </Field>
      <Field label="장르 (쉼표로 구분)" htmlFor="genres" hint="예: Hip Hop, K-Pop, Locking">
        <Input
          id="genres"
          name="genres"
          defaultValue={defaultValues.genres.join(", ")}
          placeholder="Hip Hop, K-Pop"
        />
      </Field>
      <Field label="프로필 사진 (선택)" htmlFor="profile_img" hint="10MB 이하, JPG/PNG/WEBP/GIF">
        <Input
          ref={fileRef}
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
        {uploading ? "업로드 중..." : pending ? "저장 중..." : isCreate ? "댄서 프로필 만들기" : "저장하기"}
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
