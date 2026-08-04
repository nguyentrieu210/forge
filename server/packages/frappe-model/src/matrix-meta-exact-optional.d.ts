import type { DocTypeKind } from "./types.js";

declare module "./matrix-validate.js" {
  interface MatrixMetaContext {
    kind?: DocTypeKind | undefined;
  }
}

export {};
