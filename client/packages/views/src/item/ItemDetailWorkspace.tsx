/** @jsxImportSource react */
import { useState } from "react";
import { Button } from "@metaforge/ui";
import { Info, Tags, X } from "lucide-react";
import { FormContainer } from "../container/FormContainer.js";
import { ItemPricingTab } from "./ItemPricingTab.js";

export interface ItemDetailWorkspaceProps {
  name: string;
  onSaved?: () => void;
  onDeleted?: () => void;
  onDuplicate?: () => void;
  onRenamed?: (newName: string) => void;
  onPrint?: () => void;
  onClose?: () => void;
}

/**
 * Item owns one operational extension beyond the generic document form: commercial pricing.
 * The generic FormView remains schema-driven; the Item route composes the canonical sales-price
 * editor and purchase-history read model as a sibling tab instead of hardcoding fields into it.
 */
export function ItemDetailWorkspace(props: ItemDetailWorkspaceProps) {
  const [tab, setTab] = useState<"info" | "pricing">("info");

  return (
    <div className="flex h-full min-h-0 flex-col bg-card" data-item-detail-workspace>
      <div className="flex h-10 shrink-0 items-center gap-1 border-b bg-card px-2" role="tablist" aria-label="Mặt hàng">
        <Button type="button" size="sm" variant={tab === "info" ? "secondary" : "ghost"} className="h-8" onClick={() => setTab("info")} role="tab" aria-selected={tab === "info"}>
          <Info /> Thông tin
        </Button>
        <Button type="button" size="sm" variant={tab === "pricing" ? "secondary" : "ghost"} className="h-8" onClick={() => setTab("pricing")} role="tab" aria-selected={tab === "pricing"}>
          <Tags /> Giá
        </Button>
        {tab === "pricing" && props.onClose ? (
          <Button type="button" size="icon-sm" variant="ghost" className="ml-auto" onClick={props.onClose} aria-label="Đóng mặt hàng">
            <X />
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        {tab === "info" ? (
          <FormContainer
            key={`Item/${props.name}`}
            doctype="Item"
            name={props.name}
            onSaved={props.onSaved}
            onDeleted={props.onDeleted}
            onDuplicate={props.onDuplicate}
            onRenamed={props.onRenamed}
            onPrint={props.onPrint}
            onClose={props.onClose}
          />
        ) : <ItemPricingTab itemCode={props.name} />}
      </div>
    </div>
  );
}
