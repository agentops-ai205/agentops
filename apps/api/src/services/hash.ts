import { createHash } from "node:crypto";

export function sha256(input: string) {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}
