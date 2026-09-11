"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  ChevronsRight,
  Edit2,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Save,
  Star,
  Trash2,
  X,
} from "lucide-react";

import {
  addCareerAction,
  deleteCareerAction,
  setCareerVisibilityAction,
  updateCareerAction,
} from "@/app/actions/careers";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  CAREER_CATEGORY_LABELS,
  CAREER_CATEGORY_ROLES,
  type CareerCategory,
} from "@/lib/validation/portfolio";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import type { Translator } from "@/lib/i18n/t";
import portfolio from "@/lib/i18n/messages/portfolio";

type CareerDetails = {
  link?: string;
  role?: string;
  year?: string;
  month?: string;
  description?: string;
  thumbnail?: string;
  youtube_url?: string;
};

export type CareerRow = {
  id: number;
  type: string;
  title: string;
  date: string;
  details: CareerDetails | null;
  is_public: boolean;
  is_representative: boolean;
  sort_order: number;
};

type FormState = {
  type: CareerCategory;
  title: string;
  year: string;
  month: string;
  role: string;
  link: string;
  description: string;
  is_representative: boolean;
  sort_order: number;
};

const CATEGORIES = (Object.keys(CAREER_CATEGORY_LABELS) as CareerCategory[]).map(
  (id) => ({
    id,
    label: CAREER_CATEGORY_LABELS[id],
    roles: CAREER_CATEGORY_ROLES[id],
  }),
);

function makeInitialForm(category?: CareerCategory): FormState {
  return {
    type: category ?? "choreo",
    title: "",
    year: new Date().getFullYear().toString(),
    month: "",
    role: "",
    link: "",
    description: "",
    is_representative: false,
    sort_order: 0,
  };
}

function rowToForm(row: CareerRow): FormState {
  const details = row.details ?? {};
  const [datePartYear, datePartMonth] = row.date.split("-");
  return {
    type: (CATEGORIES.find((c) => c.id === row.type)?.id ??
      "other") as CareerCategory,
    title: row.title,
    year: details.year ?? datePartYear ?? "",
    month: details.month ?? (datePartMonth === "01" ? "" : datePartMonth ?? ""),
    role: details.role ?? "",
    link: details.link ?? details.youtube_url ?? "",
    description: details.description ?? "",
    is_representative: row.is_representative,
    sort_order: row.sort_order,
  };
}

function formToFormData(form: FormState): FormData {
  const fd = new FormData();
  fd.set("type", form.type);
  fd.set("title", form.title);
  const month = form.month ? form.month.padStart(2, "0") : "01";
  const year = form.year || new Date().getFullYear().toString();
  fd.set("date", `${year}-${month}-01`);
  if (form.role) fd.set("role", form.role);
  if (form.link) fd.set("link", form.link);
  if (form.description) fd.set("description", form.description);
  if (form.is_representative) fd.set("is_representative", "true");
  fd.set("sort_order", String(form.sort_order));
  return fd;
}

