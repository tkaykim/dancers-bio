"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Loader2, Shield } from "lucide-react";

import { createDancerProfileAction } from "@/app/actions/portfolio";
import { getBrowserClient } from "@/lib/supabase/browser";
import { uploadAvatarFromBrowser } from "@/lib/storage/upload-client";
import { ProfilePhotoUpload } from "@/components/portfolio/ProfilePhotoUpload";
import {
  SocialLinksInput,
  type SocialHandles,
} from "@/components/portfolio/SocialLinksInput";
import { PriorityMultiSelect } from "@/components/ui/priority-multi-select";
import {
  NationalityVisaFields,
  buildNationalityVisaValue,
  type NationalityVisaValue,
} from "@/components/portfolio/NationalityVisaFields";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 6;

const SPECIALTIES = [
  { value: "choreo", label: "안무 (Choreography)" },
  { value: "broadcast", label: "방송 (Broadcast)" },
  { value: "battle", label: "배틀 (Battle)" },
  { value: "workshop", label: "워크샵 (Workshop)" },
  { value: "judge", label: "심사 (Judge)" },
  { value: "performance", label: "공연 (Performance)" },
];

const GENRES = [
  "Hip Hop",
  "Popping",
  "Locking",
  "Waacking",
  "Voguing",
  "House",
  "Krump",
  "Breaking",
  "Heels",
  "Contemporary",
  "Jazz",
  "K-Pop",
];

type Gender = "" | "male" | "female" | "other";

type PendingCareer = {
  type: string;
  title: string;
  date: string;
  role?: string | null;
  description?: string | null;
  link?: string | null;
};

type FormState = {
  stage_name: string;
  korean_name: string;
  location: string;
  gender: Gender;
  bio: string;
  height_cm: string;
  shoe_size_mm: string;
  specialties: string[];
  genres: string[];
  social: SocialHandles;
  profile_img: File | null;
  pendingCareers: PendingCareer[];
  nationalityVisa: NationalityVisaValue;
};

const initialState: FormState = {
  stage_name: "",
  korean_name: "",
  location: "",
  gender: "",
  bio: "",
  height_cm: "",
  shoe_size_mm: "",
  specialties: [],
  genres: [],
  social: {},
  profile_img: null,
  pendingCareers: [],
  nationalityVisa: buildNationalityVisaValue(),
};

type CreateProfileWizardProps = {
  userId: string;
  role: "self" | "manager";
  /** Lite: 프로필 생성 완료 후 돌아갈 안전 경로 (same-origin pathname). */
  returnTo?: string | null;
};

