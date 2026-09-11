"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CAREER_CATEGORY_LABELS,
  type CareerCategory,
} from "@/lib/validation/portfolio";
import { addCareerAction } from "@/app/actions/careers";
import type { ParsedPortfolio } from "@/lib/ai/portfolio-extractor";
import { useT } from "@/lib/i18n/provider";
import portfolio from "@/lib/i18n/messages/portfolio";

type Career = ParsedPortfolio["careers"][number];
type CareerWithMeta = Career & { _id: string; _include: boolean };

const CATEGORIES: CareerCategory[] = [
  "choreo",
  "performance",
  "broadcast",
  "award",
  "judge",
  "workshop",
  "education",
  "battle",
  "other",
];

export function ImportReviewList({
  parsed,
  dancerId,
  showProfile,
  onDone,
  onCancel,
}: {
  parsed: ParsedPortfolio;
  /** When provided, careers attach to this dancer. */
  dancerId: string | null;
  /** Show the profile summary block (true on onboarding entry, false on careers page entry). */
  showProfile: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useT(portfolio);
  const router = useRouter();
  const [careers, setCareers] = useState<CareerWithMeta[]>(() =>
    parsed.careers.map((c, i) => ({
      ...c,
      _id: `${i}-${Date.now()}`,
      _include: true,
    })),
  );
  const [submitting, startTransition] = useTransition();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [errors, setErrors] = useState<string[]>([]);

  function updateCareer(id: string, patch: Partial<CareerWithMeta>) {
    setCareers((prev) => prev.map((c) => (c._id === id ? { ...c, ...patch } : c)));
  }

  function handleSaveAll() {
    if (!dancerId) {
      setErrors([t("import.review_error_no_dancer")]);
      return;
    }
    const selected = careers.filter((c) => c._include);
    if (selected.length === 0) {
      onDone();
      return;
    }
    setErrors([]);
    setProgress({ done: 0, total: selected.length });
    startTransition(async () => {
      const failed: string[] = [];
      let done = 0;
      for (const c of selected) {
        const fd = new FormData();
        fd.set("dancer_id", dancerId);
        fd.set("type", c.type);
        fd.set("title", c.title);
        fd.set("date", c.date);
        if (c.role) fd.set("role", c.role);
        if (c.description) fd.set("description", c.description);
        if (c.link) fd.set("link", c.link);
        fd.set("is_public", "true");
        const res = await addCareerAction(fd);
        done += 1;
        setProgress({ done, total: selected.length });
        if (!res.ok) {
          failed.push(`${c.title}: ${res.error}`);
        }
      }
      if (failed.length > 0) setErrors(failed);
      router.refresh();
      if (failed.length === 0) onDone();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {parsed.warnings.length > 0 ? (
        <div className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs text-warn">
          <p className="mb-1 font-semibold">{t("import.review_warnings_title")}</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {parsed.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {showProfile ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
            {t("import.review_profile_title")}
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <Field
              label={t("import.review_field_stage_name")}
              value={parsed.profile.stage_name}
            />
            <Field
              label={t("import.review_field_korean_name")}
              value={parsed.profile.korean_name}
            />
            <Field
              label={t("import.review_field_location")}
              value={parsed.profile.location}
            />
            <Field
              label={t("import.review_field_gender")}
              value={parsed.profile.gender}
            />
            <Field
              label={t("import.review_field_genres")}
              value={(parsed.profile.genres ?? []).join(", ")}
            />
            <Field
              label={t("import.review_field_specialties")}
              value={(parsed.profile.specialties ?? []).join(", ")}
            />
            <Field
              label="Instagram"
              value={parsed.profile.social_instagram_handle}
            />
            <Field
              label="YouTube"
              value={parsed.profile.social_youtube_handle}
            />
            <Field
              label="TikTok"
              value={parsed.profile.social_tiktok_handle}
            />
          </dl>
          {parsed.profile.bio ? (
            <p
              className="mt-3 whitespace-pre-wrap rounded-md bg-secondary/40 p-3 text-xs text-ink-2"
              data-ugc
            >
              {parsed.profile.bio}
            </p>
          ) : null}
          <p className="mt-2 text-[10px] text-ink-3">
            {t("import.review_profile_note")}
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
          {t("import.review_extracted", {
            selected: careers.filter((c) => c._include).length,
            total: careers.length,
          })}
        </p>
        <button
          type="button"
          onClick={() =>
            setCareers((prev) => prev.map((c) => ({ ...c, _include: true })))
          }
          className="text-xs text-ink-3 underline-offset-4 hover:text-foreground hover:underline"
        >
          {t("import.review_select_all")}
        </button>
      </div>

      {careers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline-2 p-6 text-center text-sm text-ink-3">
          {t("import.review_empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {careers.map((c) => (
            <li
              key={c._id}
              className={
                "rounded-xl border bg-card p-3 transition-opacity " +
                (c._include
                  ? "border-border"
                  : "border-hairline-2 opacity-50")
              }
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={c._include}
                  onChange={(e) =>
                    updateCareer(c._id, { _include: e.target.checked })
                  }
                  className="mt-1"
                />
                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={c.type}
                      onChange={(e) =>
                        updateCareer(c._id, {
                          type: e.target.value as Career["type"],
                        })
                      }
                      className="rounded-md border border-input bg-background px-2 py-1 text-[11px]"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {CAREER_CATEGORY_LABELS[cat]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={c.date}
                      onChange={(e) =>
                        updateCareer(c._id, { date: e.target.value })
                      }
                      className="rounded-md border border-input bg-background px-2 py-1 text-[11px]"
                    />
                    {c._confidence === "low" ? (
                      <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] text-warn">
                        {t("import.review_badge_estimated")}
                      </span>
                    ) : null}
                  </div>
                  <input
                    type="text"
                    value={c.title}
                    onChange={(e) =>
                      updateCareer(c._id, { title: e.target.value })
                    }
                    className="rounded-md border border-input bg-background px-2 py-1.5 text-sm font-medium"
                    placeholder={t("import.review_placeholder_title")}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={c.role ?? ""}
                      onChange={(e) =>
                        updateCareer(c._id, { role: e.target.value || null })
                      }
                      className="rounded-md border border-input bg-background px-2 py-1 text-[11px]"
                      placeholder={t("import.review_placeholder_role")}
                    />
                    <input
                      type="text"
                      value={c.link ?? ""}
                      onChange={(e) =>
                        updateCareer(c._id, { link: e.target.value || null })
                      }
                      className="rounded-md border border-input bg-background px-2 py-1 text-[11px]"
                      placeholder={t("import.review_placeholder_link")}
                    />
                  </div>
                  {c.description ? (
                    <textarea
                      value={c.description ?? ""}
                      onChange={(e) =>
                        updateCareer(c._id, {
                          description: e.target.value || null,
                        })
                      }
                      rows={2}
                      className="rounded-md border border-input bg-background px-2 py-1 text-[11px]"
                      placeholder={t("import.review_placeholder_description")}
                    />
                  ) : null}
                  {c._raw_date ? (
                    <p className="text-[10px] text-ink-3">
                      {t("import.review_raw_date", { value: c._raw_date })}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {errors.length > 0 ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <p className="mb-1 font-semibold">{t("import.review_errors_title")}</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {progress ? (
        <p className="text-xs text-ink-3">
          {t("import.review_progress", {
            done: progress.done,
            total: progress.total,
          })}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 rounded-full border border-hairline-2 px-4 py-2 text-sm font-medium"
        >
          {t("import.review_cancel")}
        </button>
        <button
          type="button"
          onClick={handleSaveAll}
          disabled={submitting || careers.filter((c) => c._include).length === 0}
          className="flex-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {submitting
            ? t("import.review_saving")
            : t("import.review_save_selected")}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt className="text-ink-3">{label}</dt>
      <dd className="truncate text-foreground" data-ugc>
        {value || "—"}
      </dd>
    </>
  );
}
