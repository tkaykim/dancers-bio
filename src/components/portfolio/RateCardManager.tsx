"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit2, Loader2, Plus, Save, Trash2 } from "lucide-react";

import {
  upsertRateCardAction,
  deleteRateCardAction,
} from "@/app/actions/rate-cards";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import {
  RATE_SERVICE_TYPES,
  RATE_SERVICE_LABELS,
  RATE_SERVICE_HINTS,
  CURRENCIES,
  COMMON_COUNTRIES,
  isCountryService,
  countryLabel,
  formatRate,
  type RateServiceType,
} from "@/lib/validation/rate-cards";
import { cn } from "@/lib/utils";

export type RateCardRow = {
  id: string;
  service_type: RateServiceType;
  country: string | null;
  price: number | null;
  price_min: number | null;
  price_max: number | null;
  currency: string;
  is_negotiable: boolean;
  unit: string | null;
  note: string | null;
  is_public: boolean;
};

type FormState = {
  service_type: RateServiceType;
  country: string; // "" = 기본 해외 / 국내
  currency: string;
  price: string;
  price_min: string;
  price_max: string;
  unit: string;
  note: string;
  is_negotiable: boolean;
  is_public: boolean;
};

function emptyForm(service: RateServiceType = "choreography_production"): FormState {
  return {
    service_type: service,
    country: "",
    currency: "KRW",
    price: "",
    price_min: "",
    price_max: "",
    unit: "",
    note: "",
    is_negotiable: true,
    is_public: true,
  };
}

function rowToForm(row: RateCardRow): FormState {
  return {
    service_type: row.service_type,
    country: row.country ?? "",
    currency: row.currency ?? "KRW",
    price: row.price?.toString() ?? "",
    price_min: row.price_min?.toString() ?? "",
    price_max: row.price_max?.toString() ?? "",
    unit: row.unit ?? "",
    note: row.note ?? "",
    is_negotiable: row.is_negotiable,
    is_public: row.is_public,
  };
}

