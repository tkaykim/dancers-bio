import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// 클라이언트 공유 캐스팅 보드의 안전 데이터(전화 등 민감정보 제외).
export type BoardCard = {
  dancerId: string;
  name: string;
  koreanName: string | null;
  gender: "male" | "female" | string | null;
  height: number | null;
  photo: string | null;
  instagram: string | null; // 정규화된 URL
  career: string | null;
  slug: string | null;
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
  rows: BoardRateRow[];
};

export type BoardSettings = {
  genderPriority?: "male" | "female" | null;
  sortBy?: "height" | "manual";
  requirePhoto?: boolean;
  genders?: string[];
  minHeight?: number | null;
  fields?: { height?: boolean; instagram?: boolean; career?: boolean };
  note?: string | null; // (레거시) 단일 참고사항 — notes로 대체됨
  notes?: string[]; // 클라이언트에게 보여줄 참고사항/공지 목록 (헤더 아래 표시)
  rateTable?: BoardRateTable | null; // 클라이언트 제안서용 후보별 단가표
};

export type BoardView = {
  id: string;
  projectId: string;
  title: string | null;
  shareCode: string;
  settings: BoardSettings;
  notes: string[]; // settings.notes(없으면 레거시 note) 노출
  cards: BoardCard[]; // 전체 (사진 있는 인원 먼저, 사진 없는 인원 뒤)
  counts: { total: number; male: number; female: number; withPhoto: number };
};

// 공지 목록 정규화: notes 우선, 없으면 레거시 단일 note 폴백. 빈 문자열 제거.
function resolveNotes(s: BoardSettings): string[] {
  const list = Array.isArray(s.notes) && s.notes.length ? s.notes : s.note ? [s.note] : [];
  return list.map((n) => (n ?? "").trim()).filter(Boolean);
}

function instaUrl(v: string | null | undefined): string | null {
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return "https://www.instagram.com/" + v.replace(/^@/, "");
}

/** share_code로 보드 조회(활성·미만료). 미존재/만료 시 null. service-role 사용(공개 라우트). */
export async function getCastingBoardByCode(
  code: string,
): Promise<BoardView | null> {
  const admin = createAdminClient();

  const { data: board } = await admin
    .from("casting_boards")
    .select("id, project_id, title, share_code, settings, is_active, expires_at")
    .eq("share_code", code)
    .maybeSingle();
  if (!board || board.is_active === false) return null;
  if (board.expires_at && new Date(board.expires_at as string).getTime() < Date.now())
    return null;

  const settings = (board.settings ?? {}) as BoardSettings;

  const { data: members } = await admin
    .from("casting_board_members")
    .select("dancer_id, sort_order, display_name, korean_name, gender, height_cm")
    .eq("board_id", board.id)
    .order("sort_order", { ascending: true });

  const meta = {
    id: board.id as string,
    projectId: board.project_id as string,
    title: (board.title as string) ?? null,
    shareCode: board.share_code as string,
    settings,
    notes: resolveNotes(settings),
  };
  if (!members || members.length === 0)
    return { ...meta, cards: [], counts: { total: 0, male: 0, female: 0, withPhoto: 0 } };

  const deetzIds = (members as Array<{ dancer_id: string | null }>)
    .map((m) => m.dancer_id)
    .filter((v): v is string => !!v);

  const [{ data: dancers }, { data: priv }, { data: careers }] =
    deetzIds.length
      ? await Promise.all([
          admin.from("dancers").select("id, stage_name, korean_name, gender, slug, profile_img, social_links").in("id", deetzIds),
          admin.from("dancer_private_info").select("dancer_id, height_cm").in("dancer_id", deetzIds),
          admin.from("careers").select("dancer_id, title, is_representative, sort_order, date, is_public").in("dancer_id", deetzIds),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

  const heightOf = new Map<string, number | null>();
  for (const p of (priv ?? []) as Array<{ dancer_id: string; height_cm: number | null }>)
    heightOf.set(p.dancer_id, p.height_cm);

  const careerOf = new Map<string, string>();
  const cRows = ((careers ?? []) as Array<{
    dancer_id: string; title: string | null; is_representative: boolean | null;
    sort_order: number | null; date: string | null; is_public: boolean | null;
  }>).filter((c) => c.is_public !== false && c.title);
  cRows.sort((a, b) =>
    Number(b.is_representative) - Number(a.is_representative) ||
    (a.sort_order ?? 9999) - (b.sort_order ?? 9999) ||
    String(b.date ?? "").localeCompare(String(a.date ?? "")),
  );
  for (const c of cRows) if (!careerOf.has(c.dancer_id)) careerOf.set(c.dancer_id, c.title as string);

  const liveById = new Map<string, {
    stage_name: string | null; korean_name: string | null; gender: string | null;
    slug: string | null; profile_img: string | null; social_links: { instagram?: string } | null;
  }>();
  for (const d of (dancers ?? []) as Array<{
    id: string; stage_name: string | null; korean_name: string | null; gender: string | null;
    slug: string | null; profile_img: string | null; social_links: { instagram?: string } | null;
  }>) liveById.set(d.id, d);

  // 멤버 → 카드(라이브 우선, 없으면 스냅샷)
  const entries: BoardCard[] = (members as Array<{
    dancer_id: string | null; display_name: string | null; korean_name: string | null;
    gender: string | null; height_cm: number | null;
  }>).map((m) => {
    const live = m.dancer_id ? liveById.get(m.dancer_id) : undefined;
    if (live) {
      return {
        dancerId: m.dancer_id as string,
        name: live.stage_name || live.korean_name || m.display_name || "(이름 없음)",
        koreanName: live.korean_name ?? m.korean_name,
        gender: live.gender ?? m.gender,
        height: heightOf.get(m.dancer_id as string) ?? m.height_cm ?? null,
        photo: live.profile_img && live.profile_img.trim() ? live.profile_img : null,
        instagram: instaUrl(live.social_links?.instagram ?? null),
        career: careerOf.get(m.dancer_id as string) ?? null,
        slug: live.slug,
      };
    }
    // 외부(비-deetz) 스냅샷
    return {
      dancerId: m.dancer_id ?? `ext-${m.display_name ?? Math.random()}`,
      name: m.display_name || "(이름 없음)",
      koreanName: m.korean_name,
      gender: m.gender,
      height: m.height_cm ?? null,
      photo: null,
      instagram: null,
      career: null,
      slug: null,
    };
  });

  // 성별·키 필터(드롭). 사진 유무는 카드/리스트 분리에만 사용(드롭 안 함).
  let filtered = entries;
  if (settings.genders && settings.genders.length)
    filtered = filtered.filter((c) => c.gender && settings.genders!.includes(c.gender));
  if (settings.minHeight != null)
    filtered = filtered.filter((c) => (c.height ?? 0) >= settings.minHeight! || c.gender === "male");

  // 사진 있는 인원 먼저(키 내림차순) → 사진 없는 인원 뒤로(키 내림차순/이름).
  const cards = filtered.slice().sort((a, b) => {
    const ap = a.photo ? 0 : 1;
    const bp = b.photo ? 0 : 1;
    if (ap !== bp) return ap - bp;
    if (a.photo) return (b.height ?? -1) - (a.height ?? -1);
    return (b.height ?? -1) - (a.height ?? -1) || (a.name || "").localeCompare(b.name || "");
  });

  const counts = {
    total: cards.length,
    male: cards.filter((c) => c.gender === "male").length,
    female: cards.filter((c) => c.gender === "female").length,
    withPhoto: cards.filter((c) => c.photo).length,
  };

  return { ...meta, cards, counts };
}