export function CreateProfileWizard({ userId, role, returnTo = null }: CreateProfileWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  const previewUrl = useMemo(
    () => (data.profile_img ? URL.createObjectURL(data.profile_img) : null),
    [data.profile_img],
  );
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const goNext = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const goPrev = () => setStep((s) => Math.max(s - 1, 1));

  const failWith = (message: string) => {
    setError(message);
    // 에러 배너가 상단에 뜨므로 위로 스크롤(모바일에서 하단 접힘으로 못 보던 문제 방지).
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = () => {
    setError(null);
    startTransition(async () => {
      // 서버액션 호출 전에 세션 토큰을 미리 갱신해, 서버가 유효한 세션을 읽도록 한다.
      // (아이폰/카카오톡 인앱 브라우저의 토큰 갱신 레이스로 서버 INSERT가 RLS 거부되던 문제 방어.)
      try {
        await getBrowserClient().auth.getSession();
      } catch {
        // 갱신 실패해도 서버측 방어(멱등+친절한 에러)가 있으므로 계속 진행.
      }

      let profileImgUrl: string | null = null;
      if (data.profile_img) {
        setUploading(true);
        const upload = await uploadAvatarFromBrowser(
          data.profile_img,
          userId,
          "profile",
        );
        setUploading(false);
        if (!upload.ok) {
          failWith(upload.error);
          return;
        }
        profileImgUrl = upload.url;
      }

      const fd = new FormData();
      fd.set("role", role);
      fd.set("stage_name", data.stage_name);
      if (data.korean_name) fd.set("korean_name", data.korean_name);
      if (data.location) fd.set("location", data.location);
      if (data.gender) fd.set("gender", data.gender);
      if (data.bio) fd.set("bio", data.bio);
      if (data.height_cm) fd.set("height_cm", data.height_cm);
      if (data.shoe_size_mm) fd.set("shoe_size_mm", data.shoe_size_mm);
      // 국적·비자 (대한민국 기본). 외국 국적이면 비자 정보 동반.
      const nv = data.nationalityVisa;
      fd.set("nationality_code", nv.nationality_code);
      fd.set("nationality", nv.nationality);
      fd.set("is_korean_national", nv.is_korean_national ? "true" : "false");
      if (!nv.is_korean_national) {
        if (nv.has_visa != null) fd.set("has_visa", nv.has_visa ? "true" : "false");
        if (nv.has_visa === true) {
          if (nv.visa_type) fd.set("visa_type", nv.visa_type);
          if (nv.visa_type === "OTHER" && nv.visa_type_other)
            fd.set("visa_type_other", nv.visa_type_other);
          if (nv.visa_expiry) fd.set("visa_expiry", nv.visa_expiry);
        }
      }
      data.specialties.forEach((s) => fd.append("specialties", s));
      data.genres.forEach((g) => fd.append("genres", g));
      if (data.social.instagram)
        fd.set("social_instagram_handle", data.social.instagram);
      if (data.social.youtube)
        fd.set("social_youtube_handle", data.social.youtube);
      if (data.social.tiktok)
        fd.set("social_tiktok_handle", data.social.tiktok);
      if (profileImgUrl) fd.set("profile_img_url", profileImgUrl);

      const result = await createDancerProfileAction(fd);
      if (!result.ok) {
        failWith(result.error);
        return;
      }

      // AI로 가져온 경력 일괄 저장. 실패 건수를 추적해 사용자에게 알림.
      const dancerId = result.data?.id;
      let careerFailedCount = 0;
      if (dancerId && data.pendingCareers.length > 0) {
        const { addCareerAction } = await import("@/app/actions/careers");
        for (const c of data.pendingCareers) {
          const cfd = new FormData();
          cfd.set("dancer_id", dancerId);
          cfd.set("type", c.type);
          cfd.set("title", c.title);
          cfd.set("date", c.date);
          if (c.role) cfd.set("role", c.role);
          if (c.description) cfd.set("description", c.description);
          if (c.link) cfd.set("link", c.link);
          cfd.set("is_public", "true");
          try {
            const r = await addCareerAction(cfd);
            if (!r.ok) careerFailedCount += 1;
          } catch {
            careerFailedCount += 1;
          }
        }
      }

      if (careerFailedCount > 0) {
        // 프로필은 만들어졌으니 경력 페이지로 보내되 안내.
        setError(
          `프로필은 생성됐지만 경력 ${careerFailedCount}건은 저장에 실패했습니다. 경력 페이지에서 직접 추가해 주세요.`,
        );
      }

      // Lite: returnTo가 있으면 우선 (지원 흐름 자동 복귀). 경력 일부 실패 시에는
      // 우선 경력 페이지로 보내 사용자가 직접 보정하도록 한다.
      const next =
        careerFailedCount > 0
          ? (dancerId ? `/me/portfolio/${dancerId}/careers` : "/me/portfolio")
          : (returnTo ?? (dancerId ? `/me/portfolio/${dancerId}/careers` : "/me/portfolio"));
      router.push(next);
      router.refresh();
    });
  };

  const isLast = step === TOTAL_STEPS;
  // 외국 국적이면 비자 유무는 응답해야 다음 단계로.
  const foreignVisaUnanswered =
    !data.nationalityVisa.is_korean_national &&
    data.nationalityVisa.has_visa == null;
  const cannotProceed =
    step === 1 && (!data.stage_name.trim() || foreignVisaUnanswered);

  return (
    <div className="min-h-screen pb-32">
      <div className="sticky top-0 z-10 border-b border-hairline-2 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/70">
        <div className="mx-auto flex max-w-md items-center gap-3 px-6 py-4">
          <button
            type="button"
            onClick={step === 1 ? () => router.back() : goPrev}
            aria-label="뒤로"
            className="-ml-2 rounded-full p-2 text-foreground transition-colors hover:bg-secondary"
          >
            <ArrowLeft className="size-5" />
          </button>
          <span className="text-base font-bold tracking-tight">
            {role === "manager" ? "매니저 프로필 생성" : "프로필 생성"}
            <span className="ml-2 font-mono text-xs text-ink-3">
              {step}/{TOTAL_STEPS}
            </span>
          </span>
        </div>
        <div className="h-1 bg-secondary">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      {/* 에러는 어느 단계에서든 상단에 항상 보이게 (모바일 하단 접힘으로 놓치던 문제 방지). */}
      {error ? (
        <div className="mx-auto max-w-md px-6 pt-4">
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        </div>
      ) : null}

      <div
        key={step}
        className="mx-auto max-w-md animate-in slide-in-from-right-4 fade-in px-6 py-8 duration-300"
      >
        {step === 1 ? (
          <StepBasic data={data} setData={setData} />
        ) : null}
        {step === 2 ? (
          <StepPriority
            title="전문 분야"
            description="주요 활동 영역을 선택하세요. 선택 순서가 우선순위입니다."
            options={SPECIALTIES}
            selected={data.specialties}
            onChange={(specialties) => setData({ ...data, specialties })}
            variant="list"
          />
        ) : null}
        {step === 3 ? (
          <StepPriority
            title="장르"
            description="주로 하는 장르를 선택하세요. 선택 순서가 우선순위입니다."
            options={GENRES.map((g) => ({ value: g, label: g }))}
            selected={data.genres}
            onChange={(genres) => setData({ ...data, genres })}
            variant="pills"
          />
        ) : null}
        {step === 4 ? (
          <StepPhoto
            file={data.profile_img}
            onChange={(file) => setData({ ...data, profile_img: file })}
          />
        ) : null}
        {step === 5 ? (
          <StepSocial
            value={data.social}
            onChange={(social) => setData({ ...data, social })}
          />
        ) : null}
        {step === 6 ? (
          <StepReview
            data={data}
            previewUrl={previewUrl}
            role={role}
            onChangeBio={(bio) => setData({ ...data, bio })}
          />
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline-2 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/70 pb-safe">
        <div className="mx-auto flex max-w-md gap-3 px-6 py-4">
          {step > 1 ? (
            <button
              type="button"
              onClick={goPrev}
              disabled={pending}
              className="rounded-lg border border-hairline-2 bg-secondary px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-surface-3 disabled:opacity-50"
            >
              이전
            </button>
          ) : null}
          <button
            type="button"
            onClick={isLast ? handleSubmit : goNext}
            disabled={cannotProceed || pending}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-bold transition-colors",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {pending || uploading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                {isLast ? "프로필 생성 완료" : "다음"}
                {!isLast ? <ChevronRight className="size-4" /> : null}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function StepBasic({
  data,
  setData,
}: {
  data: FormState;
  setData: (next: FormState) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">기본 정보</h2>
        <p className="text-sm text-ink-2">활동명과 기본 정보를 입력하세요.</p>
      </div>

      <div className="flex flex-col gap-4">
        <Field label="활동명 (Stage Name)" required>
          <input
            type="text"
            placeholder="예: Hong Gil Dong"
            className={fieldInputClass}
            value={data.stage_name}
            onChange={(e) => setData({ ...data, stage_name: e.target.value })}
            autoFocus
          />
        </Field>
        <Field label="한글 이름 (선택)">
          <input
            type="text"
            placeholder="예: 홍길동"
            className={fieldInputClass}
            value={data.korean_name}
            onChange={(e) => setData({ ...data, korean_name: e.target.value })}
          />
        </Field>
        <Field label="활동 지역 (선택)">
          <input
            type="text"
            placeholder="예: Seoul"
            className={fieldInputClass}
            value={data.location}
            onChange={(e) => setData({ ...data, location: e.target.value })}
          />
        </Field>
        <Field label="성별 (선택)">
          <div className="flex gap-2">
            {(
              [
                { value: "male", label: "남성" },
                { value: "female", label: "여성" },
                { value: "other", label: "기타" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  setData({
                    ...data,
                    gender: data.gender === option.value ? "" : option.value,
                  })
                }
                className={cn(
                  "flex-1 rounded-lg border py-3 text-sm font-medium transition-colors",
                  data.gender === option.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-hairline-2 text-ink-2 hover:bg-secondary",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="키 · 신발 사이즈 (선택)">
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={100}
              max={250}
              placeholder="키 (cm)"
              className={fieldInputClass}
              value={data.height_cm}
              onChange={(e) => setData({ ...data, height_cm: e.target.value })}
            />
            <input
              type="number"
              inputMode="numeric"
              min={180}
              max={330}
              placeholder="신발 (mm)"
              className={fieldInputClass}
              value={data.shoe_size_mm}
              onChange={(e) => setData({ ...data, shoe_size_mm: e.target.value })}
            />
          </div>
          <p className="mt-1.5 text-xs text-ink-3">
            입력하면 캐스팅 매칭·섭외 확률이 올라가요. 키 등 신체정보는 본인과 관리자에게만 보입니다.
          </p>
        </Field>

        <Field label="국적 · 비자">
          <NationalityVisaFields
            defaultValue={data.nationalityVisa}
            emitHiddenInputs={false}
            onChange={(nationalityVisa) => setData({ ...data, nationalityVisa })}
          />
        </Field>
      </div>
    </div>
  );
}

function StepPriority({
  title,
  description,
  options,
  selected,
  onChange,
  variant,
}: {
  title: string;
  description: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  variant: "list" | "pills";
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <p className="text-sm text-ink-2">{description}</p>
      </div>
      <PriorityMultiSelect
        options={options}
        selected={selected}
        onChange={onChange}
        variant={variant}
      />
    </div>
  );
}

function StepPhoto({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">프로필 사진</h2>
        <p className="text-sm text-ink-2">대표 이미지를 업로드하세요. (선택)</p>
      </div>
      <ProfilePhotoUpload file={file} onChange={onChange} />
    </div>
  );
}

function StepSocial({
  value,
  onChange,
}: {
  value: SocialHandles;
  onChange: (next: SocialHandles) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">SNS 연결</h2>
        <p className="text-sm text-ink-2">
          소셜 미디어 핸들을 입력하세요. (선택)
        </p>
      </div>
      <SocialLinksInput value={value} onChange={onChange} />
    </div>
  );
}

function StepReview({
  data,
  previewUrl,
  role,
  onChangeBio,
}: {
  data: FormState;
  previewUrl: string | null;
  role: "self" | "manager";
  onChangeBio: (bio: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">소개 및 확인</h2>
        <p className="text-sm text-ink-2">
          간단한 소개를 작성하고 입력 정보를 확인하세요.
        </p>
      </div>

      <Field label="소개 (선택)">
        <textarea
          rows={4}
          placeholder="자신을 소개하는 글을 작성하세요..."
          className={cn(fieldInputClass, "resize-none")}
          value={data.bio}
          onChange={(e) => onChangeBio(e.target.value)}
        />
      </Field>

      {role === "manager" ? (
        <div className="flex items-center gap-1.5 rounded-full border border-hairline-2 bg-card px-3 py-1.5 text-[11px] font-medium text-ink-2 w-fit">
          <Shield size={10} />
          매니저로 등록 — 프로필 소유자가 나중에 클레임 가능
        </div>
      ) : null}

      <div className="flex flex-col gap-4 rounded-xl border border-hairline-2 bg-card p-5">
        <div className="flex items-center gap-4">
          <div className="size-16 overflow-hidden rounded-full bg-surface-2">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="프로필 미리보기"
                className="size-full object-cover"
              />
            ) : null}
          </div>
          <div className="flex flex-col gap-0.5">
            <h3 className="text-lg font-bold leading-tight">
              {data.stage_name || "(활동명 미입력)"}
            </h3>
            {data.korean_name ? (
              <p className="text-sm text-ink-2">{data.korean_name}</p>
            ) : null}
            {data.location ? (
              <p className="text-xs text-ink-3">{data.location}</p>
            ) : null}
          </div>
        </div>

        {data.specialties.length > 0 ? (
          <ReviewBadges
            label="전문 분야 (우선순위)"
            items={data.specialties.map((value, i) => ({
              value,
              label:
                SPECIALTIES.find((s) => s.value === value)?.label ?? value,
              priority: i + 1,
            }))}
          />
        ) : null}

        {data.genres.length > 0 ? (
          <ReviewBadges
            label="장르 (우선순위)"
            items={data.genres.map((value, i) => ({
              value,
              label: value,
              priority: i + 1,
            }))}
          />
        ) : null}

        {data.social.instagram || data.social.youtube || data.social.tiktok ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.14em] text-ink-3">
              SNS
            </p>
            <div className="flex flex-wrap gap-2">
              {data.social.instagram ? (
                <span className="rounded bg-surface-3 px-2 py-1 text-xs text-ink-2">
                  IG @{data.social.instagram}
                </span>
              ) : null}
              {data.social.youtube ? (
                <span className="rounded bg-surface-3 px-2 py-1 text-xs text-ink-2">
                  YT @{data.social.youtube}
                </span>
              ) : null}
              {data.social.tiktok ? (
                <span className="rounded bg-surface-3 px-2 py-1 text-xs text-ink-2">
                  TT @{data.social.tiktok}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <p className="text-xs text-ink-3">
        프로필 생성 후 관리자 승인을 거쳐 디렉토리에 노출됩니다.
      </p>
    </div>
  );
}

function ReviewBadges({
  label,
  items,
}: {
  label: string;
  items: { value: string; label: string; priority: number }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs uppercase tracking-[0.14em] text-ink-3">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item.value}
            className="flex items-center gap-1.5 rounded bg-surface-3 px-2 py-1 text-xs text-ink-2"
          >
            <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {item.priority}
            </span>
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

const fieldInputClass =
  "w-full rounded-lg border border-hairline-2 bg-surface-2 px-4 py-3 text-sm text-foreground placeholder:text-ink-4 focus:border-primary focus:outline-none";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-ink-2">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </label>
      {children}
    </div>
  );
}
