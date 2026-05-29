import bcrypt from "bcryptjs";

// Cost factor 12 (~250ms/hash) — meaningfully harder to brute-force than the
// previous 10 while staying acceptable for interactive login. Existing hashes
// at cost 10 still verify; they upgrade naturally on the next password change.
const BCRYPT_COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
