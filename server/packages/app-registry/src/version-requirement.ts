import { errors } from "../../core/src/index.js";

const MINIMUM_VERSION = /^(?:>=)?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export interface MinimumVersionRequirement {
  minimum: string;
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

function parseVersion(value: string, label: string): MinimumVersionRequirement {
  const text = value.trim();
  const match = MINIMUM_VERSION.exec(text);
  if (!match) {
    throw errors.validation(`${label} must be a semantic version or >= semantic version`);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every(Number.isSafeInteger)) {
    throw errors.validation(`${label} contains an invalid semantic version`);
  }
  const prerelease = match[4] ?? null;
  return {
    minimum: `${major}.${minor}.${patch}${prerelease ? `-${prerelease}` : ""}`,
    major,
    minor,
    patch,
    prerelease,
  };
}

export function parseMinimumVersionRequirement(required: string): MinimumVersionRequirement {
  return parseVersion(required, "Package version requirement");
}

function comparePrerelease(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const l = left.split(".");
  const r = right.split(".");
  const length = Math.max(l.length, r.length);
  for (let index = 0; index < length; index += 1) {
    const lv = l[index];
    const rv = r[index];
    if (lv === rv) continue;
    if (lv === undefined) return -1;
    if (rv === undefined) return 1;
    const ln = /^\d+$/.test(lv) ? Number(lv) : null;
    const rn = /^\d+$/.test(rv) ? Number(rv) : null;
    if (ln !== null && rn !== null) return ln < rn ? -1 : 1;
    if (ln !== null) return -1;
    if (rn !== null) return 1;
    return lv < rv ? -1 : 1;
  }
  return 0;
}

export function compareSemanticVersions(left: string, right: string): number {
  const a = parseVersion(left, "Installed package version");
  const b = parseVersion(right, "Required package version");
  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] < b[key]) return -1;
    if (a[key] > b[key]) return 1;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

export function satisfiesMinimumVersionRequirement(installed: string, required: string): boolean {
  const minimum = parseMinimumVersionRequirement(required);
  return compareSemanticVersions(installed, minimum.minimum) >= 0;
}
