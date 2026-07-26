/** @jsxImportSource react */
/**
 * ONBOARDING — hộp thoại danh sách việc cần làm, mỗi việc NHẢY SANG FORM THẬT.
 *
 * Làm đúng theo cách ERPNext làm (Module Onboarding): không tự dựng một bộ ô nhập song song với
 * form của DocType, mà liệt kê các bước và đưa người dùng tới CHÍNH form đó. Lý do quan trọng:
 * form thật đã có sẵn validate, giá trị mặc định, phân quyền, và các field bắt buộc riêng của
 * từng site. Bộ ô nhập tự dựng sẽ lệch dần khỏi form thật sau mỗi lần ERPNext nâng cấp, và tệ
 * hơn là tạo ra bản ghi thiếu field mà không ai phát hiện cho tới lúc lập chứng từ.
 *
 * Vì sao cần onboarding: site Frappe mới chưa chạy setup wizard thì thiếu hàng loạt thứ app kho
 * coi là hiển nhiên — không Công ty, không Kho, không Đơn vị tính, tiền tệ mặc định vẫn INR.
 * Người dùng mở app thấy mọi màn trống, mọi form lỗi, không có gì chỉ đường.
 * (Chính site đang chạy đã vấp đúng chuỗi này lúc nạp dữ liệu mẫu.)
 *
 * Vẫn giữ nút "tạo nhanh bộ mặc định" cho Đơn vị tính và Kho: đó là danh sách ai cũng cần và
 * giống nhau ở mọi doanh nghiệp, bắt gõ tay 10 lần là hành hạ vô ích.
 */
