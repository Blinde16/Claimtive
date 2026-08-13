// Resolving the caller's IP address from proxy headers.
//
// This value is security-relevant twice over: it keys the per-IP sign-in and
// sign-up rate limits, and it is written into the HIPAA access log, where a
// spoofable source address makes the trail worthless in an investigation.
//
// THE TRAP: `X-Forwarded-For` is append-only, and the client writes the LEFT
// end. Whatever a caller sends arrives verbatim as the leading entries, so
// `xff.split(",")[0]` is an attacker-chosen string. One host can then mint a
// fresh "IP" per request and walk straight past a 3-per-hour signup limit or a
// login lockout, and can stamp anyone else's address into the audit log.
//
// Only entries appended by infrastructure we control can be trusted, and those
// sit at the RIGHT end. Claimtive runs on Firebase App Hosting: every request
// reaches the Cloud Run container through Google's external Application Load
// Balancer (the GFE), which rewrites the header to
//
//     X-Forwarded-For: <client-supplied value>, <real client IP>, <GFE IP>
//
// — it appends exactly two entries: the peer address it actually observed, and
// its own address. The last entry is therefore Google's load balancer (the same
// for every visitor, useless as a key) and the SECOND-TO-LAST entry is the real
// client IP. That is the last untrusted hop, and the one we key on.

/**
 * How many entries the platform appends AFTER the real client address.
 * Cloud Run behind the Google front end appends one: the load balancer itself.
 */
export const PLATFORM_APPENDED_HOPS = 1;

interface HeaderLike {
  get(name: string): string | null;
}

/** Placeholder used when no address can be determined. */
export const UNKNOWN_IP = "unknown";

/**
 * Pick the client IP out of the proxy headers.
 *
 * Counts in from the right so client-supplied padding is ignored. When the
 * header is shorter than expected (local dev, or a direct request that never
 * traversed the load balancer) it degrades to the leftmost entry rather than
 * returning nothing — that is the best information available there, and in
 * those environments nothing is being defended.
 */
export function resolveClientIp(headers: HeaderLike): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    if (hops.length > 0) {
      const index = Math.max(0, hops.length - 1 - PLATFORM_APPENDED_HOPS);
      return hops[index]!;
    }
  }
  // Not set by Cloud Run; only reachable behind a proxy that sets it instead.
  const realIp = headers.get("x-real-ip")?.trim();
  return realIp || UNKNOWN_IP;
}
