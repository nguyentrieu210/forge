import type { DocFieldMeta, DocTypeKind } from "./types.js";
import type { MatrixViewPolicy } from "./matrix-types.js";

declare module "./matrix-validate.js" {
  export function parseMatrixViewPolicy(
    value: unknown,
    context: {
      name: string;
      kind: DocTypeKind | undefined;
      isChild: boolean;
      isTree: boolean;
      isSingle: boolean;
      isSubmittable: boolean;
      fields: DocFieldMeta[];
    },
  ): MatrixViewPolicy;
}

export {};
