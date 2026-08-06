import type { Doc } from "@metaforge/core";

declare module "@metaforge/adapter-frappe" {
  interface FrappeAdapter {
    updateDoc(dt: string, name: string, doc: Partial<Doc>): Promise<Doc>;
    submit(dt: string, name: string): Promise<Doc>;
  }
}

export {};
