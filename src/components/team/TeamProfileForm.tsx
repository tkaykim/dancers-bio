"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { createTeamAction, updateTeamAction } from "@/app/actions/teams";
import { AvatarUpload } from "@/components/portfolio/AvatarUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  isCreate: boolean;
  teamId?: string;
  currentProfileImg?: string | null;
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

export function TeamProfileForm({
  isCreate,
  teamId,
  currentProfileImg = null,
  defaultValues,
}: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

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
          setDirty(false);
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
      onChange={() => {
        if (!dirty) setDirty(true);
        if (message?.kind === "ok") setMessage(null);
      }}
      className="flex flex-col gap-5 pb-24"
    >
      {/* 팀 로고 — 아바타 클릭으로 직접 변경 */}
      <AvatarUpload
        currentUrl={currentProfileImg}
        name="profile_img"
        shape="rounded"
        alt={defaultValues.team_name || "팀 로고"}
        size={120}
        onChange={(file) => {
          if (file) setDirty(true);
        }}
      />

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
      <Field
        label="공개 URL slug (선택)"
        htmlFor="slug"
        hint="영문 소문자/숫자/하이픈만 가능 · 비워두면 자동 ID로 표시됩니다."
      >
        <Input
          id="slug"
          name="slug"
          maxLength={40}
          pattern="[a-z0-9-]+"
          defaultValue={defaultValues.slug}
          placeholder="예) kasper (비워둘 수 있음)"
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

      <fieldset className="flex flex-col gap-3 rounded-md border border-input p-4">
        <legend className="px-1 text-sm font-medium">SNS 핸들</legend>
        <p className="text-xs text-ink-3">
          @ 뒤의 사용자명만 입력하세요. URL을 붙여넣어도 자동 정리됩니다.
        </p>
        <Field label="Instagram" htmlFor="social_instagram">
          <Input
            id="social_instagram"
            name="social_instagram"
            type="text"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            defaultValue={defaultValues.social_instagram}
            placeholder="username"
          />
        </Field>
        <Field label="YouTube" htmlFor="social_youtube">
          <Input
            id="social_youtube"
            name="social_youtube"
            type="text"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            defaultValue={defaultValues.social_youtube}
            placeholder="channel"
          />
        </Field>
        <Field label="TikTok" htmlFor="social_tiktok">
          <Input
            id="social_tiktok"
            name="social_tiktok"
            type="text"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            defaultValue={defaultValues.social_tiktok}
            placeholder="username"
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

      {/* 하단 고정 저장 바 (글로벌 네비 57px 위에) */}
      <div
        data-testid="team-form-save-bar"
        className="fixed inset-x-0 bottom-16 z-40 border-t border-hairline-2 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/85"
      >
        <div className="mx-auto flex max-w-md items-center gap-2 px-6 py-3">
          {dirty ? (
            <span className="flex items-center gap-1.5 rounded-full bg-warn/10 px-2.5 py-1 text-[11px] font-medium text-warn">
              <span className="size-1.5 rounded-full bg-warn" />
              변경사항 있음
            </span>
          ) : message?.kind === "ok" ? (
            <span className="flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 text-[11px] font-medium text-ok">
              <CheckCircle2 size={11} />
              저장됨
            </span>
          ) : null}
          <Button
            type="submit"
            disabled={pending || (!isCreate && !dirty)}
            className="ml-auto flex items-center gap-1.5"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {pending ? "저장 중..." : isCreate ? "팀 만들기" : "저장하기"}
          </Button>
        </div>
      </div>
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
