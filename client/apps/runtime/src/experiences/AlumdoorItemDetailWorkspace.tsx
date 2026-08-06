/** @jsxImportSource react */
import { useEffect, useState } from "react";
import { Info, Tags, X } from "lucide-react";
import { FormContainer, useMetaForge } from "@metaforge/views";
import { ItemPriceMatrixPanel } from "@metaforge/views/item-price-matrix";
import {
  Button, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@metaforge/ui";

type PurchaseHistoryRow = { date: string; supplier: string; rate: number };
type PurchaseHistoryResult = { rows?: PurchaseHistoryRow[]; latest?: PurchaseHistoryRow | null };

export interface AlumdoorItemDetailWorkspaceProps {
  name: string;
  onSaved?: () => void;
  onDeleted?: () => void;
  onDuplicate?: () => void;
  onRenamed?: (newName: string) => void;
  onPrint?: () => void;
  onClose?: () => void;
}

/**
 * Alumdoor-owned Item detail composition. Shared DoctypeWorkspace stays generic; this app registry
 * is the deliberate vertical extension seam. The Giá tab reuses the existing Item Price matrix
 * instead of creating another Item Price mutation implementation, and adds canonical purchase
 * history from the read model introduced by PR #784.
 */
export function AlumdoorItemDetailWorkspace(props: AlumdoorItemDetailWorkspaceProps) {
  const [tab, setTab] = useState<"info" | "pricing">("info");
  const [pricingMounted, setPricingMounted] = useState(false);

  const openPricing = () => {
    setPricingMounted(true);
    setTab("pricing");
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-card" data-alumdoor-item-detail-workspace>
      <div className="flex h-10 shrink-0 items-center gap-1 border-b bg-card px-2" role="tablist" aria-label="Mặt hàng">
        <Button type="button" size="sm" variant={tab === "info" ? "secondary" : "ghost"} className="h-8" onClick={() => setTab("info")} role="tab" aria-selected={tab === "info"}>
          <Info /> Thông tin
        </Button>
        <Button type="button" size="sm" variant={tab === "pricing" ? "secondary" : "ghost"} className="h-8" onClick={openPricing} role="tab" aria-selected={tab === "pricing"}>
          <Tags /> Giá
        </Button>
        {props.onClose ? (
          <Button type="button" size="icon-sm" variant="ghost" className="ml-auto" onClick={props.onClose} aria-label="Đóng mặt hàng">
            <X />
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        <div className={tab === "info" ? "h-full min-h-0" : "hidden h-full min-h-0"}>
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
        </div>
        {pricingMounted ? (
          <div className={tab === "pricing" ? "h-full min-h-0" : "hidden h-full min-h-0"}>
            <AlumdoorItemPricingTab itemCode={props.name} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AlumdoorItemPricingTab({ itemCode }: { itemCode: string }) {
  const { adapter, businessContext, fmt } = useMetaForge();
  const company = String(businessContext.company ?? "").trim();
  const contextKey = JSON.stringify(businessContext);
  const [history, setHistory] = useState<PurchaseHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    if (!company) {
      setHistory([]);
      setHistoryError("Chọn Công ty trên thanh ngữ cảnh để xem lịch sử giá mua.");
      return;
    }
    let active = true;
    setHistoryLoading(true);
    setHistoryError("");
    void adapter.callPost<PurchaseHistoryResult>("alumdoor.purchase.item_price_history", {
      ...businessContext,
      item_code: itemCode,
      limit: 50,
    }).then((result) => {
      if (active) setHistory(Array.isArray(result?.rows) ? result.rows : []);
    }).catch((error) => {
      if (active) {
        setHistory([]);
        setHistoryError(adapter.mapError(error).message);
      }
    }).finally(() => {
      if (active) setHistoryLoading(false);
    });
    return () => { active = false; };
    // Business Context identity is normalized so provider object identity cannot loop the read model.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, company, contextKey, itemCode]);

  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(22rem,1fr)_minmax(12rem,32%)] overflow-hidden bg-background" data-alumdoor-item-pricing-tab>
      <div className="min-h-0 border-b">
        <ItemPriceMatrixPanel
          adapter={adapter}
          initialItemCode={itemCode}
          itemLocked
          onChanged={() => undefined}
        />
      </div>

      <section className="min-h-0 overflow-auto bg-card" aria-label="Lịch sử giá mua">
        <div className="sticky top-0 z-10 border-b bg-card px-4 py-2.5">
          <h2 className="text-sm font-semibold">Lịch sử giá mua</h2>
          <p className="text-xs text-muted-foreground">Đọc từ giao dịch mua đã xác nhận; không ghi đè đơn giá bán hoặc đơn giá mua hiện tại.</p>
        </div>
        {historyLoading ? <div className="p-4"><Skeleton className="h-24" /></div> : historyError ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">{historyError}</div>
        ) : history.length ? (
          <Table>
            <TableHeader><TableRow><TableHead>Ngày mua</TableHead><TableHead>Nhà cung cấp</TableHead><TableHead className="text-right">Đơn giá</TableHead></TableRow></TableHeader>
            <TableBody>{history.map((row, index) => (
              <TableRow key={`${row.date}:${row.supplier}:${row.rate}:${index}`}>
                <TableCell className="whitespace-nowrap">{row.date}</TableCell>
                <TableCell>{row.supplier}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{fmt.number(Number(row.rate), 0)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        ) : <div className="px-4 py-6 text-sm text-muted-foreground">Chưa có lịch sử mua mặt hàng này.</div>}
      </section>
    </div>
  );
}
