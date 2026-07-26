
declare module "cloudflare:workers" {
  export class DurableObject<Env = unknown> {
    protected readonly ctx: DurableObjectState;
    protected readonly env: Env;
    constructor(ctx: DurableObjectState, env: Env);
  }
}

declare interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

declare interface DurableObjectId {
  toString(): string;
}

declare interface DurableObjectState {
  readonly id: DurableObjectId;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}

declare interface DurableObjectStub {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

declare interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
  getByName(name: string): DurableObjectStub;
}

declare interface D1Result<T = Record<string, unknown>> {
  success: boolean;
  results?: T[];
  meta?: { changes?: number; last_row_id?: number; rows_read?: number; rows_written?: number };
  error?: string;
}

declare interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(): Promise<T[]>;
}

declare interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1Result>;
  withSession?(constraintOrBookmark?: string): D1DatabaseSession;
}

declare interface D1DatabaseSession extends D1Database {
  getBookmark(): string | null;
}

declare interface R2Bucket {
  put(key: string, value: string | ArrayBuffer | ReadableStream, options?: unknown): Promise<unknown>;
  get(key: string): Promise<unknown>;
  delete(key: string): Promise<void>;
}

declare interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

declare interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

declare interface DispatchNamespace {
  get(name: string, args?: Record<string, unknown>, options?: { limits?: { cpuMs?: number; subRequests?: number }; outbound?: Fetcher }): Fetcher;
}

declare interface Queue<T = unknown> {
  send(message: T, options?: unknown): Promise<void>;
  sendBatch(messages: Array<{ body: T; contentType?: string }>): Promise<void>;
}

declare interface Message<T = unknown> {
  readonly id: string;
  readonly body: T;
  readonly attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

declare interface MessageBatch<T = unknown> {
  readonly queue: string;
  readonly messages: Message<T>[];
  ackAll(): void;
  retryAll(options?: { delaySeconds?: number }): void;
}
