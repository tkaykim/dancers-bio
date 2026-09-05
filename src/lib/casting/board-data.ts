import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCastingReviewToken } from "@/lib/quick-token";
import {
  applicationMatchesCandidateStatuses,
  normalizeCandidateStatuses,
  type CandidateStatus,
  type ClientDecision,
  type ClientReviewSettings,
} from "@/lib/casting/review";
import {
  buildForecastSummary,
  normalizeAccountType,
  normalizeForecastSettings,
  normalizeLineupStatus,
  resolveTier,
  type AccountType,
  type ForecastSettings,
  type ForecastSummary,
  type LineupStatus,
  type LineupTier,
} from "@/lib/casting/forecast";

// 클라이언트 공유 캐스팅 보드의 안전 데이터(전화 등 민감정보 제외).
export type BoardCard = {
  memberId: string;
  dancerId: string;
  applicationId: string | null;
  applicationStatus: string | null;
  confirmedAt: string | null;
  name: string;
  koreanName: string | null;
  gender: "male" | "female" | string | null;
  height: number | null;
  photo: string | null;
  instagram: string | null;
  career: string | null;
  slug: string | null;
  birthYear: number | null;
  primaryGenre: string | null;
  danceVideoUrl: string | null;
  backupDancerHistory: string | null;
  personalProfileUrl: string | null;
  // 라인업 예측 보드용 지표(금액 없음). 큐레이션되지 않은 멤버는 전부 null.
  lineupStatus: LineupStatus | null;
  accountType: AccountType | null;
  igHandle: string | null;
  followers: number | null;
  expectedViews: number | null;
  medianViews: number | null;
  viewsLow: number | null;
  viewsHigh: number | null;
  tier: LineupTier | null;
  contentDirection: string | null;
  clientDecision?: ClientDecision;
  clientDecidedAt?: string | null;
  clientDecidedBy?: string | null;
};

export type BoardRateRow = {
  dancerId?: string | null;
  name: string;
  category?: string | null;
  followersMan: number;
  highlight?: string | null;
  priceKrw: number;
};

export type BoardRateTable = {
  title?: string | null;
  caption?: string | null;
  notice?: string | null;
  rows: BoardRateRow[];
};

export type BoardSettings = {
  genderPriority?: "male" | "female" | null;
  sortBy?: "height" | "manual" | "expectedViews";
  requirePhoto?: boolean;
  genders?: string[];
  minHeight?: number | null;
  fields?: {
    height?: boolean;
    instagram?: boolean;
    career?: boolean;
    profile?: boolean;
    applicationDetails?: boolean;
  };
  note?: string | null;
  notes?: string[];
  rateTable?: BoardRateTable | null;
  clientReview?: ClientReviewSettings;
  forecast?: ForecastSettings | null;
  // 공유 링크 미리보기 제목(짧게). 비우면 보드 제목을 쓴다.
  shareTitle?: string | null;
};

export type BoardView = {
  id: string;
  projectId: string;
  title: string | null;
  shareCode: string;
  settings: BoardSettings;
  notes: string[];
  cards: BoardCard[];
  counts: { total: number; male: number; female: number; withPhoto: number };
  forecast: ForecastSummary | null;
  review: {
    authorized: boolean;
    enabled: boolean;
    candidateStatuses: CandidateStatus[];
    applySelectedAs: "accepted" | "confirmed";
    submittedAt: string | null;
    submittedBy: string | null;
    counts: Record<ClientDecision, number>;
  };
};

type BoardRow = {
  id: string;
  project_id: string;
  title: string | null;
  share_code: string;
  settings: BoardSettings | null;
  is_active: boolean;
  expires_at: string | null;
  review_token_version: number;
  review_submitted_at: string | null;
  review_submitted_by: string | null;
};

type MemberRow = {
  id: string;
  dancer_id: string | null;
  application_id: string | null;
  sort_order: number;
  display_name: string | null;
  korean_name: string | null;
  gender: string | null;
  height_cm: number | null;
  client_decision: ClientDecision;
  client_decided_at: string | null;
  client_decided_by: string | null;
  lineup_status: string | null;
  account_type: string | null;
  ig_handle: string | null;
  photo_url: string | null;
  followers: number | null;
  expected_views: number | null;
  median_views: number | null;
  views_low: number | null;
  views_high: number | null;
  tier: string | null;
  content_direction: string | null;
};

