import "server-only";
import { objects, type Item } from "./observations";
export type Run = {
  id: string;
  status: string;
  defaultDatasetId: string;
  usageTotalUsd?: number;
  finishedAt?: string;
};
async function request(
  path: string,
  method = "GET",
  body?: object,
  query: Record<string, string> = {},
): Promise<unknown> {
  const token = process.env.RATE_CHECK_APIFY_TOKEN?.trim();
  if (!token) throw new Error("Apify 수집 토큰이 설정되지 않았습니다.");
  const url = new URL(`https://api.apify.com/v2/${path}`);
  url.searchParams.set("token", token);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  try {
    const response = await fetch(url, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new Error(`Apify HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    // Never propagate URLs, authenticated fetch errors or upstream response bodies.
    throw new Error(
      error instanceof Error && /^Apify HTTP \d+$/.test(error.message)
        ? error.message
        : "Apify 통신에 실패했습니다. 다시 확인해 주세요.",
    );
  }
}
function run(value: unknown): Run {
  const data = (
    value as {
      data?: Run;
    }
  )?.data;
  if (!data?.id || !data.status || !data.defaultDatasetId)
    throw new Error("Apify 실행 응답을 해석할 수 없습니다.");
  return data;
}
export async function startRun(
  actor: string,
  input: object,
  options: {
    maxTotalChargeUsd: number;
    timeoutSecs: number;
  },
): Promise<Run> {
  if (
    ![
      "apify~instagram-reel-scraper",
      "apify~instagram-profile-scraper",
    ].includes(actor) ||
    options.maxTotalChargeUsd <= 0 ||
    options.maxTotalChargeUsd > 3 ||
    options.timeoutSecs !== 600
  )
    throw new Error("Apify 실행 설정이 잘못되었습니다.");
  return run(
    await request(`acts/${actor}/runs`, "POST", input, {
      timeout: String(options.timeoutSecs),
      maxTotalChargeUsd: String(options.maxTotalChargeUsd),
    }),
  );
}
export async function getRun(runId: string): Promise<Run> {
  return run(await request(`actor-runs/${encodeURIComponent(runId)}`));
}
export async function abortRun(runId: string): Promise<void> {
  await request(`actor-runs/${encodeURIComponent(runId)}/abort`, "POST");
}
export async function readDataset(datasetId: string): Promise<Item[]> {
  const all: Item[] = [];
  for (let offset = 0; ; offset += 1000) {
    const value = await request(
      `datasets/${encodeURIComponent(datasetId)}/items`,
      "GET",
      undefined,
      {
        format: "json",
        clean: "true",
        offset: String(offset),
        limit: "1000",
      },
    );
    if (!Array.isArray(value))
      throw new Error("Apify 데이터 형식이 잘못되었습니다.");
    all.push(...objects(value));
    if (value.length < 1000) return all;
  }
}
