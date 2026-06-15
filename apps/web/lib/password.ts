/**
 * Password hashing using Node's built-in scrypt — no external dependency.
 * Format: "scrypt$<N>$<saltHex>$<hashHex>".
 */
import {
  randomBytes,
  scrypt as _scrypt,
  type ScryptOptions,
  timingSafeEqual,
} from "node:crypto";

function scrypt(
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    _scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

const KEYLEN = 64;
const COST = 16384; // N

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password.normalize("NFKC"), salt, KEYLEN, {
    N: COST,
  })) as Buffer;
  return `scrypt$${COST}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const cost = Number(parts[1]);
  const salt = Buffer.from(parts[2] ?? "", "hex");
  const expected = Buffer.from(parts[3] ?? "", "hex");
  if (!Number.isFinite(cost) || salt.length === 0 || expected.length === 0) {
    return false;
  }
  const derived = (await scrypt(password.normalize("NFKC"), salt, expected.length, {
    N: cost,
  })) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
