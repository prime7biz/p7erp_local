import crypto from "crypto";

let devSecret: string | null = null;

export function getJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET missing");
    if (!devSecret) {
      devSecret = crypto.randomBytes(32).toString("hex");
    }
    return devSecret;
  }
  return s;
}
