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

export type BoardSettings = {
  genderPriority?: "male" | "female" | null;
  sortBy?: "height" | "manual";
  requirePhoto?: boolean;
  genders?: string[];
  minHeight?: number | null;
  fields?: { height?: boolean; instagram?: boolean; career?: boolean };
};

export type BoardView = {
  id: string;
  projectId: string;
  title: string | null;
  shareCode: string;
  settings: BoardSettings;
  cards: BoardCard[];
  counts: { total: number; male: number; female: number };
};

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
    .select("dancer_id, sort_order")
    .eq("board_id", board.id)
    .order("sort_order", { ascending: true });
  const ids = (members ?? []).map((m) => m.dancer_id as string);
  if (ids.length === 0)
    return {
      id: board.id as string,
      projectId: board.project_id as string,
      title: (board.title as string) ?? null,
      shareCode: board.share_code as string,
      settings,
      cards: [],
      counts: { total: 0, male: 0, female: 0 },
    };

  const [{ data: dancers }, { data: priv }, { data: careers }] = await Promise.all([
    admin.from("dancers").select("id, stage_name, korean_name, gender, slug, profile_img, social_links").in("id", ids),
    admin.from("dancer_private_info").select("dancer_id, height_cm").in("dancer_id", ids),
    admin.from("careers").select("dancer_id, title, is_representative, sort_order, date, is_public").in("dancer_id", ids),
  ]);

  const heightOf = new Map<string, number | null>();
  for (const p of (priv ?? []) as Array<{ dancer_id: string; height_cm: number | null }>)
    heightOf.set(p.dancer_id, p.height_cm);

  // 댄서별 대표경력 1개 (대표 우선 → sort_order → 최신).
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

  const byId = new Map<string, BoardCard>();
  for (const d of (dancers ?? []) as Array<{
    id: string; stage_name: string | null; korean_name: string | null;
    gender: string | null; slug: string | null; profile_img: string | null;
    social_links: { instagram?: string } | null;
  }>) {
    byId.set(d.id, {
      dancerId: d.id,
      name: d.stage_name || d.korean_name || "(이름 없음)",
      koreanName: d.korean_name,
      gender: d.gender,
      height: heightOf.get(d.id) ?? null,
      photo: d.profile_img && d.profile_img.trim() ? d.profile_img : null,
      instagram: instaUrl(d.social_links?.instagram ?? null),
      career: careerOf.get(d.id) ?? null,
      slug: d.slug,
    });
  }

  // 멤버 순서(sort_order) 유지하며 카드화
  let cards = ids.map((id) => byId.get(id)).filter((c): c is BoardCard => !!c);

  // 필터: 사진 필수
  if (settings.requirePhoto !== false) cards = cards.filter((c) => c.photo);
  if (settings.genders && settings.genders.length)
    cards = cards.filter((c) => c.gender && settings.genders!.includes(c.gender));
  if (settings.minHeight != null)
    cards = cards.filter((c) => (c.height ?? 0) >= settings.minHeight!);

  // 정렬: 성별 우선 → 키 내림차순
  const gp = settings.genderPriority;
  cards.sort((a, b) => {
    if (gp) {
      const ap = a.gender === gp ? 0 : 1;
      const bp = b.gender === gp ? 0 : 1;
      if (ap !== bp) return ap - bp;
    }
    return (b.height ?? -1) - (a.height ?? -1);
  });

  const counts = {
    total: cards.length,
    male: cards.filter((c) => c.gender === "male").length,
    female: cards.filter((c) => c.gender === "female").length,
  };

  return {
    id: board.id as string,
    projectId: board.project_id as string,
    title: (board.title as string) ?? null,
    shareCode: board.share_code as string,
    settings,
    cards,
    counts,
  };
}
