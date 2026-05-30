import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "../db";
import { SESSION_COOKIE, verifySession } from "./session";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  organizationName: string;
}

// Cached per request so multiple server components share one DB lookup.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySession(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { organization: true }
  });
  if (!user) return null;

  // Revocation: a session is only valid while its embedded tokenVersion matches
  // the user's current one. Bumping tokenVersion (password reset/change, logout)
  // instantly invalidates every outstanding session for that user. The app
  // layout redirects to /login when this returns null.
  if (typeof payload.tv === "number" && payload.tv !== user.tokenVersion) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
    organizationName: user.organization.name
  };
});
