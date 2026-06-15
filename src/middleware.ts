import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
  "api", "h", "onboarding", "projects", "reset-password", "s", "sr", "welcome",
]);

export async function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase();
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
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
