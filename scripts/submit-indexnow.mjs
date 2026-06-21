import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const keyFile = process.env.INDEXNOW_KEY_FILE ?? "23320523619c423ebe08fec4e095f4c2.txt";
const endpoint = process.env.INDEXNOW_ENDPOINT ?? "https://api.indexnow.org/indexnow";
const defaultSitemaps = [
  "https://deetz.kr/sitemap.xml",
  "https://dancers.bio/dancers-sitemap.xml",
];

function argValues(name) {
  return process.argv
    .filter((arg) => arg.startsWith(`${name}=`))
    .map((arg) => arg.slice(name.length + 1))
    .filter(Boolean);
}

function decodeXmlText(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) =>
    decodeXmlText(match[1].trim()),
  );
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchSitemapUrls(sitemapUrl) {
  const response = await fetch(sitemapUrl, {
    headers: { "User-Agent": "deetz-indexnow/1.0" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${sitemapUrl}: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  return extractLocs(xml);
}

async function submitHost(host, urls, key, dryRun) {
  const keyLocation = `https://${host}/${keyFile}`;
  const batches = chunk(urls, 10000);
  const results = [];

  for (const [batchIndex, urlList] of batches.entries()) {
    const body = { host, key, keyLocation, urlList };

    if (dryRun) {
      results.push({ host, batch: batchIndex + 1, urls: urlList.length, status: "dry-run" });
      continue;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });

    results.push({
      host,
      batch: batchIndex + 1,
      urls: urlList.length,
      status: response.status,
      ok: response.ok,
      text: await response.text(),
    });
  }

  return results;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const sitemaps = argValues("--sitemap");
  const sitemapUrls = sitemaps.length > 0 ? sitemaps : defaultSitemaps;
  const key =
    process.env.INDEXNOW_KEY ??
    (await readFile(path.join(rootDir, "public", keyFile), "utf8")).trim();

  const allUrls = new Set();

  for (const sitemapUrl of sitemapUrls) {
    for (const url of await fetchSitemapUrls(sitemapUrl)) {
      allUrls.add(url);
    }
  }

  const urlsByHost = new Map();

  for (const url of allUrls) {
    const { host } = new URL(url);
    const urls = urlsByHost.get(host) ?? [];
    urls.push(url);
    urlsByHost.set(host, urls);
  }

  const results = [];

  for (const [host, urls] of urlsByHost.entries()) {
    results.push(...(await submitHost(host, urls, key, dryRun)));
  }

  console.log(
    JSON.stringify(
      {
        endpoint,
        keyFile,
        sitemaps: sitemapUrls,
        totalUrls: allUrls.size,
        hosts: Object.fromEntries(
          [...urlsByHost.entries()].map(([host, urls]) => [host, urls.length]),
        ),
        results,
      },
      null,
      2,
    ),
  );

  if (results.some((result) => result.ok === false)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
