import type { ProjectDraft } from "./schema";
import { stripPayDisclosure } from "./pay-policy.mjs";

export type ProjectFormDefaults = Partial<
  Omit<ProjectDraft, "genre_slug" | "schedules">
> & {
  genre_id?: string | null;
  posted_by_label?: string;
  is_standing_pool?: boolean;
  schedules?: Array<{
    label: string;
    date: string;
    start: string;
    end: string;
    location: string;
  }>;
};

export function koreanDateTimeInput(value?: string | null): string {
  if (!value) return "";
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return "";
  return new Date(milliseconds + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function intakeFormDefaults(
  project: ProjectDraft,
  genres: Array<{ id: string; slug: string }>,
): ProjectFormDefaults {
  return {
    ...project,
    title: stripPayDisclosure(project.title),
    description: stripPayDisclosure(project.description),
    pay_amount: null,
    pay_type: null,
    genre_id: genres.find((g) => g.slug === project.genre_slug)?.id ?? null,
    posted_by_label: "deetz",
    schedules: (project.schedules ?? []).map((s) => ({
      label: s.label,
      date: koreanDateTimeInput(s.starts_at).slice(0, 10),
      start: s.time_tbd ? "" : koreanDateTimeInput(s.starts_at).slice(11),
      end: s.ends_at ? koreanDateTimeInput(s.ends_at).slice(11) : "",
      location: s.location ?? "",
    })),
  };
}