export function CareerHistoryManager({
  initialCareers,
  dancerId,
}: {
  initialCareers: CareerRow[];
  dancerId: string;
}) {
  const t = useT(portfolio);
  const router = useRouter();
  const [openCategory, setOpenCategory] = useState<CareerCategory | "">(
    "choreo",
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(() => makeInitialForm());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmPublicId, setConfirmPublicId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const openCreate = (category?: CareerCategory) => {
    setEditingId(null);
    // 카테고리 인자가 명시되면 그것을 우선. 없으면 현재 펼친 카테고리, 둘 다 없으면 choreo.
    const resolved: CareerCategory = category ?? (openCategory || "choreo");
    setForm(makeInitialForm(resolved));
    setError(null);
    setDrawerOpen(true);
  };

  const openEdit = (row: CareerRow) => {
    setEditingId(row.id);
    setForm(rowToForm(row));
    setError(null);
    setDrawerOpen(true);
  };

  const handleSave = (closeAfter: boolean) => {
    if (!form.title.trim()) {
      setError(t("careers.error_title_required"));
      return;
    }
    setError(null);
    const fd = formToFormData(form);
    fd.set("dancer_id", dancerId);
    if (editingId != null) fd.set("id", String(editingId));

    startTransition(async () => {
      const result = editingId != null
        ? await updateCareerAction(fd)
        : await addCareerAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      if (closeAfter) {
        setDrawerOpen(false);
        setEditingId(null);
        setForm(makeInitialForm(openCategory || "choreo"));
      } else {
        setForm(makeInitialForm(form.type));
      }
    });
  };

  const handleDelete = (id: number) => {
    if (!confirm(t("careers.confirm_delete"))) return;
    const fd = new FormData();
    fd.set("id", String(id));
    fd.set("dancer_id", dancerId);
    startTransition(async () => {
      const result = await deleteCareerAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      setDrawerOpen(false);
      setEditingId(null);
    });
  };

  const requestSetPublic = (id: number, makePublic: boolean) => {
    if (makePublic) {
      setConfirmPublicId(id);
      return;
    }
    if (!confirm(t("careers.confirm_unpublish"))) {
      return;
    }
    runSetVisibility(id, false);
  };

  const runSetVisibility = (id: number, isPublic: boolean) => {
    setTogglingId(id);
    const fd = new FormData();
    fd.set("id", String(id));
    fd.set("dancer_id", dancerId);
    fd.set("is_public", isPublic ? "true" : "false");
    startTransition(async () => {
      const result = await setCareerVisibilityAction(fd);
      setTogglingId(null);
      setConfirmPublicId(null);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      router.refresh();
    });
  };

  const careersByCategory = CATEGORIES.map((cat) => ({
    ...cat,
    items: initialCareers.filter((c) => c.type === cat.id),
  }));

  const formCategoryRoles =
    CAREER_CATEGORY_ROLES[form.type] ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {careersByCategory.map((cat) => {
          const isOpen = openCategory === cat.id;
          return (
            <div
              key={cat.id}
              className="overflow-hidden rounded-xl border border-hairline-2 bg-card"
            >
              <button
                type="button"
                onClick={() => setOpenCategory(isOpen ? "" : cat.id)}
                className={cn(
                  "flex w-full items-center justify-between px-5 py-4 transition-colors",
                  isOpen ? "bg-secondary" : "hover:bg-secondary/60",
                )}
              >
                <span
                  className={cn(
                    "text-sm font-bold",
                    isOpen ? "text-foreground" : "text-ink-2",
                  )}
                >
                  {cat.label}
                  <span className="ml-1.5 font-mono text-xs font-normal text-ink-3">
                    ({cat.items.length})
                  </span>
                </span>
                {isOpen ? (
                  <ChevronUp className="size-4 text-ink-3" />
                ) : (
                  <ChevronDown className="size-4 text-ink-3" />
                )}
              </button>

              {isOpen ? (
                <div className="flex flex-col gap-2 border-t border-hairline-2 p-2">
                  {cat.items.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => openCreate(cat.id)}
                      className="mx-2 flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-hairline-2 py-6 text-ink-3 transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      <Plus className="size-5 opacity-70" />
                      <span className="text-xs">{t("careers.empty_add")}</span>
                    </button>
                  ) : (
                    cat.items.map((item) => (
                      <CareerCard
                        key={item.id}
                        t={t}
                        item={item}
                        toggling={togglingId === item.id}
                        onToggleVisibility={() =>
                          requestSetPublic(item.id, !item.is_public)
                        }
                        onEdit={() => openEdit(item)}
                      />
                    ))
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => openCreate()}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-hairline-2 bg-card py-4 text-sm font-bold text-foreground shadow-sm transition-colors hover:bg-secondary"
      >
        <Plus className="size-5" />
        {t("careers.add_new")}
      </button>

      <BottomSheet
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) {
            setEditingId(null);
            setError(null);
          }
        }}
        title={
          editingId != null
            ? t("careers.sheet_title_edit")
            : t("careers.sheet_title_new")
        }
      >
        <form className="flex flex-col gap-5 pb-2">
          <Field label={t("careers.field_category")}>
            <div className="relative">
              <select
                value={form.type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    type: e.target.value as CareerCategory,
                    role: "",
                  })
                }
                className="h-11 w-full appearance-none rounded-xl border border-hairline-2 bg-surface-2 px-4 pr-10 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            </div>
          </Field>

          <Field label={t("careers.field_title")} required>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={t("careers.placeholder_title")}
              className={inputClass}
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("careers.field_year")}>
              <input
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                placeholder="YYYY"
                className={inputClass}
              />
            </Field>
            <Field label={t("careers.field_month")}>
              <input
                type="number"
                min="1"
                max="12"
                value={form.month}
                onChange={(e) => setForm({ ...form, month: e.target.value })}
                placeholder="MM"
                className={inputClass}
              />
            </Field>
          </div>

          <Field label={t("careers.field_role")}>
            {formCategoryRoles.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {formCategoryRoles.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setForm({ ...form, role })}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                      form.role === role
                        ? "border-foreground bg-foreground text-background"
                        : "border-hairline-2 bg-surface-2 text-ink-2 hover:text-foreground",
                    )}
                  >
                    {role}
                  </button>
                ))}
              </div>
            ) : null}
            <input
              type="text"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              placeholder={t("careers.placeholder_role")}
              className={inputClass}
            />
          </Field>

          <Field
            label={t("careers.field_link")}
            hint={t("careers.hint_link")}
          >
            <input
              type="url"
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
              placeholder={t("careers.placeholder_link")}
              className={inputClass}
            />
          </Field>

          <Field label={t("careers.field_description")}>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder={t("careers.placeholder_description")}
              rows={3}
              className={cn(inputClass, "h-24 resize-none")}
            />
          </Field>

          <div className="flex items-center gap-3 rounded-xl border border-hairline-2 bg-surface-2 px-4 py-3">
            <button
              type="button"
              role="checkbox"
              aria-checked={form.is_representative}
              onClick={() =>
                setForm({ ...form, is_representative: !form.is_representative })
              }
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
                form.is_representative
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-hairline-2 bg-surface-3 text-ink-3 hover:text-ink-2",
              )}
            >
              <Star
                className={cn("size-4", form.is_representative && "fill-current")}
              />
            </button>
            <div className="flex flex-1 flex-col">
              <p className="text-sm font-medium text-foreground">
                {t("careers.representative_title")}
              </p>
              <p className="text-xs text-ink-3">
                {t("careers.representative_desc")}
              </p>
            </div>
          </div>

          <Field
            label={t("careers.field_sort")}
            hint={t("careers.hint_sort")}
          >
            <input
              type="number"
              min="0"
              value={form.sort_order}
              onChange={(e) =>
                setForm({
                  ...form,
                  sort_order: parseInt(e.target.value, 10) || 0,
                })
              }
              className={inputClass}
            />
          </Field>

          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex gap-3 border-t border-hairline-2 pt-4">
            {editingId != null ? (
              <button
                type="button"
                onClick={() => handleDelete(editingId)}
                disabled={pending}
                className="rounded-xl bg-destructive/10 px-4 py-3 text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
                aria-label={t("careers.aria_delete")}
              >
                <Trash2 className="size-5" />
              </button>
            ) : null}

            <div className="flex flex-1 gap-2">
              {editingId == null ? (
                <button
                  type="button"
                  onClick={() => handleSave(false)}
                  disabled={pending}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-secondary py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-3 disabled:opacity-50"
                >
                  <ChevronsRight className="size-4" />
                  {t("careers.save_continue")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => handleSave(true)}
                disabled={pending}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Save className="size-5" />
                )}
                {editingId != null
                  ? t("careers.save_edit")
                  : t("careers.save_new")}
              </button>
            </div>
          </div>
        </form>
      </BottomSheet>

      <Dialog
        open={confirmPublicId != null}
        onOpenChange={(open) => !open && setConfirmPublicId(null)}
      >
        <DialogContent showCloseButton={false} className="max-w-md sm:max-w-md">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">
              {t("careers.publish_dialog_title")}
            </h3>
            <button
              type="button"
              onClick={() => setConfirmPublicId(null)}
              className="rounded-full p-1.5 text-ink-3 transition-colors hover:bg-secondary hover:text-foreground"
              aria-label={t("careers.aria_close")}
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="text-sm text-ink-2">{t("careers.publish_dialog_body")}</p>
          <p className="rounded-lg border border-warn/20 bg-warn/10 px-3 py-2.5 text-xs text-warn">
            <PublishWarning t={t} />
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmPublicId(null)}
              className="flex-1 rounded-xl bg-secondary py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-3"
            >
              {t("careers.cancel")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                confirmPublicId != null && runSetVisibility(confirmPublicId, true)
              }
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-5 animate-spin" /> : null}
              {t("careers.publish_confirm")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * 한 문장 안에 <strong> 강조가 들어가는 경우 — 문장을 조각내지 않고 통 문장 키 하나를
 * 유지한 뒤, 번역된 문장에서 강조 구절만 찾아 감싼다.
 */
function PublishWarning({ t }: { t: Translator<typeof portfolio> }) {
  const full = t("careers.publish_warning");
  const emphasis = t("careers.publish_warning_emphasis");
  const at = full.indexOf(emphasis);
  if (at < 0) return <>{full}</>;
  return (
    <>
      {full.slice(0, at)}
      <strong>{emphasis}</strong>
      {full.slice(at + emphasis.length)}
    </>
  );
}

function CareerCard({
  t,
  item,
  toggling,
  onToggleVisibility,
  onEdit,
}: {
  t: Translator<typeof portfolio>;
  item: CareerRow;
  toggling: boolean;
  onToggleVisibility: () => void;
  onEdit: () => void;
}) {
  const year = item.details?.year ?? "";
  const month = item.details?.month ?? "";
  return (
    <div className="flex items-start gap-2 rounded-lg border border-hairline-2 bg-surface-2 p-3 transition-colors hover:border-foreground/20">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {year || month ? (
            <span className="shrink-0 rounded border border-primary/20 bg-primary/5 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">
              {year}
              {month ? `.${month}` : ""}
            </span>
          ) : null}
          {item.details?.role ? (
            <span
              className="shrink-0 rounded border border-hairline-2 bg-surface-3 px-1.5 py-0.5 text-[10px] text-ink-2"
              data-ugc
            >
              {item.details.role}
            </span>
          ) : null}
          <span
            className={cn(
              "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium",
              item.is_public
                ? "border-ok/20 bg-ok/10 text-ok"
                : "border-hairline-2 bg-surface-3 text-ink-3",
            )}
          >
            {item.is_public
              ? t("careers.badge_public")
              : t("careers.badge_private")}
          </span>
          {item.sort_order > 0 ? (
            <span className="shrink-0 rounded border border-warn/20 bg-warn/10 px-1.5 py-0.5 text-[10px] font-medium text-warn">
              {t("careers.badge_priority", { n: item.sort_order })}
            </span>
          ) : null}
          {item.is_representative ? (
            <span className="shrink-0 rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {t("careers.badge_representative")}
            </span>
          ) : null}
        </div>
        <h3 className="truncate pr-2 text-sm font-medium text-foreground" data-ugc>
          {item.title}
        </h3>
        {item.details?.description ? (
          <p className="line-clamp-1 text-xs text-ink-3" data-ugc>
            {item.details.description}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onToggleVisibility}
          disabled={toggling}
          aria-label={
            item.is_public
              ? t("careers.aria_make_private")
              : t("careers.aria_make_public")
          }
          className={cn(
            "rounded-md p-1.5 transition-colors disabled:opacity-50",
            item.is_public
              ? "text-ok/80 hover:bg-ok/10 hover:text-ok"
              : "text-ink-3 hover:bg-secondary hover:text-foreground",
          )}
        >
          {toggling ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : item.is_public ? (
            <Eye className="size-3.5" />
          ) : (
            <EyeOff className="size-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={onEdit}
          aria-label={t("careers.aria_edit")}
          className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Edit2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-hairline-2 bg-surface-2 px-4 py-3 text-sm text-foreground placeholder:text-ink-4 focus:border-primary focus:outline-none";

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </label>
      {children}
      {hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}
