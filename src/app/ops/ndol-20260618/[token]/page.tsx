import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { OpsBoardClient, type ApplicantSummary } from "./OpsBoardClient";

export const dynamic = "force-dynamic";

const NDOL_EVENT_KEY = "ndol-20260618";
const NDOL_PROJECT_CODES = ["ndol26", "ndolsm", "ndol02", "ndolbd"] as const;

export const metadata: Metadata = {
  title: "6/18 NDOL 운영판",
  robots: { index: false, follow: false },
};

type GenderBreakdown = ApplicantSummary["total"];
type Gender = "male" | "female" | "unknown";

type Nested<T> = T | T[] | null;

type RawProject = {
  id: string;
  short_code: string | null;
  title: string | null;
};

type RawApplication = {
  id: string;
  project_id: string | null;
  dancer_id: string | null;
  team_id: string | null;
  applicant_id: string | null;
  status: string | null;
  rejection_reason: string | null;
  created_at: string | null;
  dancer: Nested<{
    stage_name: string | null;
    korean_name: string | null;
    slug: string | null;
    profile_img: string | null;
    gender: string | null;
    genres: string[] | null;
    location: string | null;
  }>;
  applicant: Nested<{
    display_name: string | null;
    avatar_url: string | null;
  }>;
  team: Nested<{
    team_name: string | null;
    slug: string | null;
    profile_img: string | null;
  }>;
};

type RawOpsContact = {
  source_key: string | null;
  app_status: string | null;
  availability_status: string | null;
  outreach_status: string | null;
  gender: string | null;
};

function emptyBreakdown(): GenderBreakdown {
  return { total: 0, male: 0, female: 0, unknown: 0 };
}

function emptyApplicantSummary(): ApplicantSummary {
  return {
    totalApplications: 0,
    uniqueApplicants: 0,
    total: emptyBreakdown(),
    accepted: emptyBreakdown(),
    pending: emptyBreakdown(),
    dropped: emptyBreakdown(),
    withdrawn: emptyBreakdown(),
    scheduleBlocked: emptyBreakdown(),
    extra: emptyBreakdown(),
    projects: [],
    droppedApplicants: [],
  };
}

function emptyProjectSummary(code: string, title: string | null): ApplicantSummary["projects"][number] {
  return {
    code,
    title,
    total: emptyBreakdown(),
    accepted: emptyBreakdown(),
    pending: emptyBreakdown(),
    dropped: emptyBreakdown(),
    withdrawn: emptyBreakdown(),
  };
}

