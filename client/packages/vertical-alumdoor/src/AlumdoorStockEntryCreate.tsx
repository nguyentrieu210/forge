/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Boxes, Loader2, Plus, Save, Trash2, Wand2 } from "lucide-react";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@metaforge/ui";
import type { Doc } from "@metaforge/core";
import { useMetaForge } from "@metaforge/views/provider";
import { CAN_KHO_NHAP, CAN_KHO_XUAT, LOAI_PHIEU_KHO, kiemTraPhieuKho, type MaPhieuKho } from "./stock-entry-kiem-tra.js";

type Json = Record<string, unknown>;

/**
 * Phiếu kho lập TAY, không đi qua lệnh sản xuất.
 *
 * `AlumdoorManufacturingStockEntryCreate` chỉ mở được khi đã có `Work Order` và chỉ làm hai
 * việc "Material Transfer"/"Manufacture" của lệnh đó. Nên trước màn này, xưởng KHÔNG có đường
 * nào lập phiếu xuất kho: muốn xuất vật tư ra làm, chuyển hàng sang kho đầu thừa, hay chỉnh tồn
 * sau kiểm kê đều phải có lệnh sản xuất trước — mà lệnh sản xuất thì đang bằng không.
 */



interface DongVatTu {
  key: string;
  item_code: string;
  qty: string;
  weight_kg: string;
  note: string;
  /** Suy từ Item, chỉ để hiện — người dùng không gõ được. Gõ nhầm ĐVT là lệch tồn âm thầm. */
  _uom: string;
  _ten: string;
}

export interface AlumdoorStockEntryCreateProps {
  closeRequest?: number;
  onCreated: (name: string) => void;
  onCancel: () => void;
}

