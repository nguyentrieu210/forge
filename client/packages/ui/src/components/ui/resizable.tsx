import * as React from "react";
import { GripVertical } from "lucide-react";
import * as ResizablePrimitive from "react-resizable-panels";
import { cn } from "../../lib/cn.js";

export const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) => (
  <ResizablePrimitive.PanelGroup className={cn("flex h-full w-full data-[panel-group-direction=vertical]:flex-col", className)} {...props} />
);

export const ResizablePanel = ResizablePrimitive.Panel;

export const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & { withHandle?: boolean }) => (
  <ResizablePrimitive.PanelResizeHandle
    className={cn(
      "relative flex w-px items-center justify-center bg-border transition-colors hover:bg-primary/40 focus-visible:outline-none data-[resize-handle-state=drag]:bg-primary/60 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full",
      className,
    )}
    {...props}
  >
    {withHandle ? (
      <div className="z-10 flex h-5 w-3 items-center justify-center rounded-sm border bg-border">
        <GripVertical className="h-3 w-3" />
      </div>
    ) : null}
  </ResizablePrimitive.PanelResizeHandle>
);
