"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { upsertDancerProfileAction } from "@/app/actions/portfolio";
import { checkSlugAvailability } from "@/app/actions/slug";
import { uploadAvatarFromBrowser } from "@/lib/storage/upload-client";
import { slugify } from "@/lib/utils/slug";
import { AvatarUpload } from "@/components/portfolio/AvatarUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    if (s.length < 2) { setSlugStatus({ kind: "error", text: "2자 이상이어야 합니다." }); return; }
    if (!/^[a-z0-9-]+$/.test(s)) {
      setSlugStatus({ kind: "error", text: "영문 소문자/숫자/하이픈만." });
      return;
    }
    setSlugStatus({ kind: "checking" });
    const t = setTimeout(async () => {
      const r = await checkSlugAvailability(s, "dancers", dancerId ?? null);
      if (!r.ok) { setSlugStatus({ kind: "error", text: r.error }); return; }
      if (r.available) setSlugStatus({ kind: "ok", text: "사용 가능" });
      else setSlugStatus({ kind: "warn", text: "이미 사용 중", suggestion: r.suggestion });
    }, 400);
    return () => clearTimeout(t);
  }, [slug, dancerId]);

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
            text: isCreate ? "댄서 프로필이 생성됐습니다." : "저장됐습니다.",
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
        alt={defaultValues.stage_name || "프로필 사진"}
        size={120}
        onChange={(file) => {
          if (file) setDirty(true);
        }}
      />

      <Field label="활동명 (영문/예명)" htmlFor="stage_name">
        <Input
          id="stage_name"
          name="stage_name"
          required
          maxLength={80}
          value={stageName}
          onChange={(e) => setStageName(e.target.value)}
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
      <Field
        label="공개 페이지 주소"
        htmlFor="slug"
        hint={
          slugTouched
            ? "영문 소문자/숫자/하이픈만 가능. 중복 시 자동으로 -2, -3 등이 붙어요."
            : "활동명에서 자동으로 만들어집니다. 직접 정하고 싶으면 '직접 설정'을 누르세요."
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
              <p className="text-xs text-ink-3">확인 중...</p>
            ) : slugStatus.kind === "ok" ? (
              <p className="text-xs text-ok">✓ {slugStatus.text} · /d/{slug}</p>
            ) : slugStatus.kind === "warn" ? (
              <p className="text-xs text-warn">
                이미 사용 중. 저장하면 자동으로{" "}
                <span className="font-mono text-foreground">{slugStatus.suggestion}</span>{" "}
                같이 뒤에 숫자가 붙어요.
              </p>
            ) : slugStatus.kind === "error" ? (
              <p className="text-xs text-destructive">{slugStatus.text}</p>
            ) : null}
            <button
              type="button"
              onClick={() => { setSlugTouched(false); setSlug(slugify(stageName)); }}
              className="self-start text-xs text-ink-3 underline-offset-4 hover:underline"
            >
              ← 자동 생성으로 되돌리기
            </button>
            {/* slug hidden input ensures formData captures even if visible input is unmounted */}
          </>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
            <span className="truncate font-mono text-ink-2">
              /d/<span className="text-foreground">{slug || "자동 생성됩니다"}</span>
            </span>
            <button
              type="button"
              onClick={() => setSlugTouched(true)}
              className="shrink-0 text-xs text-primary underline-offset-4 hover:underline"
            >
              직접 설정
            </button>
            <input type="hidden" name="slug" value={slug} />
          </div>
        )}
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
      <Field
        label="특기 (쉼표로 구분)"
        htmlFor="specialties"
        hint="예: choreo, broadcast, workshop"
      >
        <Input
          id="specialties"
          name="specialties"
          defaultValue={defaultValues.specialties.join(", ")}
          placeholder="choreo, performance, judge"
        />
      </Field>
      <Field
        label="장르 (쉼표로 구분)"
        htmlFor="genres"
        hint="예: Hip Hop, K-Pop, Locking"
      >
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

      {/* 화면 하단 고정 저장 바 — 글로벌 네비(57px) 위에 배치 */}
      <div
        data-testid="profile-form-save-bar"
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
            disabled={pending || uploading || (!isCreate && !dirty)}
            className="ml-auto flex items-center gap-1.5"
          >
            {pending || uploading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {uploading
              ? "업로드 중..."
              : pending
              ? "저장 중..."
              : isCreate
              ? "댄서 프로필 만들기"
              : "저장하기"}
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