import { useState } from "react";
import { ArrowRight, Building2, Check, Loader2, Package, Ruler, Warehouse as WarehouseIcon, Zap } from "lucide-react";
import { useList, useMetaForge } from "@metaforge/views";
import {
  Button, Separator, cn, toast,
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@metaforge/ui";

/** Kho tối thiểu để một doanh nghiệp bắt đầu dùng được. Tên theo cách gọi của kho Việt. */
const DEFAULT_WAREHOUSES = ["Kho chính", "Kho nhận hàng", "Kho hàng lỗi"];

/** Đơn vị tính hay dùng nhất ở VN — thiếu chúng thì không khai nổi một mặt hàng. */
const DEFAULT_UOMS = ["Cái", "Chiếc", "Bộ", "Thùng", "Hộp", "Kg", "Gam", "Tấn", "Mét", "Lít"];

const SKIP_KEY = "mf-setup-skip";

export function isSetupSkipped(): boolean {
  try { return localStorage.getItem(SKIP_KEY) === "1"; } catch { return false; }
}
export function setSetupSkipped(v: boolean): void {
  try {
    if (v) localStorage.setItem(SKIP_KEY, "1");
    else localStorage.removeItem(SKIP_KEY);
  } catch { /* private mode */ }
}

/**
 * Có nên mở onboarding khi vào app không.
 *
 *  - THIẾU dữ liệu nền (không Công ty / không kho lá) ⇒ LUÔN mở, kể cả đã tắt, và không cho tắt
 *    vĩnh viễn. Không có hai thứ đó thì app không dùng được; cho bỏ qua chỉ đẩy người dùng vào
 *    một loạt màn trống và form lỗi, không còn gì chỉ đường quay lại.
 *  - Đủ dữ liệu ⇒ vẫn mở cho tới khi người dùng bấm "không hiện lần sau".
 */
export function useNeedsSetup(): { needed: boolean; loading: boolean; blocking: boolean } {
  const companiesQ = useList("Company", { fields: ["name"], pageLength: 1 });
  const warehousesQ = useList("Warehouse", { fields: ["name"], filters: { is_group: 0 }, pageLength: 1 });
  const loading = companiesQ.isLoading || warehousesQ.isLoading;
  // Không kiểm mặt hàng: kho mới lập chưa có hàng là đúng, chặn ở đó chỉ phiền vô ích.
  const blocking = !loading && ((companiesQ.data?.length ?? 0) === 0 || (warehousesQ.data?.length ?? 0) === 0);
  const needed = !loading && (blocking || !isSetupSkipped());
  return { needed, loading, blocking };
}

export function SetupWizard({ open, onOpenChange, blocking, onNavigate }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** thiếu dữ liệu nền ⇒ không cho đóng bằng Esc/bấm ra ngoài, không cho tắt vĩnh viễn. */
  blocking: boolean;
  /** điều hướng tới form thật (app cấp — engine không biết router của app). */
  onNavigate: (path: string) => void;
}) {
  const { adapter } = useMetaForge();
  const [busy, setBusy] = useState<string | null>(null);

  const companiesQ = useList("Company", { fields: ["name"], pageLength: 5 });
  const warehousesQ = useList("Warehouse", { fields: ["name"], filters: { is_group: 0 }, pageLength: 5 });
  const uomsQ = useList("UOM", { fields: ["name"], filters: { enabled: 1 }, pageLength: 20 });
  const itemsQ = useList("Item", { fields: ["name"], pageLength: 5 });

  const nCompany = companiesQ.data?.length ?? 0;
  const nWarehouse = warehousesQ.data?.length ?? 0;
  const nUom = uomsQ.data?.length ?? 0;
  const nItem = itemsQ.data?.length ?? 0;

  /** Mở form thật rồi ĐÓNG hộp thoại — không để modal che mất form vừa mở. */
  const jump = (path: string) => { onOpenChange(false); onNavigate(path); };

  /** Tạo nhanh một loạt bản ghi giống nhau. Bản đã tồn tại thì bỏ qua im lặng (chạy lại được). */
  const bulk = async (key: string, doctype: string, rows: Array<Record<string, unknown>>, refetch: () => Promise<unknown>) => {
    setBusy(key);
    let n = 0;
    try {
      for (const r of rows) {
        try { await adapter.createDoc(doctype, r); n++; } catch { /* đã có */ }
      }
      toast.success(n ? `Đã tạo ${n} bản ghi` : "Đã có đủ, không cần tạo thêm");
      await refetch();
    } catch (e) {
      toast.error(adapter.mapError(e).message);
    } finally {
      setBusy(null);
    }
  };

  const company = nCompany > 0 ? String(companiesQ.data![0]!.name) : "";

  const steps = [
    {
      key: "company",
      icon: Building2,
      title: "Công ty",
      desc: "Pháp nhân sở hữu kho. Mỗi kho thuộc đúng một công ty.",
      done: nCompany > 0,
      doneText: `${nCompany} công ty`,
      formPath: "/app/Company/new",
      // Công ty có rất nhiều field bắt buộc riêng theo từng site (tiền tệ, hệ thống tài khoản,
      // năm tài chính) — không dựng nhanh được, phải qua form thật.
      quick: undefined as undefined | { label: string; run: () => Promise<void> },
    },
    {
      key: "uom",
      icon: Ruler,
      title: "Đơn vị tính",
      desc: "Cái, thùng, kg… Thiếu thì không khai nổi một mặt hàng.",
      done: nUom > 0,
      doneText: `${nUom} đơn vị`,
      formPath: "/app/UOM/new",
      quick: {
        label: `Tạo nhanh ${DEFAULT_UOMS.length} đơn vị thường dùng`,
        run: () => bulk("uom", "UOM", DEFAULT_UOMS.map((u) => ({ uom_name: u, enabled: 1 })), uomsQ.refetch),
      },
    },
    {
      key: "warehouse",
      icon: WarehouseIcon,
      title: "Kho hàng",
      desc: "Kho LÁ là nơi chứa hàng thật. Cây kho nhiều tầng dựng sau ở mục Kho hàng.",
      done: nWarehouse > 0,
      doneText: `${nWarehouse} kho`,
      formPath: "/cay-kho",
      // Chưa có công ty thì chưa tạo kho được — kho bắt buộc thuộc một công ty.
      quick: company
        ? {
            label: `Tạo nhanh ${DEFAULT_WAREHOUSES.length} kho cơ bản`,
            run: () => bulk("warehouse", "Warehouse", DEFAULT_WAREHOUSES.map((w) => ({ warehouse_name: w, company, is_group: 0 })), warehousesQ.refetch),
          }
        : undefined,
    },
    {
      key: "item",
      icon: Package,
      title: "Mặt hàng",
      desc: "Khai một lần, dùng cho mọi phiếu. Nhớ khai mã vạch để quét được.",
      done: nItem > 0,
      doneText: `${nItem}+ mặt hàng`,
      formPath: "/app/Item/new",
      quick: undefined as undefined | { label: string; run: () => Promise<void> },
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && blocking) return; onOpenChange(v); }}>
      <DialogContent
        className="w-[min(94vw,42rem)] max-w-none p-0"
        // Thiếu dữ liệu nền ⇒ chặn mọi đường đóng. Đóng được thì người dùng rơi vào một app
        // không dùng nổi mà không hiểu vì sao mọi thứ đều trống.
        onInteractOutside={(e) => { if (blocking) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (blocking) e.preventDefault(); }}
      >
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle>Thiết lập kho</DialogTitle>
        </DialogHeader>

        <div className="px-5 pt-4">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="shrink-0 text-muted-foreground">
              Xong <b className="text-foreground">{doneCount}</b>/{steps.length} bước
            </span>
            <div className="ml-2 h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="mf-progress h-full rounded-full bg-primary transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
          </div>
        </div>

        <div className="max-h-[26rem] space-y-2 overflow-auto px-5 py-4">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.key}
                className={cn(
                  "flex items-start gap-3 rounded-md border p-3",
                  s.done ? "border-success/40 bg-success/5" : "border-dashed",
                )}
              >
                <span className={cn("mt-0.5 shrink-0", s.done ? "text-success-text" : "text-muted-foreground")}>
                  {s.done ? <Check className="size-4" /> : <Icon className="size-4" />}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium">{s.title}</span>
                    {s.done ? <span className="text-xs text-success-text">{s.doneText}</span> : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.desc}</p>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {/* Nhảy sang FORM THẬT của doctype — không dựng bộ ô nhập song song. */}
                    <Button variant={s.done ? "ghost" : "outline"} size="sm" className="h-7 text-xs" onClick={() => jump(s.formPath)}>
                      {s.done ? "Mở form" : "Thiết lập"} <ArrowRight className="ml-1 size-3" />
                    </Button>

                    {!s.done && s.quick ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={busy !== null}
                        onClick={() => void s.quick!.run()}
                      >
                        {busy === s.key ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Zap className="mr-1 size-3" />}
                        {s.quick.label}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Separator />

        <div className="flex items-center gap-2 px-5 py-3">
          {!blocking ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => { setSetupSkipped(true); onOpenChange(false); }}
              title="Vẫn mở lại được ở Quản trị › Thiết lập ban đầu"
            >
              Không hiện lần sau
            </Button>
          ) : (
            // Nói rõ VÌ SAO không đóng được, thay vì để người dùng bấm Esc mãi không hiểu.
            <span className="text-xs text-muted-foreground">
              Cần ít nhất một Công ty và một Kho thì app mới dùng được.
            </span>
          )}
          <Button className="ml-auto" disabled={blocking} onClick={() => onOpenChange(false)}>
            {allDone ? "Vào ứng dụng" : "Để sau"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
