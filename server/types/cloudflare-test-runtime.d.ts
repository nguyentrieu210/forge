declare module "cloudflare:workers" {
  export const env: Record<string, any> & { DB: D1Database; TEST_MIGRATIONS: unknown };
  export const exports: { default: { fetch(request: Request): Promise<Response> } };
}

declare module "cloudflare:test" {
  export function applyD1Migrations(database: D1Database, migrations: unknown): Promise<void>;
}

declare module "vitest" {
  export function beforeAll(callback: () => void | Promise<void>): void;
  export function describe(name: string, callback: () => void): void;
  export function it(name: string, callback: () => void | Promise<void>): void;
  export function expect(value: unknown): any;
}

declare module "@cloudflare/vitest-pool-workers" {
  export function cloudflareTest(config: unknown): unknown;
  export function readD1Migrations(path: string): Promise<unknown>;
}

declare module "vitest/config" {
  export function defineConfig(config: unknown): unknown;
}

declare module "node:path" {
  const path: { dirname(value: string): string; join(...parts: string[]): string };
  export default path;
}

declare module "node:url" {
  export function fileURLToPath(value: string | URL): string;
}
