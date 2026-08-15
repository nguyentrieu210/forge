export type PlatformCall = ((path: string, init?: RequestInit) => Promise<Response>) & { via: string };
