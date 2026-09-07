import { normalizeInstagramHandle, parseReelUrl } from "../instagram/handle";
export type ImportPost = {
  short_code: string;
  post_url: string;
  owner_handle: string | null;
  display_name: string | null;
  collab_handles: string[];
};
function csvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("CSV 따옴표가 닫히지 않았습니다.");
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
export function parsePostsInput(input: string, csv = false): ImportPost[] {
  if (input.length > 500000) throw new Error("입력은 500KB까지 허용됩니다.");
  let entries: {
    url: string;
    handle: string;
    name: string;
    collabs: string;
  }[];
  if (csv) {
    const [header, ...rows] = csvRows(input.replace(/^\uFEFF/, ""));
    const keys = header?.map((v) => v.trim()) ?? [];
    if (!keys.includes("post_url"))
      throw new Error("CSV에 post_url 열이 필요합니다.");
    entries = rows.map((row) => {
      const get = (key: string) => row[keys.indexOf(key)]?.trim() ?? "";
      return {
        url: get("post_url"),
        handle: get("handle"),
        name: get("display_name"),
        collabs: get("collab_handles"),
      };
    });
  } else
    entries = input
      .split(/\r?\n/)
      .filter((v) => v.trim())
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        return {
          url: parts[parts.length - 1],
          handle: parts.length === 2 ? parts[0] : "",
          name: "",
          collabs: "",
        };
      });
  if (!entries.length || entries.length > 300)
    throw new Error("한 번에 1–300개 게시물을 입력해 주세요.");
  const seen = new Set<string>();
  return entries.map((e, i) => {
    const parsed = parseReelUrl(e.url);
    if (!parsed)
      throw new Error(`${i + 1}행의 Instagram 게시물 URL을 확인해 주세요.`);
    if (seen.has(parsed.shortCode))
      throw new Error(`${i + 1}행의 shortcode가 중복됩니다.`);
    seen.add(parsed.shortCode);
    const handle = normalizeInstagramHandle(e.handle);
    if (e.handle && !handle)
      throw new Error(`${i + 1}행의 핸들을 확인해 주세요.`);
    const collabs = e.collabs
      .split(";")
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => {
        const h = normalizeInstagramHandle(v);
        if (!h) throw new Error(`${i + 1}행의 공동작업 핸들을 확인해 주세요.`);
        return h;
      });
    return {
      short_code: parsed.shortCode,
      post_url: parsed.url,
      owner_handle: handle,
      display_name: e.name.slice(0, 100) || null,
      collab_handles: [...new Set(collabs)].filter((h) => h !== handle),
    };
  });
}
