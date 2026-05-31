import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Canonical app host. Everything is served from here; dancers.bio is only a
// vanity domain that forwards into it.
const CANONICAL_ORIGIN = "https://deetz.kr";
// dancers.bio is the clean vanity domain dancers paste into their IG bio.
// It does not serve the app — it forwards to the canonical profile route:
//   dancers.bio/<slug>  ->  https://deetz.kr/d/<slug>
//   dancers.bio/        ->  https://deetz.kr
// Activates automatically once dancers.bio points at this deployment; on
// localhost / *.vercel.app the host never matches, so nothing changes.
const VANITY_HOSTS = new Set(["dancers.bio", "www.dancers.bio"]);

export async function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  if (VANITY_HOSTS.has(host)) {
    const { pathname, search } = request.nextUrl;
    const target = new URL(CANONICAL_ORIGIN);
    if (pathname !== "/" && pathname !== "") {
      // Profile/canonical paths pass through untouched; a bare first segment
      // is treated as a dancer slug (the common IG-bio case).
      target.pathname =
        pathname.startsWith("/d/") || pathname.startsWith("/t/")
          ? pathname
          : `/d${pathname}`;
    }
    target.search = search;
    // 307 (temporary) on purpose: keeps the door open to upgrade this to a
    // rewrite later without browsers having cached a permanent redirect.
    return NextResponse.redirect(target, 307);
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
