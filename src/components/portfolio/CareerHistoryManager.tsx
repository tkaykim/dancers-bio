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
}: {
  initialCareers: CareerRow[];
}) {
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
    setForm(makeInitialForm(category ?? (openCategory || "choreo")));
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
      setError("제목을 입력해 주세요.");
      return;
    }
    setError(null);
    const fd = formToFormData(form);
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
    if (!confirm("정말 삭제하시겠습니까?")) return;
    const fd = new FormData();
    fd.set("id", String(id));
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
    if (!confirm("이 경력을 비공개로 전환하시겠습니까? 프로필에 더 이상 표시되지 않습니다.")) {
      return;
    }
    runSetVisibility(id, false);
  };

  const runSetVisibility = (id: number, isPublic: boolean) => {
    setTogglingId(id);
    const fd = new FormData();
    fd.set("id", String(id));
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
                      <span className="text-xs">이력 추가하기</span>
                    </button>
                  ) : (
                    cat.items.map((item) => (
                      <CareerCard
                        key={item.id}
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
        새로운 이력 추가하기
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
        title={editingId != null ? "이력 수정" : "새 이력 추가"}
      >
        <form className="flex flex-col gap-5 pb-2">
          <Field label="카테고리">
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

          <Field label="제목" required>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="활동 제목 입력"
              className={inputClass}
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="연도">
              <input
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                placeholder="YYYY"
                className={inputClass}
              />
            </Field>
            <Field label="월">
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

          <Field label="역할">
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
              placeholder="역할 직접 입력"
              className={inputClass}
            />
          </Field>

          <Field
            label="관련 영상 링크 (권장)"
            hint="비어두면 경력이 해당 카테고리 맨 뒤로 밀립니다."
          >
            <input
              type="url"
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
              placeholder="우선순위: 안무 시안 → 퍼포먼스 → 연습실 → 뮤직비디오"
              className={inputClass}
            />
          </Field>

          <Field label="상세 설명">
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="추가 설명..."
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
                대표 경력으로 설정
              </p>
              <p className="text-xs text-ink-3">
                체크 시 프로필 상단 Highlights 섹션에 노출됩니다.
              </p>
            </div>
          </div>

          <Field
            label="정렬 우선순위"
            hint="숫자가 높을수록 카테고리 내에서 먼저 노출됩니다. (기본값: 0)"
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
                aria-label="삭제"
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
                  저장 후 계속
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
                {editingId != null ? "수정 완료" : "저장 완료"}
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
              경력을 공개할까요?
            </h3>
            <button
              type="button"
              onClick={() => setConfirmPublicId(null)}
              className="rounded-full p-1.5 text-ink-3 transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="닫기"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="text-sm text-ink-2">
            공개 처리 시 프로필에 이 경력이 노출됩니다.
          </p>
          <p className="rounded-lg border border-warn/20 bg-warn/10 px-3 py-2.5 text-xs text-warn">
            엠바고, 출시일, 발매일 등을 고려하여{" "}
            <strong>공개해도 되는지 꼭 확인</strong>한 뒤 진행해 주세요.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmPublicId(null)}
              className="flex-1 rounded-xl bg-secondary py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-3"
            >
              취소
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
              공개로 전환
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CareerCard({
  item,
  toggling,
  onToggleVisibility,
  onEdit,
}: {
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
            <span className="shrink-0 rounded border border-hairline-2 bg-surface-3 px-1.5 py-0.5 text-[10px] text-ink-2">
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
            {item.is_public ? "공개" : "비공개"}
          </span>
          {item.sort_order > 0 ? (
            <span className="shrink-0 rounded border border-warn/20 bg-warn/10 px-1.5 py-0.5 text-[10px] font-medium text-warn">
              우선 {item.sort_order}
            </span>
          ) : null}
          {item.is_representative ? (
            <span className="shrink-0 rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              ★ 대표
            </span>
          ) : null}
        </div>
        <h3 className="truncate pr-2 text-sm font-medium text-foreground">
          {item.title}
        </h3>
        {item.details?.description ? (
          <p className="line-clamp-1 text-xs text-ink-3">
            {item.details.description}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onToggleVisibility}
          disabled={toggling}
          aria-label={item.is_public ? "비공개로 전환" : "공개로 전환"}
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
          aria-label="수정"
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
