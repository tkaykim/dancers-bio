"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { createTeamAction, updateTeamAction } from "@/app/actions/teams";
import { checkSlugAvailability } from "@/app/actions/slug";
import { AvatarUpload } from "@/components/portfolio/AvatarUpload";
import { uploadAvatarFromBrowser } from "@/lib/storage/upload-client";
import { slugify } from "@/lib/utils/slug";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/provider";
import portfolio from "@/lib/i18n/messages/portfolio";

type Props = {
  isCreate: boolean;
  /** 현재 로그인 유저의 profile id — 브라우저 파일 업로드 경로용 (RLS: storage path[0] = auth.uid) */
  userId: string;
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
  userId,
  teamId,
  currentProfileImg = null,
  defaultValues,
}: Props) {
  const t = useT(portfolio);
  const router = useRouter();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(false);

  // 슬러그 자동 채움
  const [teamName, setTeamName] = useState(defaultValues.team_name);
  const [slug, setSlug] = useState(defaultValues.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(defaultValues.slug));
  const [slugStatus, setSlugStatus] = useState<
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "ok"; text: string }
    | { kind: "warn"; text: string; suggestion: string }
    | { kind: "error"; text: string }
  >({ kind: "idle" });

  useEffect(() => {
    if (slugTouched) return;
    setSlug(slugify(teamName));
  }, [teamName, slugTouched]);

  useEffect(() => {
    const s = slug.trim();
    if (!s) { setSlugStatus({ kind: "idle" }); return; }
    if (s.length < 2) { setSlugStatus({ kind: "error", text: t("team_form.slug_too_short") }); return; }
    if (!/^[a-z0-9-]+$/.test(s)) {
      setSlugStatus({ kind: "error", text: t("team_form.slug_invalid") });
      return;
    }
    setSlugStatus({ kind: "checking" });
    const timer = setTimeout(async () => {
      const r = await checkSlugAvailability(s, "teams", teamId ?? null);
      if (!r.ok) { setSlugStatus({ kind: "error", text: r.error }); return; }
      if (r.available) setSlugStatus({ kind: "ok", text: t("team_form.slug_available") });
      else setSlugStatus({ kind: "warn", text: t("team_form.slug_taken"), suggestion: r.suggestion });
    }, 400);
    return () => clearTimeout(timer);
  }, [slug, teamId, t]);

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
          // 큰 사진을 Server Action body(Vercel 4.5MB)로 보내면 413 → 페이지 not found.
          // 댄서 폼과 동일: 브라우저에서 Supabase Storage 로 직접 업로드 후 URL 만 액션에 전달.
          const file = formData.get("profile_img");
          if (file instanceof File && file.size > 0) {
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
            text: isCreate ? t("team_form.created") : t("team_form.saved"),
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
        alt={defaultValues.team_name || t("team_form.logo_alt")}
        size={120}
        onChange={(file) => {
          if (file) setDirty(true);
        }}
      />

      <Field label={t("team_form.field_team_name")} htmlFor="team_name">
        <Input
          id="team_name"
          name="team_name"
          required
          maxLength={80}
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder={t("team_form.placeholder_team_name")}
        />
      </Field>
      <Field label={t("team_form.field_korean_name")} htmlFor="korean_name">
        <Input
          id="korean_name"
          name="korean_name"
          maxLength={40}
          defaultValue={defaultValues.korean_name}
          placeholder={t("team_form.placeholder_korean_name")}
        />
      </Field>
      <Field
        label={t("team_form.field_slug")}
        htmlFor="slug"
        hint={t("team_form.hint_slug")}
      >
        <Input
          id="slug"
          name="slug"
          maxLength={40}
          pattern="[a-z0-9-]+"
          value={slug}
          onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
          placeholder={t("team_form.placeholder_slug")}
        />
        {slugStatus.kind === "checking" ? (
          <p className="text-xs text-ink-3">{t("team_form.slug_checking")}</p>
        ) : slugStatus.kind === "ok" ? (
          <p className="text-xs text-ok">✓ {slugStatus.text}</p>
        ) : slugStatus.kind === "warn" ? (
          <p className="text-xs text-warn">
            {slugStatus.text}.{" "}
            <button
              type="button"
              onClick={() => { setSlug(slugStatus.suggestion); setSlugTouched(true); }}
              className="underline"
            >
              {t("team_form.slug_suggestion", { slug: slugStatus.suggestion })}
            </button>
          </p>
        ) : slugStatus.kind === "error" ? (
          <p className="text-xs text-destructive">{slugStatus.text}</p>
        ) : null}
      </Field>
      <Field label={t("team_form.field_bio")} htmlFor="bio">
        <textarea
          id="bio"
          name="bio"
          rows={4}
          maxLength={1000}
          defaultValue={defaultValues.bio}
          placeholder={t("team_form.placeholder_bio")}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
        />
      </Field>
      <Field label={t("team_form.field_location")} htmlFor="location">
        <Input
          id="location"
          name="location"
          maxLength={80}
          defaultValue={defaultValues.location}
          placeholder={t("team_form.placeholder_location")}
        />
      </Field>
      <Field label={t("team_form.field_specialties")} htmlFor="specialties">
        <Input
          id="specialties"
          name="specialties"
          defaultValue={defaultValues.specialties.join(", ")}
          placeholder="choreo, performance"
        />
      </Field>
      <Field label={t("team_form.field_genres")} htmlFor="genres">
        <Input
          id="genres"
          name="genres"
          defaultValue={defaultValues.genres.join(", ")}
          placeholder="Hip Hop, K-Pop"
        />
      </Field>

      <fieldset className="flex flex-col gap-3 rounded-md border border-input p-4">
        <legend className="px-1 text-sm font-medium">
          {t("team_form.social_legend")}
        </legend>
        <p className="text-xs text-ink-3">{t("team_form.social_hint")}</p>
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
              {t("team_form.dirty")}
            </span>
          ) : message?.kind === "ok" ? (
            <span className="flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 text-[11px] font-medium text-ok">
              <CheckCircle2 size={11} />
              {t("team_form.saved_badge")}
            </span>
          ) : null}
          <Button
            type="submit"
            disabled={pending || uploading || (!isCreate && !dirty)}
            className="ml-auto flex items-center gap-1.5"
          >
            {pending || uploading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {uploading
              ? t("team_form.uploading")
              : pending
                ? t("team_form.saving")
                : isCreate
                  ? t("team_form.create")
                  : t("team_form.save")}
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
