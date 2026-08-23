import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getBrandFromHost } from "@/lib/brand";

// dancers.bio is the clean "link-in-bio" domain dancers paste into their IG
// profile. It is served by THIS same deployment (alongside deetz.kr), so we do
// NOT redirect away — we rewrite the bare slug in place to keep the address bar
// clean: dancers.bio/<slug> stays as-is and renders the /d/<slug> profile.
// Real app routes (login, feed, projects, /d, /t, assets…) pass straight through,
// so the vanity host mirrors the full app. On localhost / *.vercel.app the host
// never matches, so nothing changes.
const VANITY_HOSTS = new Set(["dancers.bio", "www.dancers.bio"]);

// Where a bare dancers.bio root (no slug) sends visitors — the deetz brand site.
const BRAND_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://deetz.kr"
).replace(/\/+$/, "");

// First path segments that are real app routes, NOT dancer slugs. A single bare
// segment outside this set is treated as a dancer slug and rewritten to /d/<slug>.
const RESERVED_FIRST_SEGMENTS = new Set([
  "admin", "applications", "me", "proposals", "verify-instagram",
  "claim", "forgot-password", "login", "signup",
  "d", "dancers", "feed", "t", "u",
  "api", "h", "onboarding", "projects", "reset-password", "s", "sr", "fr", "fit", "sz", "welcome",
  "workshops",
]);

// 원클릭 수신거부(RFC 8058)는 List-Unsubscribe 헤더의 URL 로 **POST** 가 온다.
// 그 URL 은 사람이 열 때 확인 페이지를 보여줘야 해서 page.tsx 가 차지하고 있고,
// App Router 는 한 세그먼트에 page 와 route 를 같이 둘 수 없다.
// 그래서 POST 일 때만 API 라우트로 rewrite 한다. GET 은 그대로 페이지로 간다.
const UNSUBSCRIBE_PATH = /^\/unsubscribe\/([^/]+)\/?$/;

export async function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase();

  // ⚠ 확인 페이지의 "수신거부 확인" / "다시 메일 받기" 버튼도 서버 액션이라
  //    같은 URL 로 POST 한다. 그건 next-action 헤더로 구분해 그대로 통과시킨다.
  //    (이걸 빼면 페이지 버튼이 통째로 죽는다.)
  if (request.method === "POST" && !request.headers.get("next-action")) {
    const m = UNSUBSCRIBE_PATH.exec(request.nextUrl.pathname);
    if (m) {
      const url = request.nextUrl.clone();
      url.pathname = `/api/unsubscribe/${m[1]}`;
      return NextResponse.rewrite(url);
    }
  }

  // GRIGO 화이트라벨 정산 호스트: 같은 배포를 GRIGO 브랜딩으로 서빙한다.
  // 루트만 회사 홈페이지로 보내고, 나머지 경로는 아래 Supabase 세션 갱신 흐름을
  // 그대로 태운 뒤(early return 금지) 마지막에 noindex 헤더만 붙인다.
  const isGrigoHost = getBrandFromHost(host) === "grigo";
  if (isGrigoHost) {
    const { pathname } = request.nextUrl;
    if (pathname === "/" || pathname === "") {
      return NextResponse.redirect("https://grigoent.co.kr", 307);
    }
    // PWA manifest는 GRIGO 명의로 교체(설치명·시작 URL이 deetz로 노출되는 것 방지).
    if (pathname === "/manifest.json") {
      const url = request.nextUrl.clone();
      url.pathname = "/manifest-grigo.json";
      return NextResponse.rewrite(url);
    }
  }

  if (VANITY_HOSTS.has(host)) {
    const { pathname } = request.nextUrl;
    // Bare root has no profile → send to the deetz brand site.
    if (pathname === "/" || pathname === "") {
      return NextResponse.redirect(BRAND_ORIGIN, 307);
    }
    const segments = pathname.split("/").filter(Boolean);
    const first = segments[0] ?? "";
    // Single bare segment = dancer slug (the IG-bio case): rewrite in place to
    // /d/<slug> so the clean dancers.bio/<slug> URL stays in the address bar.
    // Anything reserved, namespaced (_next), file-like (has a dot), or deeper
    // than one segment is a real app route and passes through unchanged.
    if (
      segments.length === 1 &&
      !first.includes(".") &&
      !first.startsWith("_") &&
      !RESERVED_FIRST_SEGMENTS.has(first)
    ) {
      const url = request.nextUrl.clone();
      url.pathname = `/d/${first}`;
      return NextResponse.rewrite(url);
    }
    // Fall through: serve the requested route from this same deployment.
  }

  // Expose the current pathname (incl. query) so server components / guards
  // can build a ?next=<original-url> redirect target for login.
  const fullPath = request.nextUrl.pathname + request.nextUrl.search;
  request.headers.set("x-pathname", fullPath);
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // refresh session cookie if needed
  let {
    data: { user },
  } = await supabase.auth.getUser();

  // PWA 백그라운드 복귀 race 완화: auth 쿠키는 있는데 getUser가 일시 실패하면
  // (refresh_token "Already Used" 등) 250ms 후 1회만 재시도해 세션 쿠키 갱신 기회를
  // 한 번 더 준다. 익명 요청(쿠키 없음)에는 영향 없음. ref: reference_pwa_session_push_fixes
  if (!user) {
    const hasAuthCookie = request.cookies
      .getAll()
      .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
    if (hasAuthCookie) {
      await new Promise((r) => setTimeout(r, 250));
      ({
        data: { user },
      } = await supabase.auth.getUser());
    }
  }

  // DAU/MAU 활동 기록: 로그인 사용자당 하루 1회(쿠키 스로틀)만 기록해
  // 요청마다 쓰지 않는다. touch_activity()는 멱등(on conflict do nothing).
  if (user) {
    const today = new Date().toISOString().slice(0, 10);
    if (request.cookies.get("da")?.value !== today) {
      try {
        await supabase.rpc("touch_activity", { _source: "web" });
      } catch {
        // 활동 기록 실패가 요청을 막지 않도록 무시(best-effort).
      }
      response.cookies.set("da", today, {
        path: "/",
        maxAge: 86_400,
        httpOnly: true,
        sameSite: "lax",
      });
    }
  }

  // Supabase setAll 콜백이 response 객체를 갈아끼우므로, noindex 헤더는
  // 반드시 최종 response에 마지막으로 붙인다 (검색 중복 노출 방지).
  if (isGrigoHost) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
