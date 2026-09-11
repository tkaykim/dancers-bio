"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { upsertDancerProfileAction } from "@/app/actions/portfolio";
import { checkSlugAvailability } from "@/app/actions/slug";
import { uploadAvatarFromBrowser } from "@/lib/storage/upload-client";
import { slugify } from "@/lib/utils/slug";
import { AvatarUpload } from "@/components/portfolio/AvatarUpload";
import {
  NationalityVisaFields,
  type NationalityVisaValue,
} from "@/components/portfolio/NationalityVisaFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/provider";
import portfolio from "@/lib/i18n/messages/portfolio";

type Props = {
  userId: string;
  dancerId?: string;
  currentProfileImg: string | null;
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
    height_cm: string;
    shoe_size_mm: string;
    nationalityVisa: Partial<NationalityVisaValue>;
  };
  isCreate: boolean;
};

export function DancerProfileForm({
  userId,
  dancerId,
  currentProfileImg,
  defaultValues,
  isCreate,
}: Props) {
  const t = useT(portfolio);
  const router = useRouter();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(false);

  // 슬러그 자동 채움 — stage_name 입력 시 사용자가 수동 편집한 적 없으면 동기화
  const [stageName, setStageName] = useState(defaultValues.stage_name);
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
    setSlug(slugify(stageName));
  }, [stageName, slugTouched]);

  // 슬러그 가용성 디바운스 체크
  useEffect(() => {
    const s = slug.trim();
    if (!s) { setSlugStatus({ kind: "idle" }); return; }
    if (s.length < 2) { setSlugStatus({ kind: "error", text: t("dancer_form.slug_too_short") }); return; }
    if (!/^[a-z0-9-]+$/.test(s)) {
      setSlugStatus({ kind: "error", text: t("dancer_form.slug_invalid") });
      return;
    }
    setSlugStatus({ kind: "checking" });
    const timer = setTimeout(async () => {
      const r = await checkSlugAvailability(s, "dancers", dancerId ?? null);
      if (!r.ok) { setSlugStatus({ kind: "error", text: r.error }); return; }
      if (r.available) setSlugStatus({ kind: "ok", text: t("dancer_form.slug_available") });
      else setSlugStatus({ kind: "warn", text: t("dancer_form.slug_taken"), suggestion: r.suggestion });
    }, 400);
    return () => clearTimeout(timer);
  }, [slug, dancerId, t]);

  // 미저장 변경사항 있을 때 페이지 떠나기 경고
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // 페이지 내 다른 컴포넌트에 dirty 상태 알림
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("dancer-profile-form-dirty", { detail: { dirty } }),
    );
  }, [dirty]);

  return (
    <form
      action={(formData) => {
        setMessage(null);
        startTransition(async () => {
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

          const result = await upsertDancerProfileAction(formData);
          if (!result.ok) {
            setMessage({ kind: "error", text: result.error });
            return;
          }
          setDirty(false);
          setMessage({
            kind: "ok",
            text: isCreate ? t("dancer_form.created") : t("dancer_form.saved"),
          });
          router.refresh();
        });
      }}
      onChange={() => {
        if (!dirty) setDirty(true);
        if (message?.kind === "ok") setMessage(null);
      }}
      className="flex flex-col gap-5 pb-24"
    >
      {dancerId ? (
        <input type="hidden" name="dancer_id" value={dancerId} />
      ) : null}

      {/* 프로필 사진 — 아바타 클릭으로 직접 변경 */}
      <AvatarUpload
        currentUrl={currentProfileImg}
        name="profile_img"
        shape="rounded"
        alt={defaultValues.stage_name || t("dancer_form.avatar_alt")}
        size={120}
        onChange={(file) => {
          if (file) setDirty(true);
        }}
      />

      <Field label={t("dancer_form.field_stage_name")} htmlFor="stage_name">
        <Input
          id="stage_name"
          name="stage_name"
          required
          maxLength={80}
          value={stageName}
          onChange={(e) => setStageName(e.target.value)}
          placeholder={t("dancer_form.placeholder_stage_name")}
        />
      </Field>
      <Field label={t("dancer_form.field_korean_name")} htmlFor="korean_name">
        <Input
          id="korean_name"
          name="korean_name"
          maxLength={40}
          defaultValue={defaultValues.korean_name}
          placeholder={t("dancer_form.placeholder_korean_name")}
        />
      </Field>
      <Field
        label={t("dancer_form.field_slug")}
        htmlFor="slug"
        hint={
          slugTouched
            ? t("dancer_form.hint_slug_manual")
            : t("dancer_form.hint_slug_auto")
        }
      >
        {slugTouched ? (
          <>
            <Input
              id="slug"
              name="slug"
              maxLength={40}
              pattern="[a-z0-9-]+"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); }}
              placeholder="my-stage-name"
            />
            {slugStatus.kind === "checking" ? (
              <p className="text-xs text-ink-3">{t("dancer_form.slug_checking")}</p>
            ) : slugStatus.kind === "ok" ? (
              <p className="text-xs text-ok">✓ {slugStatus.text} · /d/{slug}</p>
            ) : slugStatus.kind === "warn" ? (
              <p className="text-xs text-warn">
                <SlugTakenHint
                  sentence={t("dancer_form.slug_taken_hint", {
                    suggestion: slugStatus.suggestion,
                  })}
                  suggestion={slugStatus.suggestion}
                />
              </p>
            ) : slugStatus.kind === "error" ? (
              <p className="text-xs text-destructive">{slugStatus.text}</p>
            ) : null}
            <button
              type="button"
              onClick={() => { setSlugTouched(false); setSlug(slugify(stageName)); }}
              className="self-start text-xs text-ink-3 underline-offset-4 hover:underline"
            >
              {t("dancer_form.slug_reset")}
            </button>
            {/* slug hidden input ensures formData captures even if visible input is unmounted */}
          </>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
            <span className="truncate font-mono text-ink-2">
              /d/
              <span className="text-foreground">
                {slug || t("dancer_form.slug_auto_placeholder")}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setSlugTouched(true)}
              className="shrink-0 text-xs text-primary underline-offset-4 hover:underline"
            >
              {t("dancer_form.slug_set_manually")}
            </button>
            <input type="hidden" name="slug" value={slug} />
          </div>
        )}
      </Field>
      <Field label={t("dancer_form.field_gender")} htmlFor="gender">
        <select
          id="gender"
          name="gender"
          defaultValue={defaultValues.gender}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{t("dancer_form.gender_none")}</option>
          <option value="female">{t("dancer_form.gender_female")}</option>
          <option value="male">{t("dancer_form.gender_male")}</option>
          <option value="other">{t("dancer_form.gender_other")}</option>
        </select>
      </Field>
      <Field label={t("dancer_form.field_bio")} htmlFor="bio">
        <textarea
          id="bio"
          name="bio"
          rows={4}
          maxLength={1000}
          defaultValue={defaultValues.bio}
          placeholder={t("dancer_form.placeholder_bio")}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
        />
      </Field>
      <Field label={t("dancer_form.field_location")} htmlFor="location">
        <Input
          id="location"
          name="location"
          maxLength={80}
          defaultValue={defaultValues.location}
          placeholder={t("dancer_form.placeholder_location")}
        />
      </Field>
      <Field
        label={t("dancer_form.field_body")}
        htmlFor="height_cm"
        hint={t("dancer_form.hint_body")}
      >
        <div className="flex gap-2">
          <Input
            id="height_cm"
            name="height_cm"
            type="number"
            inputMode="numeric"
            min={100}
            max={250}
            defaultValue={defaultValues.height_cm}
            placeholder={t("dancer_form.placeholder_height")}
          />
          <Input
            id="shoe_size_mm"
            name="shoe_size_mm"
            type="number"
            inputMode="numeric"
            min={180}
            max={330}
            defaultValue={defaultValues.shoe_size_mm}
            placeholder={t("dancer_form.placeholder_shoe")}
          />
        </div>
      </Field>

      <fieldset className="flex flex-col gap-3 rounded-md border border-input p-4">
        <legend className="px-1 text-sm font-medium">
          {t("dancer_form.nationality_legend")}
        </legend>
        <p className="text-xs text-ink-3">{t("dancer_form.nationality_hint")}</p>
        <NationalityVisaFields
          defaultValue={defaultValues.nationalityVisa}
          onChange={() => {
            if (!dirty) setDirty(true);
            if (message?.kind === "ok") setMessage(null);
          }}
        />
      </fieldset>
      <Field
        label={t("dancer_form.field_specialties")}
        htmlFor="specialties"
        hint={t("dancer_form.hint_specialties")}
      >
        <Input
          id="specialties"
          name="specialties"
          defaultValue={defaultValues.specialties.join(", ")}
          placeholder="choreo, performance, judge"
        />
      </Field>
      <Field
        label={t("dancer_form.field_genres")}
        htmlFor="genres"
        hint={t("dancer_form.hint_genres")}
      >
        <Input
          id="genres"
          name="genres"
          defaultValue={defaultValues.genres.join(", ")}
          placeholder="Hip Hop, K-Pop"
        />
      </Field>

      <fieldset className="flex flex-col gap-3 rounded-md border border-input p-4">
        <legend className="px-1 text-sm font-medium">
          {t("dancer_form.social_legend")}
        </legend>
        <p className="text-xs text-ink-3">{t("dancer_form.social_hint")}</p>
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

      {/* 화면 하단 고정 저장 바 — 글로벌 네비(57px) 위에 배치 */}
      <div
        data-testid="profile-form-save-bar"
        className="fixed inset-x-0 bottom-16 z-40 border-t border-hairline-2 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/85"
      >
        <div className="mx-auto flex max-w-md items-center gap-2 px-6 py-3">
          {dirty ? (
            <span className="flex items-center gap-1.5 rounded-full bg-warn/10 px-2.5 py-1 text-[11px] font-medium text-warn">
              <span className="size-1.5 rounded-full bg-warn" />
              {t("dancer_form.dirty")}
            </span>
          ) : message?.kind === "ok" ? (
            <span className="flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 text-[11px] font-medium text-ok">
              <CheckCircle2 size={11} />
              {t("dancer_form.saved_badge")}
            </span>
          ) : null}
          <Button
            type="submit"
            disabled={pending || uploading || (!isCreate && !dirty)}
            className="ml-auto flex items-center gap-1.5"
          >
            {pending || uploading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {uploading
              ? t("dancer_form.uploading")
              : pending
              ? t("dancer_form.saving")
              : isCreate
              ? t("dancer_form.create")
              : t("dancer_form.save")}
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * 문장 가운데 들어가는 동적 값(<span>)을 살리려고 문장을 쪼개지 않는다.
 * 통 문장 키 하나를 번역한 뒤, 그 값의 위치만 찾아 감싼다.
 */
function SlugTakenHint({
  sentence,
  suggestion,
}: {
  sentence: string;
  suggestion: string;
}) {
  const at = sentence.indexOf(suggestion);
  if (at < 0) return <>{sentence}</>;
  return (
    <>
      {sentence.slice(0, at)}
      <span className="font-mono text-foreground">{suggestion}</span>
      {sentence.slice(at + suggestion.length)}
    </>
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
