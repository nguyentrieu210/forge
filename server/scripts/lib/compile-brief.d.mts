/**
 * Types for the brief compiler, which is authored in plain `.mjs`.
 *
 * The compiler runs as a script, so it has never needed types. It is now also imported by
 * the worker test suites — a test that compiles the REAL brief is the only kind that can
 * prove the shipped file installs — and `typecheck:workers` treats an untyped import as
 * an error rather than as `any`. Declared here rather than by rewriting the compiler in
 * TypeScript, because the script is executed directly by `node` and a build step between
 * `forge-app.mjs` and its own library would be a new way for the two to fall out of step.
 */

/** The compiled app manifest, as the server's `parseAppManifest` will read it. */
export function compileBrief(brief: unknown): Record<string, unknown>;

export function parseField(input: unknown, index: number, context: string): Record<string, unknown>;
export function parsePermission(role: string, letters: string, context: string): Record<string, unknown>;
export function compileWorkflow(
  doctypeName: string,
  brief: unknown,
  declaredRoles: Set<string>,
  context: string,
): Record<string, unknown>;

export class BriefError extends Error {}
