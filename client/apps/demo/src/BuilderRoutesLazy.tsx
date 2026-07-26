import { lazy, Suspense } from "react";
import type { DocTypeMeta } from "@metaforge/core";
import type { FieldServices, ControlRegistry } from "@metaforge/controls";

const Lazy = lazy(() => import("./BuilderRoutes.js"));

export interface BuilderRoutesProps {
  which: string;
  taskMeta: DocTypeMeta;
  registry: ControlRegistry;
  services: FieldServices;
}

/** Lazy wrapper — builder chunk (reactflow/react-grid-layout/dnd-kit) tách khỏi bundle chính. */
export function BuilderRoutes(props: BuilderRoutesProps) {
  return (
    <Suspense fallback={<div className="p-4 text-muted-foreground">Đang tải builder…</div>}>
      <Lazy {...props} />
    </Suspense>
  );
}