export function RateCardManager({
  initialCards,
  dancerId,
}: {
  initialCards: RateCardRow[];
  dancerId: string;
}) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const openCreate = (service?: RateServiceType) => {
    setEditingId(null);
    setForm(emptyForm(service ?? "choreography_production"));
    setError(null);
    setDrawerOpen(true);
  };

  const openEdit = (row: RateCardRow) => {
    setEditingId(row.id);
    setForm(rowToForm(row));
    setError(null);
    setDrawerOpen(true);
  };

  const handleSave = () => {
    setError(null);
    const fd = new FormData();
    fd.set("dancer_id", dancerId);
    fd.set("service_type", form.service_type);
    if (isCountryService(form.service_type) && form.country)
      fd.set("country", form.country);
    fd.set("currency", form.currency);
    if (form.price) fd.set("price", form.price);
    if (form.price_min) fd.set("price_min", form.price_min);
    if (form.price_max) fd.set("price_max", form.price_max);
    if (form.unit) fd.set("unit", form.unit);
    if (form.note) fd.set("note", form.note);
    fd.set("is_negotiable", form.is_negotiable ? "true" : "false");
    fd.set("is_public", form.is_public ? "true" : "false");

    startTransition(async () => {
      const result = await upsertRateCardAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      setDrawerOpen(false);
      setEditingId(null);
    });
  };

  const handleDelete = (row: RateCardRow) => {
    if (!confirm("이 단가를 삭제하시겠습니까?")) return;
    const fd = new FormData();
    fd.set("dancer_id", dancerId);
    fd.set("id", row.id);
    startTransition(async () => {
      const result = await deleteRateCardAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      setDrawerOpen(false);
      setEditingId(null);
    });
  };

  const cardsByService = RATE_SERVICE_TYPES.map((st) => ({
    service: st,
    label: RATE_SERVICE_LABELS[st],
    hint: RATE_SERVICE_HINTS[st],
    items: initialCards
      .filter((c) => c.service_type === st)
      .sort((a, b) => (a.country ?? "").localeCompare(b.country ?? "")),
  }));

  const editingCountryLocked = editingId != null; // 국가는 자연키라 수정 모달에서 고정

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {cardsByService.map((group) => (
          <div
            key={group.service}
            className="overflow-hidden rounded-xl border border-hairline-2 bg-card"
          >
            <div className="flex items-center justify-between gap-2 border-b border-hairline-2 px-4 py-3">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-foreground">
                  {group.label}
                  <span className="ml-1.5 font-mono text-xs font-normal text-ink-3">
                    ({group.items.length})
                  </span>
                </span>
                <span className="text-[11px] text-ink-3">{group.hint}</span>
              </div>
              <button
                type="button"
                onClick={() => openCreate(group.service)}
                className="flex shrink-0 items-center gap-1 rounded-full border border-hairline-2 px-2.5 py-1 text-xs font-medium text-ink-2 transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Plus className="size-3" />
                추가
              </button>
            </div>

            {group.items.length > 0 ? (
              <ul className="flex flex-col gap-2 p-2">
                {group.items.map((row) => (
                  <li key={row.id}>
                    <RateRow
                      row={row}
                      showCountry={isCountryService(group.service)}
                      onEdit={() => openEdit(row)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <button
                type="button"
                onClick={() => openCreate(group.service)}
                className="m-2 flex items-center justify-center gap-1 rounded-lg border border-dashed border-hairline-2 py-4 text-xs text-ink-3 transition-colors hover:border-primary/40 hover:text-primary"
                style={{ width: "calc(100% - 1rem)" }}
              >
                <Plus className="size-4 opacity-70" />
                단가 입력하기
              </button>
            )}
          </div>
        ))}
      </div>

      <BottomSheet
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) {
            setEditingId(null);
            setError(null);
          }
        }}
        title={editingId != null ? "단가 수정" : "단가 추가"}
      >
        <form className="flex flex-col gap-5 pb-2">
          <Field label="서비스 종류">
            <select
              value={form.service_type}
              disabled={editingId != null}
              onChange={(e) =>
                setForm({
                  ...form,
                  service_type: e.target.value as RateServiceType,
                  country: "",
                })
              }
              className={cn(selectClass, editingId != null && "opacity-60")}
            >
              {RATE_SERVICE_TYPES.map((st) => (
                <option key={st} value={st}>
                  {RATE_SERVICE_LABELS[st]}
                </option>
              ))}
            </select>
          </Field>

          {isCountryService(form.service_type) ? (
            <Field
              label="국가"
              hint="비워두면 '기본 해외 단가'(미지정국 폴백)로 저장됩니다. 나라별로 다르면 따로 추가하세요."
            >
              <select
                value={form.country}
                disabled={editingCountryLocked}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className={cn(selectClass, editingCountryLocked && "opacity-60")}
              >
                <option value="">기본 해외 (미지정국)</option>
                {COMMON_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label} ({c.code})
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <div className="grid grid-cols-[1fr_5.5rem] gap-3">
            <Field label="대표 단가">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="예: 800000"
                className={inputClass}
              />
            </Field>
            <Field label="통화">
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className={selectClass}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="범위 하한 (선택)">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={form.price_min}
                onChange={(e) => setForm({ ...form, price_min: e.target.value })}
                placeholder="최소"
                className={inputClass}
              />
            </Field>
            <Field label="범위 상한 (선택)">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={form.price_max}
                onChange={(e) => setForm({ ...form, price_max: e.target.value })}
                placeholder="최대"
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="단가 기준 (선택)" hint="예: 1편, 1곡, 1일, 2시간">
            <input
              type="text"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="1편"
              className={inputClass}
            />
          </Field>

          <Field label="비고 (선택)">
            <textarea
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="조건·포함범위 등"
              rows={2}
              className={cn(inputClass, "h-20 resize-none")}
            />
          </Field>

          <div className="flex flex-col gap-2">
            <ToggleRow
              label="협의 가능"
              desc="제시 단가에서 협의 여지가 있어요"
              checked={form.is_negotiable}
              onToggle={() =>
                setForm({ ...form, is_negotiable: !form.is_negotiable })
              }
            />
            <ToggleRow
              label="공개"
              desc="끄면 비공개(나·관리자만)로 저장됩니다"
              checked={form.is_public}
              onToggle={() => setForm({ ...form, is_public: !form.is_public })}
            />
          </div>

          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex gap-3 border-t border-hairline-2 pt-4">
            {editingId != null ? (
              <button
                type="button"
                onClick={() => {
                  const row = initialCards.find((c) => c.id === editingId);
                  if (row) handleDelete(row);
                }}
                disabled={pending}
                className="rounded-xl bg-destructive/10 px-4 py-3 text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
                aria-label="삭제"
              >
                <Trash2 className="size-5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Save className="size-5" />
              )}
              {editingId != null ? "수정 완료" : "저장"}
            </button>
          </div>
        </form>
      </BottomSheet>
    </div>
  );
}

function RateRow({
  row,
  showCountry,
  onEdit,
}: {
  row: RateCardRow;
  showCountry: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-hairline-2 bg-surface-2 p-3 transition-colors hover:border-foreground/20">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {showCountry ? (
            <span className="shrink-0 rounded border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] font-bold text-primary">
              {countryLabel(row.country)}
            </span>
          ) : null}
          {row.is_negotiable ? (
            <span className="shrink-0 rounded border border-hairline-2 bg-surface-3 px-1.5 py-0.5 text-[10px] text-ink-2">
              협의가능
            </span>
          ) : null}
          {!row.is_public ? (
            <span className="shrink-0 rounded border border-hairline-2 bg-surface-3 px-1.5 py-0.5 text-[10px] text-ink-3">
              비공개
            </span>
          ) : null}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-foreground">
            {formatRate(row)}
          </span>
          {row.unit ? (
            <span className="text-xs text-ink-3">/ {row.unit}</span>
          ) : null}
        </div>
        {row.note ? (
          <p className="line-clamp-1 text-xs text-ink-3">{row.note}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onEdit}
        aria-label="수정"
        className="shrink-0 rounded-md p-1.5 text-ink-3 transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Edit2 className="size-3.5" />
      </button>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onToggle,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className="flex items-center justify-between gap-3 rounded-xl border border-hairline-2 bg-surface-2 px-4 py-3 text-left"
    >
      <div className="flex flex-col">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-ink-3">{desc}</span>
      </div>
      <span
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-surface-3",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

const inputClass =
  "w-full rounded-xl border border-hairline-2 bg-surface-2 px-4 py-3 text-sm text-foreground placeholder:text-ink-4 focus:border-primary focus:outline-none";

const selectClass =
  "h-11 w-full appearance-none rounded-xl border border-hairline-2 bg-surface-2 px-4 text-sm text-foreground focus:border-primary focus:outline-none";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}
