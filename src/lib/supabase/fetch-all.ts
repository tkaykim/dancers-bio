/**
 * PostgREST(Supabase)는 `.range()`/`.limit()` 없이 조회하면 기본 최대 1,000행에서
 * 조용히 잘린다(오류 없음). 전수 집계가 필요한 관리자 화면에서 이 함정을 피하기 위해
 * 페이지 단위로 끝까지 읽어 합친다.
 *
 * 사용법:
 *   const rows = await fetchAllRows<Row>((from, to) =>
 *     supabase.from("profiles").select("id, created_at").order("id").range(from, to),
 *   );
 *
 * ⚠ 안정적인 정렬(`.order(...)`)을 반드시 포함해야 페이지 경계에서 중복·누락이 없다.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  pageSize = 1000,
  maxRows = 100_000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}
