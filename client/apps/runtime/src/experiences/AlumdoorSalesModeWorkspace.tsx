import { useState } from "react";
import { Button } from "@metaforge/ui";
import { AlumdoorOperationsCenter as AlumdoorDoorSalesComposer } from "./AlumdoorSalesComposer.js";
import { AlumdoorStandardSalesComposer } from "./AlumdoorStandardSalesComposer.js";

type SalesMode = "standard" | "door";

export function AlumdoorSalesModeWorkspace() {
  const [mode, setMode] = useState<SalesMode>("standard");

  return <div className="flex h-full min-h-0 w-full flex-col bg-muted/20">
    <div className="shrink-0 border-b bg-background px-3 py-2 md:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium text-muted-foreground">Kiểu bán</span>
        <Button type="button" size="sm" variant={mode === "standard" ? "default" : "outline"} onClick={() => setMode("standard")}>Hàng hóa / phụ kiện</Button>
        <Button type="button" size="sm" variant={mode === "door" ? "default" : "outline"} onClick={() => setMode("door")}>Cửa nhôm theo kích thước</Button>
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-hidden">
      {mode === "standard"
        ? <AlumdoorStandardSalesComposer />
        : <div className="h-full [&>div>div>header]:hidden"><AlumdoorDoorSalesComposer /></div>}
    </div>
  </div>;
}
