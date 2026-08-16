import { useMemo } from "react";
import { ChevronRight, PackageSearch } from "lucide-react";
import { Button } from "@metaforge/ui";

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

function MasterGroupCard({ group, onNavigate, mobile = false }: {
  group: ResolvedMasterGroup;
  onNavigate: (route: string) => void;
  mobile?: boolean;
}) {
  return (
    <section className="mb-3 inline-block w-full break-inside-avoid overflow-hidden rounded-lg border bg-card align-top">
      <h2 className="border-b bg-muted/30 px-3 py-2.5 text-sm font-semibold">{group.title}</h2>
      <nav aria-label={group.title}>
        {group.items.map((item) => (
          <Button
            key={item.key}
            type="button"
            variant="ghost"
            className={`group h-auto w-full justify-between gap-3 rounded-none border-b px-3 text-left text-sm font-normal last:border-b-0 hover:bg-primary/5 hover:text-primary ${mobile ? "min-h-11 py-2.5" : "min-h-10 py-2"}`}
            onClick={() => onNavigate(item.route)}
          >
            <span className="min-w-0 whitespace-normal">{item.displayLabel}</span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
          </Button>
        ))}
      </nav>
    </section>
  );
}

export function AlumdoorMasterDataScreen({ items, onNavigate }: AlumdoorMasterDataScreenProps) {
  const groups = useMemo(() => resolveGroups(items), [items]);

  if (groups.length === 0) {
    return (
      <section className="flex flex-col items-center rounded-lg border border-dashed bg-card px-5 py-10 text-center">
        <PackageSearch className="mb-3 size-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="font-semibold">Chưa có danh mục khả dụng</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tài khoản hiện tại chưa được cấp quyền xem dữ liệu danh mục.</p>
      </section>
    );
  }

  return (
    <section className="w-full">
      <div className="hidden columns-2 gap-3 md:block xl:columns-3">
        {groups.map((group) => <MasterGroupCard key={group.id} group={group} onNavigate={onNavigate} />)}
      </div>

      <div className="md:hidden">
        {groups.map((group) => <MasterGroupCard key={group.id} group={group} onNavigate={onNavigate} mobile />)}
      </div>
    </section>
  );
}
