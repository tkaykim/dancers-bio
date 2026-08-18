"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  adminDeleteEventSessionAction,
  adminUpsertEventAction,
  adminUpsertEventSessionAction,
} from "@/app/actions/workshop-events";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { COUNTRIES } from "@/lib/data/countries";
import { getBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import {
  CURRENCY_BY_COUNTRY,
  EVENT_TIMEZONES,
  PAYPAL_SUPPORTED_CURRENCIES,
  hhmm,
} from "@/lib/workshops/event-shared";
import type { AdminEventListRow, AdminEventSession } from "@/lib/workshops/event-queries";

// 행사 생성·수정 에디터 + 세션 빌더.
// 국가를 고르면 통화·타임존을 자동 제안한다(수동 변경 가능).

const inputClass =
  "w-full rounded-lg border border-hairline-2 bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-ink-4 focus:border-foreground/40";

const COUNTRY_OPTIONS: SearchableOption[] = COUNTRIES.map((c) => ({
  value: c.code,
  label: c.code === "OTHER" ? c.ko : `${c.ko} (${c.en})`,
  keywords: `${c.en} ${c.ko} ${c.code}`,
}));

const TZ_BY_COUNTRY: Record<string, string> = {
  KR: "Asia/Seoul", TH: "Asia/Bangkok", JP: "Asia/Tokyo", TW: "Asia/Taipei",
  HK: "Asia/Hong_Kong", SG: "Asia/Singapore", PH: "Asia/Manila", VN: "Asia/Ho_Chi_Minh",
  ID: "Asia/Jakarta", CN: "Asia/Shanghai", US: "America/Los_Angeles", GB: "Europe/London",
  FR: "Europe/Paris", AU: "Australia/Sydney",
};

type EventFull = AdminEventListRow & {
  subtitle?: string | null;
  description?: string | null;
  poster_url?: string | null;
  country_code?: string | null;
  city?: string | null;
  currency?: string;
  venue_address?: string | null;
  venue_map_url?: string | null;
  timezone?: string;
  ends_on?: string;
  apply_deadline?: string | null;
  default_lang?: string;
};

export function EventEditor({
  event,
  onDone,
}: {
  event: EventFull | null;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  const [title, setTitle] = useState(event?.title ?? "");
  const [subtitle, setSubtitle] = useState(event?.subtitle ?? "");
  const [slug, setSlug] = useState(event?.slug ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [posterUrl, setPosterUrl] = useState(event?.poster_url ?? "");
  const [country, setCountry] = useState(event?.country_code ?? "KR");
  const [city, setCity] = useState(event?.city ?? "");
  const [currency, setCurrency] = useState(event?.currency ?? "KRW");
  const [venueName, setVenueName] = useState(event?.venue_name ?? "");
  const [venueAddress, setVenueAddress] = useState(event?.venue_address ?? "");
  const [venueMapUrl, setVenueMapUrl] = useState(event?.venue_map_url ?? "");
  const [timezone, setTimezone] = useState(event?.timezone ?? "Asia/Seoul");
  const [startsOn, setStartsOn] = useState(event?.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(event?.ends_on ?? event?.starts_on ?? "");
  const [applyDeadline, setApplyDeadline] = useState(
    event?.apply_deadline ? event.apply_deadline.slice(0, 16) : "",
  );
  const [status, setStatus] = useState(event?.status ?? "draft");
  const [defaultLang, setDefaultLang] = useState(event?.default_lang ?? "ko");

  const pickCountry = (code: string) => {
    setCountry(code);
    // 국가 → 통화·타임존 자동 제안(이미 손댄 값도 국가 변경 시 갱신 — 행사 생성 초기라 안전)
    if (CURRENCY_BY_COUNTRY[code]) setCurrency(CURRENCY_BY_COUNTRY[code]);
    if (TZ_BY_COUNTRY[code]) setTimezone(TZ_BY_COUNTRY[code]);
  };

  const uploadPoster = async (file: File) => {
    setUploading(true);
    try {
      const supabase = getBrowserClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const key = `events/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("workshop-artists").upload(key, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("workshop-artists").getPublicUrl(key);
      setPosterUrl(data.publicUrl);
      toast.success("포스터를 올렸습니다. 저장을 눌러 반영하세요.");
    } catch (e) {
      console.error("[eventEditor] upload failed:", e);
      toast.error("포스터 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  };

  const save = () => {
    startTransition(async () => {
      const res = await adminUpsertEventAction({
        id: event?.id ?? null,
        slug: slug || null,
        title,
        subtitle: subtitle || null,
        description: description || null,
        posterUrl: posterUrl || null,
        countryCode: country,
        city: city || null,
        currency,
        venueName: venueName || null,
        venueAddress: venueAddress || null,
        venueMapUrl: venueMapUrl || null,
        timezone,
        startsOn,
        endsOn: endsOn || startsOn,
        applyDeadline: applyDeadline || null,
        status: status as "draft" | "open" | "closed" | "completed" | "cancelled",
        defaultLang: defaultLang as "ko" | "en" | "ja",
      });
      if (res.ok) {
        toast.success("행사를 저장했습니다.");
        onDone?.();
        router.push(`/admin/workshops/events?event=${res.data?.id}`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  const paypalOk = currency === "KRW" || PAYPAL_SUPPORTED_CURRENCIES.has(currency);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-hairline-2 bg-card p-4 md:p-5">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="행사 제목 *">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: deetz Workshop in Bangkok" />
        </Field>
        <Field label="부제">
          <input className={inputClass} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="예: Jho · Young-J · EMILY" />
        </Field>
        <Field label="slug (URL)">
          <input className={inputClass} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="비우면 제목에서 자동 생성" />
        </Field>
        <Field label="포스터">
          <div className="flex items-center gap-2">
            <input className={inputClass} value={posterUrl} onChange={(e) => setPosterUrl(e.target.value)} placeholder="URL 또는 업로드" />
            <label className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-hairline-2 px-3 py-2 text-[12px] text-ink-2 hover:text-foreground">
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              업로드
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadPoster(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </Field>
      </div>

      <Field label="소개">
        <textarea className={cn(inputClass, "resize-none")} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
        <p className="text-[12px] font-bold text-primary">지역 · 통화</p>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          <Field label="개최 국가 *">
            <SearchableSelect options={COUNTRY_OPTIONS} value={country} onChange={pickCountry} placeholder="국가" />
          </Field>
          <Field label="도시">
            <input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} placeholder="예: Bangkok" />
          </Field>
          <Field label="행사 통화 *">
            <input
              className={inputClass}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="KRW"
            />
          </Field>
          <Field label="장소 이름">
            <input className={inputClass} value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="예: ○○ Studio" />
          </Field>
          <Field label="주소">
            <input className={inputClass} value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} />
          </Field>
          <Field label="지도 링크">
            <input className={inputClass} value={venueMapUrl} onChange={(e) => setVenueMapUrl(e.target.value)} placeholder="Google Maps URL" />
          </Field>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-4">
          참가자에게는 행사 통화로 가격이 보이고 PayPal 도 그 통화로 청구됩니다.
          {paypalOk ? "" : ` ⚠ ${currency}는 PayPal 미지원 — 세션에 USD 가격을 함께 넣으면 자동으로 달러 청구됩니다.`}
          {" "}한국 카드 결제(Toss)는 세션에 원화 가격을 넣은 경우에만 노출됩니다.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Field label="시작일 *">
          <input type="date" className={inputClass} value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </Field>
        <Field label="종료일">
          <input type="date" className={inputClass} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </Field>
        <Field label="신청 마감(현지 기준)">
          <input type="datetime-local" className={inputClass} value={applyDeadline} onChange={(e) => setApplyDeadline(e.target.value)} />
        </Field>
        <Field label="타임존">
          <select className={inputClass} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {EVENT_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className={cn(inputClass, "w-auto")} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="draft">준비 중 (비공개)</option>
          <option value="open">모집 중 (공개)</option>
          <option value="closed">신청 마감</option>
          <option value="completed">종료</option>
          <option value="cancelled">취소</option>
        </select>
        <select className={cn(inputClass, "w-auto")} value={defaultLang} onChange={(e) => setDefaultLang(e.target.value)}>
          <option value="ko">기본 한국어</option>
          <option value="en">기본 영어</option>
        </select>
        <button
          type="button"
          onClick={save}
          disabled={pending || !title.trim() || !startsOn}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-45"
        >
          {pending ? "저장 중…" : event ? "행사 저장" : "행사 만들기"}
        </button>
      </div>
    </div>
  );
}

// ── 세션 빌더 ───────────────────────────────────────────────────────────────

export function SessionEditor({
  eventId,
  eventCurrency,
  session,
  defaultDate,
  onDone,
}: {
  eventId: string;
  eventCurrency: string;
  session: AdminEventSession | null;
  defaultDate: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [date, setDate] = useState(session?.session_date ?? defaultDate);
  const [start, setStart] = useState(session ? hhmm(session.start_time) : "15:00");
  const [end, setEnd] = useState(session ? hhmm(session.end_time) : "16:30");
  const [title, setTitle] = useState(session?.title ?? "");
  const [instructor, setInstructor] = useState(session?.instructor_name ?? "");
  const [instaHandle, setInstaHandle] = useState(session?.instructor_instagram ?? "");
  const [imageUrl, setImageUrl] = useState(session?.instructor_image_url ?? "");
  const [level, setLevel] = useState(session?.level ?? "");
  const [capacity, setCapacity] = useState(session ? String(session.capacity) : "30");
  const [priceLocal, setPriceLocal] = useState(
    session?.price_local != null ? String(session.price_local) : "",
  );
  const [priceKrw, setPriceKrw] = useState(session?.price_krw != null ? String(session.price_krw) : "");
  const [priceUsd, setPriceUsd] = useState(session?.price_usd != null ? String(session.price_usd) : "");
  const [sessStatus, setSessStatus] = useState<string>(session?.status ?? "open");

  const save = () => {
    startTransition(async () => {
      const res = await adminUpsertEventSessionAction({
        id: session?.id ?? null,
        eventId,
        sort: session?.sort ?? 0,
        sessionDate: date,
        startTime: start,
        endTime: end,
        title,
        instructorName: instructor,
        instructorInstagram: instaHandle || null,
        instructorImageUrl: imageUrl || null,
        level: level || null,
        capacity: Number(capacity) || 0,
        priceLocal: priceLocal === "" ? null : Number(priceLocal),
        priceKrw: priceKrw === "" ? null : Number(priceKrw),
        priceUsd: priceUsd === "" ? null : Number(priceUsd),
        status: sessStatus as "open" | "closed" | "hidden",
      });
      if (res.ok) {
        toast.success("세션을 저장했습니다.");
        onDone?.();
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  const remove = () => {
    if (!session) return;
    startTransition(async () => {
      const res = await adminDeleteEventSessionAction({ id: session.id });
      if (res.ok) {
        toast.success("세션을 삭제했습니다.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-hairline-2 bg-background p-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Field label="날짜">
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="시작">
          <input type="time" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="종료">
          <input type="time" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field label="정원 (비공개)">
          <input className={inputClass} inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/[^0-9]/g, ""))} />
        </Field>
        <Field label="클래스명 *">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: Jho Class" />
        </Field>
        <Field label="강사명 *">
          <input className={inputClass} value={instructor} onChange={(e) => setInstructor(e.target.value)} />
        </Field>
        <Field label="강사 인스타">
          <input className={inputClass} value={instaHandle} onChange={(e) => setInstaHandle(e.target.value)} placeholder="@ 없이" />
        </Field>
        <Field label="레벨">
          <input className={inputClass} value={level} onChange={(e) => setLevel(e.target.value)} placeholder="All levels" />
        </Field>
        <Field label={`가격 (${eventCurrency})`}>
          <input className={inputClass} inputMode="decimal" value={priceLocal} onChange={(e) => setPriceLocal(e.target.value.replace(/[^0-9.]/g, ""))} />
        </Field>
        <Field label="가격 (₩, Toss용·선택)">
          <input className={inputClass} inputMode="numeric" value={priceKrw} onChange={(e) => setPriceKrw(e.target.value.replace(/[^0-9]/g, ""))} />
        </Field>
        <Field label="가격 ($, 폴백·선택)">
          <input className={inputClass} inputMode="decimal" value={priceUsd} onChange={(e) => setPriceUsd(e.target.value.replace(/[^0-9.]/g, ""))} />
        </Field>
        <Field label="강사 사진 URL">
          <input className={inputClass} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <select className={cn(inputClass, "w-auto")} value={sessStatus} onChange={(e) => setSessStatus(e.target.value)}>
          <option value="open">모집</option>
          <option value="closed">수동 마감</option>
          <option value="hidden">숨김</option>
        </select>
        <button
          type="button"
          onClick={save}
          disabled={pending || !title.trim() || !instructor.trim()}
          className="rounded-lg bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-45"
        >
          {pending ? "저장 중…" : session ? "세션 저장" : "세션 추가"}
        </button>
        {session ? (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-lg border border-hairline-2 px-3 py-2 text-[12px] text-ink-3 transition-colors hover:text-red-600 disabled:opacity-45"
          >
            <Trash2 className="size-3.5" /> 삭제
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function AddSessionButton({
  eventId,
  eventCurrency,
  defaultDate,
}: {
  eventId: string;
  eventCurrency: string;
  defaultDate: string;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-hairline-2 px-4 py-2.5 text-[13px] font-semibold text-ink-2 transition-colors hover:text-foreground"
      >
        <Plus className="size-4" /> 세션 추가
      </button>
    );
  }
  return (
    <SessionEditor
      eventId={eventId}
      eventCurrency={eventCurrency}
      session={null}
      defaultDate={defaultDate}
      onDone={() => setOpen(false)}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11.5px] font-semibold text-ink-2">{label}</span>
      {children}
    </label>
  );
}
