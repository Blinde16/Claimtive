import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "./lib/auth/session";

// Every route in the app/(app) route group. Keep this list, the matcher at the
// bottom, and the contents of app/(app)/ in sync — the three drifted apart
// before (/risk and /integrations shipped without ever being listed here).
// The (app) layout redirects unauthenticated users on its own, so a gap here
// is not an exposure; it just means the redirect costs a render instead of
// happening at the edge.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/claims",
  "/assistant",
  "/uploads",
  "/contracts",
  "/team",
  "/account",
  "/audit",
  "/risk",
  "/integrations",
  "/how-it-works"
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (!isProtected) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Must mirror PROTECTED_PREFIXES above. Next.js requires these to be literals
// so they can be statically analysed at build time, so it cannot be derived
// from the array — hence the comment on both lists.
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/claims/:path*",
    "/assistant/:path*",
    "/uploads/:path*",
    "/contracts/:path*",
    "/team/:path*",
    "/account/:path*",
    "/audit/:path*",
    "/risk/:path*",
    "/integrations/:path*",
    "/how-it-works/:path*"
  ]
};
