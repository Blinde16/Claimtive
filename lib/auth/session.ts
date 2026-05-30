import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "claimtive_session";
// 24h (was 7 days). Shorter window limits how long a leaked/stale session — or
// one belonging to a removed user — stays usable. Re-auth daily is acceptable
// for a clinic tool handling PHI.
const MAX_AGE_SECONDS = 60 * 60 * 24; // 1 day

export interface SessionPayload {
  sub: string; // user id
  orgId: string;
  email: string;
  name: string;
  role: string;
  tv: number; // tokenVersion at issue time — checked against the user row to revoke
}

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    throw new Error("AUTH_SECRET is not set");
  }
  return new TextEncoder().encode(value);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  name: SESSION_COOKIE,
  httpOnly: true,
  // "strict" so the session cookie is never sent on cross-site requests —
  // stronger CSRF protection than "lax" for an internal PHI tool.
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS
};
