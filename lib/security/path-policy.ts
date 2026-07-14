import fs from "node:fs";
import path from "node:path";

export function isPathInsideRoot(candidate: string, approvedRoot: string) {
  const root = path.resolve(approvedRoot);
  const target = path.resolve(candidate);
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function assertPathInsideRoot(candidate: string, approvedRoot: string) {
  if (!isPathInsideRoot(candidate, approvedRoot)) throw new Error("Output path is outside the approved root.");
  const canonicalRoot = fs.realpathSync.native(path.resolve(approvedRoot));
  const canonicalTarget = fs.realpathSync.native(path.resolve(candidate));
  if (!isPathInsideRoot(canonicalTarget, canonicalRoot)) throw new Error("Output path is outside the approved root.");
  return canonicalTarget;
}