export type PlatformCall = ((path: string, init?: RequestInit) => Promise<Response>)
  & { via: string; /** Khoá nhớ đệm danh mục theo tenant — địa chỉ gọi ngược nền tảng cấp. */ tenantKey?: string };