type ApplicationRow = {
  id: string;
  status: string;
  confirmed_at: string | null;
  birth_year: number | null;
  height_cm: number | null;
  primary_genre: string | null;
  dance_video_url: string | null;
  backup_dancer_history: string | null;
  personal_profile_url: string | null;
};

export type CastingReviewProfileCareer = {
  id: number;
  type: string | null;
  title: string | null;
  date: string | null;
  link: string | null;
  isRepresentative: boolean;
};

export type CastingReviewProfile = {
  name: string;
  koreanName: string | null;
  slug: string | null;
  photo: string | null;
  bio: string | null;
  location: string | null;
  gender: string | null;
  genres: string[];
  specialties: string[];
  portfolioFileUrl: string | null;
  portfolioFileName: string | null;
  socialLinks: Record<string, string>;
  careers: CastingReviewProfileCareer[];
};

function resolveNotes(settings: BoardSettings): string[] {
  const list =
    Array.isArray(settings.notes) && settings.notes.length
      ? settings.notes
      : settings.note
        ? [settings.note]
        : [];
  return list.map((note) => (note ?? "").trim()).filter(Boolean);
}

function instaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return "https://www.instagram.com/" + value.replace(/^@/, "");
}

function lineupFieldsOf(member: MemberRow) {
  const expectedViews = member.expected_views ?? null;
  return {
    lineupStatus: normalizeLineupStatus(member.lineup_status),
    accountType: normalizeAccountType(member.account_type),
    igHandle: member.ig_handle?.trim() || null,
    followers: member.followers ?? null,
    expectedViews,
    medianViews: member.median_views ?? null,
    viewsLow: member.views_low ?? null,
    viewsHigh: member.views_high ?? null,
    tier: resolveTier(expectedViews, member.tier),
    contentDirection: member.content_direction?.trim() || null,
  };
}

function isUsableBoard(board: BoardRow): boolean {
  if (board.is_active === false) return false;
  return !board.expires_at || new Date(board.expires_at).getTime() >= Date.now();
}

