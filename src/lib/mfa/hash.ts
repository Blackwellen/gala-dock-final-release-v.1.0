import "server-only";
import { createHash } from "node:crypto";

/** Recovery codes are stored only as SHA-256 hashes; input is normalised (case, separators) before hashing. */
export const hashRecoveryCode = (code: string) => createHash("sha256").update(`gd-recovery:${code.replace(/[^A-Z0-9]/gi, "").toUpperCase()}`).digest("hex");
