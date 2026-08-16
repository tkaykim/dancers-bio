"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ExternalLink, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  adminSetWorkshopReservationStatusAction,
  adminUpsertWorkshopArtistAction,
} from "@/app/actions/workshops";
import { getBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import {
  RESERVATION_STATUS_LABEL,
  WORKSHOP_STATUSES,
  WORKSHOP_STATUS_LABEL,
  suggestSlug,
  won,
  type ReservationStatus,
  type WorkshopStatus,
} from "@/lib/workshops/shared";

// deetz Workshop 어드민 콘솔.
// 제안 검토(suggested 큐) → 카드 발행(published) → 모집 오픈(recruiting) → 확정/완료 + 예약자 관리.

export type AdminWorkshopArtist = {
  id: string;
  slug: string | null;
  name: string;
  instagram_handle: string;
  image_url: string | null;
  country: string | null;
  genres: string[] | null;
  headline: string | null;
  description: string | null;
  status: WorkshopStatus;
  deposit_amount: number | null;
  total_price: number | null;
  min_headcount: number | null;
  max_headcount: number | null;
  expected_period: string | null;
  recruit_deadline: string | null;
  recruit_opened_at: string | null;
  confirmed_at: string | null;
  created_at: string;
};

export type AdminWorkshopDemand = {
  id: string;
  artist_id: string;
  source: string;
  contact_email: string | null;
  contact_instagram: string | null;
  user_id: string | null;
  want_type: string | null;
  comment: string | null;
  created_at: string;
};

export type AdminWorkshopReservation = {
  id: string;
  artist_id: string;
  user_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  amount: number;
  status: ReservationStatus;
  pg_provider: string | null;
  order_no: string;
  paid_at: string | null;
  refunded_at: string | null;
  memo: string | null;
  created_at: string;
};

const inputClass =
  "w-full rounded-lg border border-hairline-2 bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-ink-4 focus:border-foreground/40";

const STATUS_ORDER: WorkshopStatus[] = ["recruiting", "confirmed", "published", "suggested", "completed", "archived"];

export function WorkshopAdminConsole({
  artists,
  demands,
  reservations,
}: {
  artists: AdminWorkshopArtist[];
  demands: AdminWorkshopDemand[];
  reservations: AdminWorkshopReservation[];
}) {
  const demandByArtist = useMemo(() => {
    const map = new Map<string, AdminWorkshopDemand[]>();
    for (const d of demands) {
      const list = map.get(d.artist_id) ?? [];
      list.push(d);
      map.set(d.artist_id, list);
    }
    return map;
  }, [demands]);

  const reservationsByArtist = useMemo(() => {
    const map = new Map<string, AdminWorkshopReservation[]>();
    for (const r of reservations) {
      const list = map.get(r.artist_id) ?? [];
      list.push(r);
      map.set(r.artist_id, list);
    }
    return map;
  }, [reservations]);

  const sorted = useMemo(() => {
    return [...artists].sort((a, b) => {
      const s = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
      if (s !== 0) return s;
      const d = (demandByArtist.get(b.id)?.length ?? 0) - (demandByArtist.get(a.id)?.length ?? 0);
      if (d !== 0) return d;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [artists, demandByArtist]);

  const paidReservations = reservations.filter((r) => r.status === "paid" || r.status === "confirmed");
  const paidTotal = paidReservations.reduce((sum, r) => sum + r.amount, 0);
  const suggestedCount = artists.filter((a) => a.status === "suggested").length;

  const [showNew, setShowNew] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">워크샵 관리</h1>
          <p className="mt-1 text-sm text-ink-3">
            공개 페이지 <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">/workshops</code> — 수요 기반 안무가
            초청. 제안 검토 → 카드 공개 → 모집 오픈 → 확정 순서로 운영합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNew((v) => !v)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {showNew ? "닫기" : "+ 카드 직접 추가"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="후보 카드" value={String(artists.length)} />
        <StatCard label="제안 검토 대기" value={String(suggestedCount)} tone={suggestedCount > 0 ? "primary" : undefined} />
        <StatCard label="누적 수요" value={String(demands.length)} />
        <StatCard label="예약금 결제" value={`${paidReservations.length}건 · ${won(paidTotal)}`} tone="primary" />
      </div>

      {showNew ? <ArtistEditor artist={null} onDone={() => setShowNew(false)} /> : null}

      <div className="flex flex-col gap-3">
        {sorted.map((a) => (
          <ArtistRow
            key={a.id}
            artist={a}
            demands={demandByArtist.get(a.id) ?? []}
            reservations={reservationsByArtist.get(a.id) ?? []}
          />
        ))}
        {sorted.length === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline-2 p-8 text-center text-sm text-ink-3">
            아직 후보 카드가 없습니다. 공개 페이지 제안이 들어오면 여기에 쌓입니다.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "primary" }) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        tone === "primary" ? "border-primary/40 bg-primary/5" : "border-hairline-2 bg-card",
      )}
    >
      <p className="text-xs font-medium text-ink-3">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight text-foreground">{value}</p>
    </div>
  );
}

function statusBadgeClass(status: WorkshopStatus): string {
  switch (status) {
    case "recruiting":
      return "bg-primary text-primary-foreground";
    case "confirmed":
      return "bg-ok/15 text-ok";
    case "suggested":
      return "bg-warn/15 text-warn";
    case "archived":
    case "completed":
      return "bg-secondary text-ink-3";
    default:
      return "bg-secondary text-ink-2";
  }
}

function ArtistRow({
  artist,
  demands,
  reservations,
}: {
  artist: AdminWorkshopArtist;
  demands: AdminWorkshopDemand[];
  reservations: AdminWorkshopReservation[];
}) {
  const [open, setOpen] = useState(artist.status === "suggested");
  const paid = reservations.filter((r) => r.status === "paid" || r.status === "confirmed");

  return (
    <div className="overflow-hidden rounded-xl border border-hairline-2 bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-secondary">
          {artist.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artist.image_url} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-sm font-bold text-ink-4">
              {artist.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-bold text-foreground">{artist.name}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", statusBadgeClass(artist.status))}>
              {WORKSHOP_STATUS_LABEL[artist.status]}
            </span>
          </div>
          <p className="truncate text-[12px] text-ink-3">
            @{artist.instagram_handle} · 수요 {demands.length} · 예약 {paid.length}
            {artist.status === "recruiting" && artist.min_headcount ? `/${artist.min_headcount}` : ""}
            {artist.deposit_amount ? ` · 예약금 ${won(artist.deposit_amount)}` : ""}
          </p>
        </div>
        <ChevronDown className={cn("size-4 shrink-0 text-ink-3 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="flex flex-col gap-4 border-t border-hairline-2 p-4">
          <ArtistEditor artist={artist} />
          {demands.length > 0 ? <DemandList demands={demands} /> : null}
          {reservations.length > 0 ? <ReservationList reservations={reservations} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function DemandList({ demands }: { demands: AdminWorkshopDemand[] }) {
  const withComment = demands.filter((d) => d.comment || d.want_type);
  return (
    <details className="rounded-lg border border-hairline-2 bg-secondary/30 p-3">
      <summary className="cursor-pointer text-[13px] font-semibold text-foreground">
        수요 {demands.length}건 (제안 {demands.filter((d) => d.source === "nominate").length} · 찜{" "}
        {demands.filter((d) => d.source === "vote").length})
      </summary>
      <div className="mt-2 flex flex-col gap-1.5">
        {demands.slice(0, 30).map((d) => (
          <div key={d.id} className="rounded-md bg-background px-3 py-2 text-[12px] text-ink-2">
            <span className="font-semibold text-foreground">
              {d.contact_email || (d.contact_instagram ? `@${d.contact_instagram}` : d.user_id ? "회원" : "익명")}
            </span>
            {d.want_type ? ` · ${d.want_type}` : ""}
            {d.comment ? ` — ${d.comment}` : ""}
            <span className="text-ink-4"> · {new Date(d.created_at).toLocaleDateString("ko-KR")}</span>
          </div>
        ))}
        {withComment.length === 0 && demands.length > 30 ? (
          <p className="text-[11px] text-ink-4">최근 30건만 표시합니다.</p>
        ) : null}
      </div>
    </details>
  );
}

function ReservationList({ reservations }: { reservations: AdminWorkshopReservation[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const setStatus = (id: string, status: Exclude<ReservationStatus, "pending" | "recovery_required">) => {
    startTransition(async () => {
      const res = await adminSetWorkshopReservationStatusAction({ id, status });
      if (res.ok) {
        toast.success(`${RESERVATION_STATUS_LABEL[status]} 처리했습니다.`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <div className="rounded-lg border border-hairline-2 bg-secondary/30 p-3">
      <p className="text-[13px] font-semibold text-foreground">예약자 {reservations.length}명</p>
      <p className="mt-0.5 text-[11px] text-ink-4">
        환불은 토스/PayPal 콘솔에서 먼저 집행한 뒤 여기서 상태를 기록하세요.
      </p>
      <div className="mt-2 flex flex-col gap-1.5">
        {reservations.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-md bg-background px-3 py-2 text-[12px]">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-bold",
                r.status === "paid" || r.status === "confirmed"
                  ? "bg-ok/15 text-ok"
                  : r.status === "recovery_required"
                    ? "bg-red-100 font-bold text-red-700"
                    : r.status === "pending"
                      ? "bg-warn/15 text-warn"
                      : "bg-secondary text-ink-3",
              )}
            >
              {RESERVATION_STATUS_LABEL[r.status]}
            </span>
            <span className="font-semibold text-foreground">{r.customer_name}</span>
            <span className="text-ink-3">{r.customer_email}</span>
            {r.customer_phone ? <span className="text-ink-3">{r.customer_phone}</span> : null}
            <span className="font-mono text-ink-4">{r.order_no}</span>
            <span className="font-semibold text-foreground">{won(r.amount)}</span>
            {r.pg_provider ? <span className="text-ink-4">{r.pg_provider}</span> : null}
            <span className="ml-auto flex gap-1">
              {(r.status === "paid"
                ? (["confirmed", "refunded", "transferred"] as const)
                : r.status === "recovery_required"
                  ? // 돈은 받은 건 — 좌석을 살리거나(paid) 환불로 닫는다.
                    (["paid", "refunded"] as const)
                  : []
              ).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={pending}
                  onClick={() => setStatus(r.id, s)}
                  className="rounded-md border border-hairline-2 px-2 py-1 text-[11px] text-ink-2 transition-colors hover:text-foreground disabled:opacity-45"
                >
                  {RESERVATION_STATUS_LABEL[s]}
                </button>
              ))}
              {r.status === "pending" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setStatus(r.id, "cancelled")}
                  className="rounded-md border border-hairline-2 px-2 py-1 text-[11px] text-ink-2 transition-colors hover:text-foreground disabled:opacity-45"
                >
                  취소 처리
                </button>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArtistEditor({ artist, onDone }: { artist: AdminWorkshopArtist | null; onDone?: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState(artist?.name ?? "");
  const [instagram, setInstagram] = useState(artist?.instagram_handle ?? "");
  const [slug, setSlug] = useState(artist?.slug ?? "");
  const [imageUrl, setImageUrl] = useState(artist?.image_url ?? "");
  const [country, setCountry] = useState(artist?.country ?? "");
  const [genresText, setGenresText] = useState((artist?.genres ?? []).join(", "));
  const [headline, setHeadline] = useState(artist?.headline ?? "");
  const [description, setDescription] = useState(artist?.description ?? "");
  const [status, setStatus] = useState<WorkshopStatus>(artist?.status ?? "published");
  const [deposit, setDeposit] = useState(artist?.deposit_amount ? String(artist.deposit_amount) : "");
  const [total, setTotal] = useState(artist?.total_price ? String(artist.total_price) : "");
  const [minHead, setMinHead] = useState(artist?.min_headcount ? String(artist.min_headcount) : "");
  const [maxHead, setMaxHead] = useState(artist?.max_headcount ? String(artist.max_headcount) : "");
  const [period, setPeriod] = useState(artist?.expected_period ?? "");
  const [deadline, setDeadline] = useState(
    artist?.recruit_deadline ? artist.recruit_deadline.slice(0, 10) : "",
  );

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const supabase = getBrowserClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const key = `${artist?.id ?? "new"}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("workshop-artists").upload(key, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("workshop-artists").getPublicUrl(key);
      setImageUrl(data.publicUrl);
      toast.success("이미지를 올렸습니다. 저장을 눌러 반영하세요.");
    } catch (e) {
      console.error("[workshopAdmin] upload failed:", e);
      toast.error("이미지 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  };

  const save = () => {
    startTransition(async () => {
      const res = await adminUpsertWorkshopArtistAction({
        id: artist?.id ?? null,
        name,
        instagramHandle: instagram,
        slug: slug || null,
        imageUrl: imageUrl || null,
        country: country || null,
        genres: genresText
          .split(",")
          .map((g) => g.trim())
          .filter(Boolean),
        headline: headline || null,
        description: description || null,
        status,
        depositAmount: deposit ? Number(deposit) : null,
        totalPrice: total ? Number(total) : null,
        minHeadcount: minHead ? Number(minHead) : null,
        maxHeadcount: maxHead ? Number(maxHead) : null,
        expectedPeriod: period || null,
        recruitDeadline: deadline || null,
      });
      if (res.ok) {
        toast.success("저장했습니다.");
        onDone?.();
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-hairline-2 bg-background p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="이름 *">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="인스타그램 *">
          <input className={inputClass} value={instagram} onChange={(e) => setInstagram(e.target.value)} />
        </Field>
        <Field label="slug (상세 URL)">
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="비우면 자동 생성"
            />
            <button
              type="button"
              onClick={() => setSlug(suggestSlug(name) || suggestSlug(instagram))}
              className="shrink-0 rounded-lg border border-hairline-2 px-3 text-[12px] text-ink-2 hover:text-foreground"
            >
              자동
            </button>
          </div>
        </Field>
        <Field label="국가">
          <input className={inputClass} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="예: 미국 LA" />
        </Field>
        <Field label="장르 (쉼표 구분)">
          <input className={inputClass} value={genresText} onChange={(e) => setGenresText(e.target.value)} placeholder="Choreography, Hip-hop" />
        </Field>
        <Field label="카드 이미지">
          <div className="flex items-center gap-2">
            <input className={inputClass} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="URL 직접 입력 또는 업로드" />
            <label className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-hairline-2 px-3 py-2 text-[12px] text-ink-2 hover:text-foreground">
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              업로드
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadImage(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </Field>
      </div>
      <Field label="한 줄 소개">
        <input className={inputClass} value={headline} onChange={(e) => setHeadline(e.target.value)} />
      </Field>
      <Field label="설명">
        <textarea
          className={cn(inputClass, "resize-none")}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
        <p className="text-[12px] font-bold text-primary">모집 설정 (모집 오픈 시 필수: 예약금·최소 인원)</p>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          <Field label="예약금 (원)">
            <input className={inputClass} inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/[^0-9]/g, ""))} />
          </Field>
          <Field label="총 수강료 (원)">
            <input className={inputClass} inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value.replace(/[^0-9]/g, ""))} />
          </Field>
          <Field label="예상 시기">
            <input className={inputClass} value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="예: 2026년 10월 중" />
          </Field>
          <Field label="최소 인원">
            <input className={inputClass} inputMode="numeric" value={minHead} onChange={(e) => setMinHead(e.target.value.replace(/[^0-9]/g, ""))} />
          </Field>
          <Field label="최대 인원">
            <input className={inputClass} inputMode="numeric" value={maxHead} onChange={(e) => setMaxHead(e.target.value.replace(/[^0-9]/g, ""))} />
          </Field>
          <Field label="모집 마감일">
            <input type="date" className={inputClass} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as WorkshopStatus)}
          className={cn(inputClass, "w-auto")}
        >
          {WORKSHOP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {WORKSHOP_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-45"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
        {artist?.slug && artist.status !== "suggested" && artist.status !== "archived" ? (
          <a
            href={`/workshops/${artist.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] text-ink-3 transition-colors hover:text-foreground"
          >
            공개 페이지 <ExternalLink className="size-3" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-semibold text-ink-2">{label}</span>
      {children}
    </label>
  );
}