export function AlumdoorStockEntryCreate(props: AlumdoorStockEntryCreateProps) {
  const { adapter, businessContext } = useMetaForge();
  const [companies, setCompanies] = useState<Doc[]>([]);
  const [warehouses, setWarehouses] = useState<Doc[]>([]);
  const [boms, setBoms] = useState<Doc[]>([]);

  const [purpose, setPurpose] = useState<MaPhieuKho>("Material Issue");
  const [company, setCompany] = useState("");
  const [postingDate, setPostingDate] = useState(today());
  const [sourceWarehouse, setSourceWarehouse] = useState("");
  const [targetWarehouse, setTargetWarehouse] = useState("");
  const [note, setNote] = useState("");

  const [bomName, setBomName] = useState("");
  const [bomSets, setBomSets] = useState("1");
  const [expanding, setExpanding] = useState(false);

  const [rows, setRows] = useState<DongVatTu[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [canSubmit, setCanSubmit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const closeSeen = useRef(props.closeRequest ?? 0);

  useEffect(() => {
    if ((props.closeRequest ?? 0) === closeSeen.current) return;
    closeSeen.current = props.closeRequest ?? 0;
    props.onCancel();
  }, [props.closeRequest, props.onCancel]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [companyRows, warehouseRows, bomRows, caps] = await Promise.all([
          adapter.getList("Company", { fields: ["name", "company_name"], orderBy: "name asc", pageLength: 100 }),
          adapter.getList("Warehouse", { fields: ["name", "warehouse_name", "stock_role"], filters: { disabled: 0 }, orderBy: "name asc", pageLength: 200 }),
          adapter.getList("Bill of Materials", { fields: ["name", "item", "color"], filters: { is_active: 1 }, orderBy: "name asc", pageLength: 400 }).catch(() => [] as Doc[]),
          adapter.getCapabilities("Stock Entry"),
        ]);
        if (!active) return;
        setCompanies(companyRows);
        setWarehouses(warehouseRows);
        setBoms(bomRows);
        setCanCreate(Boolean(caps.create));
        setCanSubmit(Boolean(caps.submit));
        const contextCompany = text((businessContext as Json | undefined)?.company);
        setCompany(companyRows.some((row) => text(row.name) === contextCompany) ? contextCompany : text(companyRows[0]?.name));
        // Kho chính làm mặc định kho xuất: xuất vật tư là việc hay làm nhất.
        const chinh = warehouseRows.find((row) => text(row.stock_role) === "Kho chính");
        if (chinh) setSourceWarehouse(text(chinh.name));
      } catch (error) {
        if (active) toast.error(adapter.mapError(error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [adapter, businessContext]);

  /** Nạp ĐVT và tên từ Item — không để người dùng gõ ĐVT. */
  const hydrate = useCallback(async (code: string): Promise<{ uom: string; ten: string }> => {
    if (!code) return { uom: "", ten: "" };
    try {
      // `getDoc` trả về bọc `{ doc, docinfo }`, không trả thẳng bản ghi.
      const { doc } = await adapter.getDoc("Item", code);
      return { uom: text(doc.stock_uom), ten: text(doc.item_name) };
    } catch { return { uom: "", ten: "" }; }
  }, [adapter]);

  const patchRow = (key: string, patch: Partial<DongVatTu>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const setItem = async (key: string, code: string) => {
    patchRow(key, { item_code: code, _uom: "", _ten: "" });
    const { uom, ten } = await hydrate(code);
    patchRow(key, { _uom: uom, _ten: ten });
  };

  const addRow = () => setRows((current) => [...current, blankRow()]);
  const removeRow = (key: string) => setRows((current) => current.filter((row) => row.key !== key));

  /**
   * Xổ định mức ra dòng vật tư. Đây là phần đáng giá nhất của màn: làm một bộ cửa ĐL1LY thì
   * đổ ra đủ tôn/ray/V4/trục, thợ không gõ tay từng dòng rồi gõ sót.
   *
   * Dòng `qty_basis = "Theo số lá"` để trống số lượng có chủ đích — số lá do công thức chia lá
   * tính từ chiều cao, không nằm trong BOM. Vẫn đổ dòng ra nhưng để trống SL cho người nhập.
   */
  const xoDinhMuc = async () => {
    if (!bomName) return;
    const soBo = Number(bomSets);
    if (!Number.isFinite(soBo) || soBo <= 0) { toast.error("Số bộ phải lớn hơn 0."); return; }
    setExpanding(true);
    try {
      const { doc: bom } = await adapter.getDoc("Bill of Materials", bomName);
      const lines = childRows(bom.items);
      if (!lines.length) { toast.error(`${bomName} không có dòng cấu kiện.`); return; }
      const hydrated = await Promise.all(lines.map(async (line) => {
        const code = text(line.item_code);
        const { uom, ten } = await hydrate(code);
        const dinhMuc = Number(line.qty);
        const theoSoLa = text(line.qty_basis) === "Theo số lá";
        return {
          ...blankRow(),
          item_code: code,
          qty: theoSoLa || !Number.isFinite(dinhMuc) ? "" : String(round6(dinhMuc * soBo)),
          note: theoSoLa ? "Theo số lá — điền theo công thức chia lá" : "",
          _uom: uom,
          _ten: ten,
        } satisfies DongVatTu;
      }));
      setRows((current) => [...current.filter((row) => text(row.item_code)), ...hydrated]);
      const trong = hydrated.filter((row) => !row.qty).length;
      toast.success(`Đã xổ ${hydrated.length} dòng từ ${bomName}${trong ? ` · ${trong} dòng theo số lá cần điền tay` : ""}.`);
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setExpanding(false);
    }
  };

  const thieu = useMemo(() => kiemTraPhieuKho({ purpose, company, sourceWarehouse, targetWarehouse, rows }), [purpose, company, sourceWarehouse, targetWarehouse, rows]);

  const save = async (submitNow: boolean) => {
    if (!canCreate) return;
    if (thieu) { toast.error(thieu); return; }
    setSaving(true);
    try {
      const items: Json[] = rows.filter((row) => text(row.item_code)).map((row) => ({
        item_code: row.item_code,
        qty: row.qty,
        ...(CAN_KHO_XUAT.has(purpose) && sourceWarehouse ? { source_warehouse: sourceWarehouse } : {}),
        ...(CAN_KHO_NHAP.has(purpose) && targetWarehouse ? { target_warehouse: targetWarehouse } : {}),
        ...(text(row.weight_kg) ? { weight_kg: row.weight_kg } : {}),
        ...(text(row.note) ? { note: row.note } : {}),
      }));
      const created = await adapter.createDoc("Stock Entry", {
        purpose,
        company,
        posting_at: `${postingDate}T00:00:00.000Z`,
        ...(CAN_KHO_XUAT.has(purpose) && sourceWarehouse ? { source_warehouse: sourceWarehouse } : {}),
        ...(CAN_KHO_NHAP.has(purpose) && targetWarehouse ? { target_warehouse: targetWarehouse } : {}),
        ...(text(note) ? { note } : {}),
        items,
      });
      const finalDoc = submitNow ? await adapter.submit(created) : created;
      toast.success(submitNow ? "Đã tạo và ghi sổ phiếu kho." : "Đã lưu phiếu kho nháp.");
      props.onCreated(String(finalDoc.name));
    } catch (error) {
      toast.error(adapter.mapError(error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="grid h-40 place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" /> Đang tải phiếu kho…</div>;

  const loai = LOAI_PHIEU_KHO.find((entry) => entry.ma === purpose);

  return <div className="flex h-full min-h-0 flex-col" data-surface="alumdoor-stock-entry-create">
    <div className="shrink-0 border-b bg-card px-5 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Loại phiếu" className="min-w-52 flex-1">
          <Select value={purpose} onValueChange={(value) => setPurpose(value as MaPhieuKho)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{LOAI_PHIEU_KHO.map((entry) => <SelectItem key={entry.ma} value={entry.ma}>{entry.nhan}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Công ty" className="min-w-52 flex-1">
          <Select value={company} onValueChange={setCompany}>
            <SelectTrigger><SelectValue placeholder="Chọn công ty" /></SelectTrigger>
            <SelectContent>{companies.map((row) => <SelectItem key={text(row.name)} value={text(row.name)}>{text(row.company_name) || text(row.name)}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Thời điểm" className="w-44"><Input type="date" value={postingDate} onChange={(event) => setPostingDate(event.target.value)} /></Field>
        {CAN_KHO_XUAT.has(purpose) && <Field label="Kho xuất" className="min-w-44 flex-1">
          <Select value={sourceWarehouse} onValueChange={setSourceWarehouse}>
            <SelectTrigger><SelectValue placeholder="Chọn kho xuất" /></SelectTrigger>
            <SelectContent>{warehouses.map((row) => <SelectItem key={text(row.name)} value={text(row.name)}>{text(row.warehouse_name) || text(row.name)}</SelectItem>)}</SelectContent>
          </Select>
        </Field>}
        {CAN_KHO_NHAP.has(purpose) && <Field label="Kho nhập" className="min-w-44 flex-1">
          <Select value={targetWarehouse} onValueChange={setTargetWarehouse}>
            <SelectTrigger><SelectValue placeholder="Chọn kho nhập" /></SelectTrigger>
            <SelectContent>{warehouses.map((row) => <SelectItem key={text(row.name)} value={text(row.name)}>{text(row.warehouse_name) || text(row.name)}</SelectItem>)}</SelectContent>
          </Select>
        </Field>}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{loai?.mo_ta}</p>
    </div>

    {CAN_KHO_XUAT.has(purpose) && <div className="shrink-0 border-b bg-muted/30 px-5 py-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Xổ theo định mức" className="min-w-72 flex-[1.4]">
          <Select value={bomName} onValueChange={setBomName}>
            <SelectTrigger><SelectValue placeholder="Chọn định mức để đổ sẵn dòng vật tư" /></SelectTrigger>
            <SelectContent>{boms.map((row) => <SelectItem key={text(row.name)} value={text(row.name)}>{text(row.name)} · {text(row.item)}{text(row.color) ? ` · ${text(row.color)}` : ""}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Số bộ" className="w-28"><Input inputMode="decimal" value={bomSets} onChange={(event) => setBomSets(event.target.value)} /></Field>
        <Button variant="outline" onClick={() => void xoDinhMuc()} disabled={!bomName || expanding}>
          {expanding ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />} Xổ định mức
        </Button>
      </div>
    </div>}

    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2"><Boxes className="size-4" /><h3 className="font-medium">Dòng vật tư</h3></div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{rows.filter((row) => text(row.item_code)).length} dòng</Badge>
            <Button size="sm" variant="outline" onClick={addRow}><Plus className="size-4" /> Thêm dòng</Button>
          </div>
        </div>
        <div className="overflow-x-auto"><Table>
          <TableHeader><TableRow>
            <TableHead className="min-w-56">Vật tư</TableHead>
            <TableHead className="w-36 text-right">Số lượng</TableHead>
            <TableHead className="w-24">ĐVT</TableHead>
            <TableHead className="w-36 text-right">Khối lượng (kg)</TableHead>
            <TableHead className="min-w-40">Ghi chú</TableHead>
            <TableHead className="w-12" />
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((row) => <TableRow key={row.key}>
              <TableCell>
                <Input value={row.item_code} placeholder="Mã vật tư" onChange={(event) => void setItem(row.key, event.target.value.trim())} />
                {row._ten && <div className="mt-1 text-xs text-muted-foreground">{row._ten}</div>}
              </TableCell>
              <TableCell><Input inputMode="decimal" className="text-right" value={row.qty} onChange={(event) => patchRow(row.key, { qty: event.target.value })} /></TableCell>
              <TableCell className="text-xs text-muted-foreground">{row._uom || "—"}</TableCell>
              <TableCell><Input inputMode="decimal" className="text-right" value={row.weight_kg} onChange={(event) => patchRow(row.key, { weight_kg: event.target.value })} /></TableCell>
              <TableCell><Input value={row.note} onChange={(event) => patchRow(row.key, { note: event.target.value })} /></TableCell>
              <TableCell><Button size="icon" variant="ghost" onClick={() => removeRow(row.key)}><Trash2 className="size-4" /></Button></TableCell>
            </TableRow>)}
            {!rows.length && <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">Chưa có dòng nào. Bấm “Thêm dòng”, hoặc chọn một định mức rồi bấm “Xổ định mức”.</TableCell></TableRow>}
          </TableBody>
        </Table></div>
      </div>

      <Field label="Ghi chú phiếu" className="mt-4 block"><Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ai lĩnh, làm việc gì…" /></Field>

      {thieu && <div className="mt-4 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" /><div>{thieu}</div>
      </div>}
    </div>

    <div className="shrink-0 border-t bg-card px-5 py-3"><div className="flex flex-wrap justify-end gap-2">
      <Button variant="outline" onClick={props.onCancel} disabled={saving}>Huỷ</Button>
      <Button variant="outline" onClick={() => void save(false)} disabled={saving || !canCreate || Boolean(thieu)}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Lưu nháp</Button>
      <Button onClick={() => void save(true)} disabled={saving || !canCreate || !canSubmit || Boolean(thieu)}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Boxes className="size-4" />} Lưu &amp; ghi sổ</Button>
    </div></div>
  </div>;
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={className}><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;
}
function blankRow(): DongVatTu {
  return { key: `r${Math.random().toString(36).slice(2, 10)}`, item_code: "", qty: "", weight_kg: "", note: "", _uom: "", _ten: "" };
}
function childRows(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter((row): row is Json => Boolean(row && typeof row === "object" && !Array.isArray(row))) : [];
}
function round6(value: number): number { return Math.round(value * 1e6) / 1e6; }
function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).normalize("NFC").trim() : "";
}
