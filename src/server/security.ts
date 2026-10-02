import type { Queryable } from "./db";
const encoder = new TextEncoder();
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
async function legacyPasswordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: encoder.encode(salt),
        iterations: 210000,
      },
      key,
      256,
    ),
  );
  return `${salt}:${Array.from(bytes)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")}`;
}
export async function passwordHash(db: Queryable, password: string) {
  const digest = await hash(password);
  const result = await db.query<{ value: string }>(
    "SELECT crypt($1,gen_salt('bf',12)) value",
    [digest],
  );
  return `bcrypt-sha256:${result.rows[0].value}`;
}
export async function verifyPassword(
  db: Queryable,
  password: string,
  stored?: string,
) {
  if (!stored || stored.startsWith("bcrypt-sha256:")) {
    const digest = await hash(password),
      value =
        stored?.slice("bcrypt-sha256:".length) ||
        "$2a$12$000000000000000000000u................................";
    return (
      (
        await db.query<{ valid: boolean }>("SELECT crypt($1,$2)=$2 valid", [
          digest,
          value,
        ])
      ).rows[0].valid && !!stored
    );
  }
  // Compatibility with the first local demo database; cloud setup always uses bcrypt.
  const actual = await legacyPasswordHash(password, stored.split(":")[0]);
  let difference = actual.length ^ stored.length;
  for (let i = 0; i < actual.length; i++)
    difference |= actual.charCodeAt(i) ^ (stored.charCodeAt(i) || 0);
  return difference === 0;
}