function one<T>(value: Nested<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizeGender(value: string | null | undefined): Gender {
  const normalized = (value ?? "").trim().toLowerCase();
  if (["male", "m", "man", "남", "남성", "남자"].includes(normalized)) return "male";
  if (["female", "f", "woman", "여", "여성", "여자"].includes(normalized)) return "female";
  return "unknown";
}

function bump(target: GenderBreakdown, gender: Gender) {
  target.total += 1;
  target[gender] += 1;
}

function applicationBucket(status: string | null | undefined) {
  const value = (status ?? "pending").toLowerCase();
  if (value === "accepted") return "accepted";
  if (value === "rejected" || value === "declined") return "dropped";
  if (value === "withdrawn") return "withdrawn";
  return "pending";
}

function applicationStatusLabel(status: string | null | undefined) {
  const value = (status ?? "pending").toLowerCase();
  if (value === "accepted") return "통과";
  if (value === "rejected" || value === "declined") return "드롭";
  if (value === "withdrawn") return "취소";
  return "보류";
}

async function isOpsTokenValid(
  admin: ReturnType<typeof createAdminClient>,
  token: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc("is_ops_event_token_valid", {
    p_event_key: NDOL_EVENT_KEY,
    p_token: token,
  });
  if (error) return false;
  return data === true;
}

async function getApplicantSummary(token: string): Promise<ApplicantSummary | null> {
  try {
    const admin = createAdminClient();
    if (!(await isOpsTokenValid(admin, token))) return null;
    const summary = emptyApplicantSummary();

    const { data: projectRows, error: projectError } = await admin
      .from("projects")
      .select("id, short_code, title")
      .in("short_code", [...NDOL_PROJECT_CODES]);

    if (projectError) throw projectError;

    const projects = ((projectRows ?? []) as RawProject[]).sort(
      (a, b) =>
        NDOL_PROJECT_CODES.indexOf(a.short_code as (typeof NDOL_PROJECT_CODES)[number]) -
        NDOL_PROJECT_CODES.indexOf(b.short_code as (typeof NDOL_PROJECT_CODES)[number]),
    );
    const projectIds = projects.map((project) => project.id);
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const projectSummaries = new Map(
      projects.map((project) => [
        project.id,
        emptyProjectSummary(project.short_code ?? "unknown", project.title),
      ]),
    );

    if (projectIds.length > 0) {
      const { data: applicationRows, error: applicationError } = await admin
        .from("applications")
        .select(
          `id, project_id, dancer_id, team_id, applicant_id, status, rejection_reason, created_at,
           dancer:dancers!applications_dancer_id_fkey (
             stage_name, korean_name, slug, profile_img, gender, genres, location
           ),
           applicant:profiles!applications_applicant_id_fkey (
             display_name, avatar_url
           ),
           team:teams!applications_team_id_fkey (
             team_name, slug, profile_img
           )`,
        )
        .in("project_id", projectIds)
        .is("archived_at", null)
        .order("created_at", { ascending: false });

      if (applicationError) throw applicationError;

      const uniqueApplicants = new Set<string>();
      for (const app of (applicationRows ?? []) as RawApplication[]) {
        const dancer = one(app.dancer);
        const applicant = one(app.applicant);
        const team = one(app.team);
        const gender = normalizeGender(dancer?.gender);
        const bucket = applicationBucket(app.status);
        const project = app.project_id ? projectById.get(app.project_id) : null;
        const projectSummary = app.project_id ? projectSummaries.get(app.project_id) : null;
        const uniqueKey = app.dancer_id
          ? `dancer:${app.dancer_id}`
          : app.team_id
            ? `team:${app.team_id}`
            : app.applicant_id
              ? `profile:${app.applicant_id}`
              : `application:${app.id}`;

        uniqueApplicants.add(uniqueKey);
        summary.totalApplications += 1;
        bump(summary.total, gender);
        if (projectSummary) bump(projectSummary.total, gender);

        if (bucket === "accepted") {
          bump(summary.accepted, gender);
          if (projectSummary) bump(projectSummary.accepted, gender);
        } else if (bucket === "dropped") {
          bump(summary.dropped, gender);
          if (projectSummary) bump(projectSummary.dropped, gender);

          const name =
            dancer?.stage_name ??
            dancer?.korean_name ??
            team?.team_name ??
            applicant?.display_name ??
            "이름 없음";
          summary.droppedApplicants.push({
            key: `${project?.short_code ?? "unknown"}-${summary.droppedApplicants.length + 1}-${name}`,
            name,
            projectCode: project?.short_code ?? "unknown",
            status: app.status ?? "rejected",
            statusLabel: applicationStatusLabel(app.status),
            gender,
            profileImg: dancer?.profile_img ?? team?.profile_img ?? applicant?.avatar_url ?? null,
            genres: (dancer?.genres ?? []).filter(Boolean),
            reason: app.rejection_reason ?? null,
          });
        } else if (bucket === "withdrawn") {
          bump(summary.withdrawn, gender);
          if (projectSummary) bump(projectSummary.withdrawn, gender);
        } else {
          bump(summary.pending, gender);
          if (projectSummary) bump(projectSummary.pending, gender);
        }
      }

      summary.uniqueApplicants = uniqueApplicants.size;
    }

    const { data: contactRows, error: contactError } = await admin
      .from("ops_ndol_contacts")
      .select("source_key, app_status, availability_status, outreach_status, gender")
      .eq("event_key", NDOL_EVENT_KEY);

    if (!contactError) {
      for (const contact of (contactRows ?? []) as RawOpsContact[]) {
        const gender = normalizeGender(contact.gender);
        const sourceKey = contact.source_key ?? "";
        if (contact.app_status === "confirmed_extra" || sourceKey.startsWith("extra:")) {
          bump(summary.extra, gender);
        }
        if (
          contact.outreach_status !== "available" &&
          (contact.availability_status === "cannot" || contact.outreach_status === "unavailable")
        ) {
          bump(summary.scheduleBlocked, gender);
        }
      }
    } else {
      console.warn("NDOL ops contact summary failed", contactError);
    }

    summary.projects = projects
      .map((project) => projectSummaries.get(project.id))
      .filter(Boolean) as ApplicantSummary["projects"];
    summary.droppedApplicants.sort((a, b) => {
      const projectOrder =
        NDOL_PROJECT_CODES.indexOf(a.projectCode as (typeof NDOL_PROJECT_CODES)[number]) -
        NDOL_PROJECT_CODES.indexOf(b.projectCode as (typeof NDOL_PROJECT_CODES)[number]);
      if (projectOrder !== 0) return projectOrder;
      return a.name.localeCompare(b.name, "ko");
    });

    return summary;
  } catch (error) {
    console.error("NDOL applicant summary failed", error);
    return null;
  }
}

export default async function NdolOpsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const applicantSummary = await getApplicantSummary(token);
  return <OpsBoardClient token={token} applicantSummary={applicantSummary} />;
}
