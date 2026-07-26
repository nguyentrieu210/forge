/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GATEWAY_URL?: string;
  readonly VITE_REPORT_URL?: string;
  readonly VITE_TENANT_ID?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