async function buildBoardView(
  board: BoardRow,
  reviewAuthorized: boolean,
): Promise<BoardView | null> {
  if (!isUsableBoard(board)) return null;

  const admin = createAdminClient();
  const rawSettings = (board.settings ?? {}) as BoardSettings;
  const settings: BoardSettings = rawSettings;
  const candidateStatuses = normalizeCandidateStatuses(
    settings.clientReview?.candidateStatuses,
  );
  const applySelectedAs =
    settings.clientReview?.applySelectedAs === "confirmed"
      ? "confirmed"
      : "accepted";

  const [{ data: membersData }, { data: project }] = await Promise.all([
    admin
      .from("casting_board_members")
      .select(
        "id, dancer_id, application_id, sort_order, display_name, korean_name, gender, height_cm, client_decision, client_decided_at, client_decided_by, lineup_status, account_type, ig_handle, photo_url, followers, expected_views, median_views, views_low, views_high, tier, content_direction",
      )
      .eq("board_id", board.id)
      .order("sort_order", { ascending: true }),
    admin.from("projects").select("title").eq("id", board.project_id).maybeSingle(),
  ]);
  const members = (membersData ?? []) as MemberRow[];

  const applicationIds = Array.from(
    new Set(
      members
        .map((member) => member.application_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const { data: applicationData } = applicationIds.length
    ? await admin
        .from("applications")
        .select(
          "id, status, confirmed_at, birth_year, height_cm, primary_genre, dance_video_url, backup_dancer_history, personal_profile_url",
        )
        .eq("project_id", board.project_id)
        .in("id", applicationIds)
        .is("archived_at", null)
    : { data: [] };
  const applications = (applicationData ?? []) as ApplicationRow[];
  const applicationById = new Map(applications.map((app) => [app.id, app]));

  // 짧은 공개 /cast 링크에는 수락자와 레거시 멤버만 남긴다.
  // 대기자는 강한 서명 토큰을 검증한 /review 링크에서만 직렬화한다.
  const forecastSettings = normalizeForecastSettings(settings.forecast);
  const visibleMembers = members.filter((member) => {
    // 운영자가 라인업 상태를 지정한 큐레이션 멤버는 지원 상태와 무관하게 노출한다.
    const lineupStatus = normalizeLineupStatus(member.lineup_status);
    if (lineupStatus) {
      return forecastSettings.includeProposed || lineupStatus !== "proposed";
    }
    if (!member.application_id) return true;
    const application = applicationById.get(member.application_id);
    if (!application) return false;
    if (!reviewAuthorized) return application.status === "accepted";
    return applicationMatchesCandidateStatuses(
      { status: application.status, confirmedAt: application.confirmed_at },
      candidateStatuses,
    );
  });

  const deetzIds = visibleMembers
    .map((member) => member.dancer_id)
    .filter((id): id is string => Boolean(id));

  const [{ data: dancers }, { data: priv }, { data: careers }] = deetzIds.length
    ? await Promise.all([
        admin
          .from("dancers")
          .select(
            "id, stage_name, korean_name, gender, slug, profile_img, social_links",
          )
          .in("id", deetzIds),
        admin
          .from("dancer_private_info")
          .select("dancer_id, height_cm")
          .in("dancer_id", deetzIds),
        admin
          .from("careers")
          .select(
            "dancer_id, title, is_representative, sort_order, date, is_public",
          )
          .in("dancer_id", deetzIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const heightOf = new Map<string, number | null>();
  for (const row of (priv ?? []) as Array<{
    dancer_id: string;
    height_cm: number | null;
  }>) {
    heightOf.set(row.dancer_id, row.height_cm);
  }

  const careerOf = new Map<string, string>();
  const careerRows = ((careers ?? []) as Array<{
    dancer_id: string;
    title: string | null;
    is_representative: boolean | null;
    sort_order: number | null;
    date: string | null;
    is_public: boolean | null;
  }>).filter((career) => career.is_public !== false && career.title);
  careerRows.sort(
    (a, b) =>
      Number(b.is_representative) - Number(a.is_representative) ||
      (a.sort_order ?? 9999) - (b.sort_order ?? 9999) ||
      String(b.date ?? "").localeCompare(String(a.date ?? "")),
  );
  for (const career of careerRows) {
    if (!careerOf.has(career.dancer_id)) {
      careerOf.set(career.dancer_id, career.title as string);
    }
  }

  const liveById = new Map<
    string,
    {
      stage_name: string | null;
      korean_name: string | null;
      gender: string | null;
      slug: string | null;
      profile_img: string | null;
      social_links: { instagram?: string } | null;
    }
  >();
  for (const dancer of (dancers ?? []) as Array<{
    id: string;
    stage_name: string | null;
    korean_name: string | null;
    gender: string | null;
    slug: string | null;
    profile_img: string | null;
    social_links: { instagram?: string } | null;
  }>) {
    liveById.set(dancer.id, dancer);
  }

  const entries: BoardCard[] = visibleMembers.map((member) => {
    const live = member.dancer_id ? liveById.get(member.dancer_id) : undefined;
    const application = member.application_id
      ? applicationById.get(member.application_id)
      : null;
    const reviewFields = reviewAuthorized
      ? {
          clientDecision: member.client_decision ?? "undecided",
          clientDecidedAt: member.client_decided_at,
          clientDecidedBy: member.client_decided_by,
        }
      : {};
    if (live) {
      return {
        memberId: member.id,
        dancerId: member.dancer_id as string,
        applicationId: member.application_id,
        applicationStatus: application?.status ?? null,
        confirmedAt: application?.confirmed_at ?? null,
        name:
          live.stage_name ||
          live.korean_name ||
          member.display_name ||
          "(이름 없음)",
        koreanName: live.korean_name ?? member.korean_name,
        gender: live.gender ?? member.gender,
        height:
          application?.height_cm ??
          heightOf.get(member.dancer_id as string) ??
          member.height_cm ??
          null,
        // 보드 전용 사진(photo_url)이 있으면 댄서 프로필 사진보다 우선한다(운영자 교체용).
        photo:
          member.photo_url?.trim() ||
          (live.profile_img && live.profile_img.trim() ? live.profile_img : null),
        instagram: instaUrl(
          live.social_links?.instagram ?? member.ig_handle ?? null,
        ),
        career:
          application?.backup_dancer_history ??
          careerOf.get(member.dancer_id as string) ??
          null,
        slug: live.slug,
        birthYear: application?.birth_year ?? null,
        primaryGenre: application?.primary_genre ?? null,
        danceVideoUrl: application?.dance_video_url ?? null,
        backupDancerHistory: application?.backup_dancer_history ?? null,
        personalProfileUrl: application?.personal_profile_url ?? null,
        ...lineupFieldsOf(member),
        ...reviewFields,
      };
    }
    return {
      memberId: member.id,
      dancerId: member.dancer_id ?? `ext-${member.id}`,
      applicationId: member.application_id,
      applicationStatus: application?.status ?? null,
      confirmedAt: application?.confirmed_at ?? null,
      name: member.display_name || "(이름 없음)",
      koreanName: member.korean_name,
      gender: member.gender,
      height: member.height_cm ?? null,
      photo: member.photo_url?.trim() || null,
      instagram: instaUrl(member.ig_handle ?? null),
      career: null,
      slug: null,
      birthYear: application?.birth_year ?? null,
      primaryGenre: application?.primary_genre ?? null,
      danceVideoUrl: application?.dance_video_url ?? null,
      backupDancerHistory: application?.backup_dancer_history ?? null,
      personalProfileUrl: application?.personal_profile_url ?? null,
      ...lineupFieldsOf(member),
      ...reviewFields,
    };
  });

  let filtered = entries;
  if (settings.genders?.length) {
    filtered = filtered.filter(
      (card) => card.gender && settings.genders!.includes(card.gender),
    );
  }
  if (settings.minHeight != null) {
    filtered = filtered.filter(
      (card) =>
        (card.height ?? 0) >= settings.minHeight! || card.gender === "male",
    );
  }

  const cards = filtered.slice().sort((a, b) => {
    if (settings.sortBy === "expectedViews") {
      // 기대조회 내림차순(미측정은 뒤로) → 팔로워 내림차순 → 이름.
      const viewOrder = (b.expectedViews ?? -1) - (a.expectedViews ?? -1);
      if (viewOrder !== 0) return viewOrder;
      const followerOrder = (b.followers ?? -1) - (a.followers ?? -1);
      if (followerOrder !== 0) return followerOrder;
      return a.name.localeCompare(b.name, "ko");
    }
    const photoOrder = Number(Boolean(b.photo)) - Number(Boolean(a.photo));
    if (photoOrder !== 0) return photoOrder;
    return (
      (b.height ?? -1) - (a.height ?? -1) ||
      a.name.localeCompare(b.name, "ko")
    );
  });

  const reviewCounts: Record<ClientDecision, number> = {
    undecided: 0,
    selected: 0,
    hold: 0,
    excluded: 0,
  };
  if (reviewAuthorized) {
    for (const card of cards) {
      reviewCounts[card.clientDecision ?? "undecided"] += 1;
    }
  }

  return {
    id: board.id,
    projectId: board.project_id,
    title: board.title ?? (project?.title as string | null) ?? null,
    shareCode: board.share_code,
    settings,
    notes: resolveNotes(settings),
    forecast: forecastSettings.enabled
      ? buildForecastSummary(
          cards.map((card) => ({
            lineupStatus: card.lineupStatus,
            followers: card.followers,
            expectedViews: card.expectedViews,
            tier: card.tier,
          })),
          forecastSettings,
        )
      : null,
    cards,
    counts: {
      total: cards.length,
      male: cards.filter((card) => card.gender === "male").length,
      female: cards.filter((card) => card.gender === "female").length,
      withPhoto: cards.filter((card) => card.photo).length,
    },
    review: {
      authorized: reviewAuthorized,
      enabled: settings.clientReview?.enabled === true,
      candidateStatuses,
      applySelectedAs,
      submittedAt: board.review_submitted_at,
      submittedBy: board.review_submitted_by,
      counts: reviewCounts,
    },
  };
}

/** 짧은 공개 링크 조회. 대기자와 검토 결과는 반환하지 않는다. */
export async function getCastingBoardByCode(
  code: string,
): Promise<BoardView | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("casting_boards")
    .select(
      "id, project_id, title, share_code, settings, is_active, expires_at, review_token_version, review_submitted_at, review_submitted_by",
    )
    .eq("share_code", code)
    .maybeSingle();
  if (!data) return null;
  return buildBoardView(data as BoardRow, false);
}

/** 서명 토큰 링크 조회. 토큰 버전·활성·만료·검토 허용을 모두 확인한다. */
export async function getCastingBoardByReviewToken(
  token: string,
): Promise<BoardView | null> {
  const verified = verifyCastingReviewToken(token);
  if (!verified) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("casting_boards")
    .select(
      "id, project_id, title, share_code, settings, is_active, expires_at, review_token_version, review_submitted_at, review_submitted_by",
    )
    .eq("id", verified.boardId)
    .maybeSingle();
  if (!data) return null;
  const board = data as BoardRow;
  if (
    board.review_token_version !== verified.version ||
    board.settings?.clientReview?.enabled !== true
  ) {
    return null;
  }
  return buildBoardView(board, true);
}

/**
 * 전용 검토 링크에서 한 후보의 deetz 고유 프로필을 지연 조회한다.
 * 연락처·정산·평가·비공개 댄서 정보는 반환하지 않는다.
 */
export async function getCastingReviewProfileByToken(
  token: string,
  memberId: string,
): Promise<CastingReviewProfile | null> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      memberId,
    )
  ) {
    return null;
  }

  const board = await getCastingBoardByReviewToken(token);
  const card = board?.cards.find((candidate) => candidate.memberId === memberId);
  if (!card || !/^[0-9a-f-]{36}$/i.test(card.dancerId)) return null;

  const admin = createAdminClient();
  const [{ data: dancerData }, { data: careerData }] = await Promise.all([
    admin
      .from("dancers")
      .select(
        "stage_name, korean_name, slug, profile_img, bio, location, gender, genres, specialties, portfolio_file_url, portfolio_file_name, social_links",
      )
      .eq("id", card.dancerId)
      .maybeSingle(),
    admin
      .from("careers")
      .select("id, type, title, date, details, is_representative, sort_order")
      .eq("dancer_id", card.dancerId)
      .eq("is_public", true)
      .order("is_representative", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("date", { ascending: false })
      .limit(60),
  ]);

  const dancer = dancerData as {
    stage_name: string | null;
    korean_name: string | null;
    slug: string | null;
    profile_img: string | null;
    bio: string | null;
    location: string | null;
    gender: string | null;
    genres: string[] | null;
    specialties: string[] | null;
    portfolio_file_url: string | null;
    portfolio_file_name: string | null;
    social_links: Record<string, string> | null;
  } | null;
  if (!dancer) return null;

  const careers = (
    (careerData ?? []) as Array<{
      id: number;
      type: string | null;
      title: string | null;
      date: string | null;
      details: { link?: string | null } | null;
      is_representative: boolean | null;
    }>
  ).map((career) => ({
    id: career.id,
    type: career.type,
    title: career.title,
    date: career.date,
    link: career.details?.link ?? null,
    isRepresentative: career.is_representative === true,
  }));

  return {
    name: dancer.stage_name || dancer.korean_name || card.name,
    koreanName: dancer.korean_name,
    slug: dancer.slug,
    photo: dancer.profile_img,
    bio: dancer.bio,
    location: dancer.location,
    gender: dancer.gender,
    genres: dancer.genres ?? [],
    specialties: dancer.specialties ?? [],
    portfolioFileUrl: dancer.portfolio_file_url,
    portfolioFileName: dancer.portfolio_file_name,
    socialLinks: dancer.social_links ?? {},
    careers,
  };
}
