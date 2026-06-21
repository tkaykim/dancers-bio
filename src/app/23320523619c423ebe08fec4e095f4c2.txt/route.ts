const INDEXNOW_KEY = "23320523619c423ebe08fec4e095f4c2";

export function GET() {
  return new Response(`${INDEXNOW_KEY}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
