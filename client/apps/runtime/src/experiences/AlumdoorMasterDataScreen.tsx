import { useMemo } from "react";
import { ChevronRight, PackageSearch } from "lucide-react";
import { Button } from "@metaforge/ui";

/* Hallmark · macrostructure: Workbench · genre: modern-minimal
 * pre-emit critique: P4 H5 E4 S4 R5 V4
 */

export interface AlumdoorMasterItem {
  key: string;
  label: string;
  route: string;
}

interface AlumdoorMasterDataScreenProps {
  items: AlumdoorMasterItem[];
  onNavigate: (route: string) => void;
}

interface MasterEntryDefinition {
  key: string;
  label: string;
}

interface MasterGroupDefinition {
  id: string;
  title: string;
  entries: MasterEntryDefinition[];
}

type ResolvedMasterGroup = Omit<MasterGroupDefinition, "entries"> & {
  items: Array<AlumdoorMasterItem & { displayLabel: string }>;
};

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[đĐ]/g, "d")
  .toLocaleLowerCase("vi")
  .trim();

/**
 * Danh mục Alumdoor là một menu nghiệp vụ có chủ đích, không phải toàn bộ DocType
 * mang group "Danh mục". Khai tường minh theo key để tên server đổi nhẹ cũng không
 * làm một mục tự nhảy sang nhóm khác.
 */
const MASTER_GROUPS: MasterGroupDefinition[] = [
  {
    id: "materials",
    title: "Vật tư & quy cách",
    entries: [
      { key: "Item", label: "Hàng hoá / Vật tư" },
      { key: "Item Group", label: "Nhóm hàng" },
      { key: "UOM", label: "Đơn vị tính" },
      { key: "Surface Finish", label: "Bề mặt" },
      { key: "Item Color", label: "Màu vật tư" },
      { key: "Material Specification", label: "Quy cách kỹ thuật vật tư" },
      { key: "Measurement Profile", label: "Bộ theo dõi vật tư" },
      { key: "Geometry Field", label: "Trường quy cách hình học" },
      { key: "Geometry Profile", label: "Bộ quy cách hình học" },
    ],
  },
  {
    id: "warehouses",
    title: "Kho",
    entries: [
      { key: "Warehouse", label: "Danh sách kho" },
    ],
  },
  {
    id: "purchasing",
    title: "Mua hàng & nhà cung cấp",
    entries: [
      { key: "Supplier", label: "Nhà cung cấp" },
      { key: "Supplier Item", label: "Mã hàng theo nhà cung cấp" },
    ],
  },
  {
    id: "selling",
    title: "Khách hàng & giá bán",
    entries: [
      { key: "Customer", label: "Khách hàng" },
      { key: "Price List", label: "Bảng giá" },
      { key: "Item Price", label: "Đơn giá theo bảng giá" },
      { key: "Pricing Scope", label: "Phạm vi áp dụng chính sách" },
      { key: "Pricing Rule", label: "Chính sách giá" },
    ],
  },
  {
    id: "sales-configuration",
    title: "Bán hàng & sản xuất",
    entries: [
      { key: "Cutting Policy", label: "Công thức cửa" },
      { key: "Bill of Materials", label: "Định mức / BOM" },
      { key: "Production Standard", label: "Tiêu chuẩn sản xuất" },
    ],
  },
  {
    id: "operations",
    title: "Lý do vận hành",
    entries: [
      { key: "Lý do huỷ", label: "Lý do huỷ" },
      { key: "Nguyên nhân chênh lệch", label: "Nguyên nhân chênh lệch" },
    ],
  },
];

const GROUP_LAYOUT: Record<string, string> = {
  materials: "lg:col-span-7 lg:row-span-2 xl:col-span-8",
  selling: "lg:col-span-5 xl:col-span-4",
  "sales-configuration": "lg:col-span-5 xl:col-span-4",
  warehouses: "lg:col-span-4",
  purchasing: "lg:col-span-4",
  operations: "lg:col-span-4",
};

function resolveGroups(items: AlumdoorMasterItem[]): ResolvedMasterGroup[] {
  const itemsByKey = new Map(items.map((item) => [normalize(item.key), item]));
  const itemsByLabel = new Map(items.map((item) => [normalize(item.label), item]));

  return MASTER_GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    items: group.entries.flatMap((entry) => {
      const item = itemsByKey.get(normalize(entry.key)) ?? itemsByLabel.get(normalize(entry.label));
      return item ? [{ ...item, displayLabel: entry.label }] : [];
    }),
  })).filter((group) => group.items.length > 0);
}

function MasterLink({ item, onNavigate, prominent = false }: {
  item: AlumdoorMasterItem & { displayLabel: string };
  onNavigate: (route: string) => void;
  prominent?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={`group h-auto min-h-11 w-full justify-between gap-3 rounded-md px-2.5 py-2.5 text-left font-normal hover:bg-primary/5 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${prominent ? "text-[15px]" : "text-sm"}`}
      onClick={() => onNavigate(item.route)}
    >
      <span className="min-w-0 whitespace-normal leading-5">{item.displayLabel}</span>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary group-focus-visible:translate-x-0.5 group-focus-visible:text-primary"
        aria-hidden="true"
      />
    </Button>
  );
}

function MasterGroupSection({ group, onNavigate }: {
  group: ResolvedMasterGroup;
  onNavigate: (route: string) => void;
}) {
  const isPrimary = group.id === "materials";

  if (isPrimary) {
    return (
      <section className={`${GROUP_LAYOUT[group.id]} rounded-xl border bg-card p-3 shadow-sm sm:p-4`}>
        <div className="mb-2 flex items-baseline justify-between gap-3 border-b pb-3">
          <h2 className="text-base font-semibold tracking-tight">{group.title}</h2>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{group.items.length}</span>
        </div>
        <nav aria-label={group.title} className="grid min-w-0 gap-x-3 sm:grid-cols-2">
          {group.items.map((item) => (
            <MasterLink key={item.key} item={item} onNavigate={onNavigate} prominent />
          ))}
        </nav>
      </section>
    );
  }

  return (
    <section className={`${GROUP_LAYOUT[group.id] ?? "lg:col-span-4"} min-w-0 border-t pt-3`}>
      <div className="mb-1 flex items-baseline justify-between gap-3 px-2.5">
        <h2 className="text-sm font-semibold tracking-tight">{group.title}</h2>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{group.items.length}</span>
      </div>
      <nav aria-label={group.title} className="min-w-0">
        {group.items.map((item) => (
          <MasterLink key={item.key} item={item} onNavigate={onNavigate} />
        ))}
      </nav>
    </section>
  );
}

export function AlumdoorMasterDataScreen({ items, onNavigate }: AlumdoorMasterDataScreenProps) {
  const groups = useMemo(() => resolveGroups(items), [items]);

  if (groups.length === 0) {
    return (
      <section className="flex flex-col items-start rounded-lg border border-dashed bg-card px-5 py-10 text-left">
        <PackageSearch className="mb-3 size-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="font-semibold">Chưa có danh mục khả dụng</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tài khoản hiện tại chưa được cấp quyền xem dữ liệu danh mục.</p>
      </section>
    );
  }

  return (
    <section className="w-full min-w-0 overflow-x-clip">
      <div className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-12 xl:gap-x-8 xl:gap-y-6">
        {groups.map((group) => (
          <MasterGroupSection key={group.id} group={group} onNavigate={onNavigate} />
        ))}
      </div>
    </section>
  );
}
