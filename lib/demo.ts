// Demo-mode helpers. SERVER ONLY — never import this from a client component,
// or the demo address ends up in the browser bundle.
//
// Two independent switches exist, and they mean different things:
//
//   DEMO_ENABLED              (server, runtime)  — may the demo account sign in
//                                                  at all? Default-closed.
//   NEXT_PUBLIC_DEMO_ENABLED  (client, build)    — may the login form pre-fill
//                                                  the demo credentials? Read
//                                                  directly in the components
//                                                  so a production build folds
//                                                  the branch away entirely.
//
// The public flag never grants access; the server flag is the only gate.

/** The seeded demo account (see prisma/seed.ts). */
export const DEMO_EMAIL = "demo@claimtive.com";

/** Is the shared demo account allowed to sign in on this deployment? */
export function isDemoEnabled(): boolean {
  return process.env.DEMO_ENABLED === "true";
}

/** Is this the shared demo account? Comparison is case-insensitive. */
export function isDemoAccount(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === DEMO_EMAIL;
}

export const DEMO_WRITE_BLOCKED_MESSAGE =
  "This is the shared read-only demo account. Sign up for your own workspace to make changes.";

/**
 * Sandbox for the shared demo account.
 *
 * The demo user is a real OWNER of a real organization, and its password is
 * known to everyone who has ever seen the demo. Without this guard any visitor
 * could change that password (locking everyone else out), enrol MFA (locking
 * it out permanently), add or delete team members, or upload arbitrary files
 * into the demo tenant. Reads stay open — exploring the workspace IS the demo.
 *
 * Returns an action-state object to return verbatim, or null when the caller is
 * a normal user:
 *
 *   const denied = denyDemoWrite(user);
 *   if (denied) return denied;
 *
 * It deliberately does NOT throw: every call site is a Server Action whose
 * result is rendered as inline form feedback, and a thrown error would surface
 * as an opaque "something went wrong" instead of an explanation.
 *
 * Deliberately NOT guarded, so the demo still demonstrates something:
 *   - claims worklist edits (app/actions/claims.ts) — scoped to the demo org's
 *     own synthetic rows, and re-running the seed resets them;
 *   - the assistant and appeal drafter, which spend Vertex quota. If demo
 *     traffic ever becomes a cost or abuse problem, rate-limit those per IP
 *     rather than blocking them — they are the product.
 */
export function denyDemoWrite(user: {
  email: string;
}): { error: string } | null {
  return isDemoAccount(user.email)
    ? { error: DEMO_WRITE_BLOCKED_MESSAGE }
    : null;
}
