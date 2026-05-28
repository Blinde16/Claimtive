import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "./lib/auth/session";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/claims",
  "/assistant",
  "/uploads",
  "/contracts",
  "/team",
  "/account",
  "/audit"
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

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/claims/:path*",
    "/assistant/:path*",
    "/uploads/:path*",
    "/contracts/:path*",
    "/team/:path*",
    "/account/:path*",
    "/audit/:path*"
  ]
};
