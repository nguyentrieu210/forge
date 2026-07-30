/**
 * Returns only worktree changes that may affect a verified release.
 *
 * `server/work/` and root `tmp/` are long-lived untracked build/work directories
 * explicitly excluded from source control by the project handoff. Ignoring exactly
 * those untracked paths lets deploy guards remain useful without forcing operators
 * to delete or commit generated artifacts. Modified tracked files are never ignored.
 */
export function meaningfulGitStatus(porcelain) {
  return String(porcelain ?? "")
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !/^\?\? (?:server\/work(?:\/|$)|tmp(?:\/|$))/.test(line))
    .join("\n");
}
