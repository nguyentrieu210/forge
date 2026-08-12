from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[2]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if text.count(old) != 1:
        raise SystemExit(f"{label}: expected one match, found {text.count(old)}")
    return text.replace(old, new, 1)

# 1. Make vendored Glide source a real workspace package resolved from src.
workspace = ROOT / "client/pnpm-workspace.yaml"
text = workspace.read_text(encoding="utf-8")
if '  - "vendor/*"' not in text:
    text = replace_once(text, '  - "apps/*"\n', '  - "apps/*"\n  - "vendor/*"\n', "workspace vendor package")
workspace.write_text(text, encoding="utf-8")

vendor_pkg_path = ROOT / "client/vendor/glide-data-grid/package.json"
vendor_pkg = json.loads(vendor_pkg_path.read_text(encoding="utf-8"))
vendor_pkg["private"] = True
vendor_pkg["main"] = "./src/index.ts"
vendor_pkg["module"] = "./src/index.ts"
vendor_pkg["browser"] = "./src/index.ts"
vendor_pkg["types"] = "./src/index.ts"
vendor_pkg["exports"] = {".": {"types": "./src/index.ts", "import": "./src/index.ts", "default": "./src/index.ts"}}
vendor_pkg["scripts"] = {"build": "tsc -b", "typecheck": "tsc -b --pretty false"}
vendor_pkg["dependencies"] = {
    "@linaria/react": "^6.3.0",
    "canvas-hypertxt": "^1.0.3",
    "lodash": "^4.17.21",
    "marked": "^16.0.10",
    "react-number-format": "^5.4.4",
    "react-responsive-carousel": "^3.2.7",
}
vendor_pkg["peerDependencies"] = {"react": "^18.3.1", "react-dom": "^18.3.1"}
vendor_pkg["devDependencies"] = {"@types/lodash": "^4.17.20"}
vendor_pkg_path.write_text(json.dumps(vendor_pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

vendor_tsconfig = ROOT / "client/vendor/glide-data-grid/tsconfig.json"
vendor_tsconfig.write_text(json.dumps({
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {"rootDir": "src", "outDir": "dist", "noEmit": False, "types": ["node"]},
    "include": ["src/**/*"],
}, indent=2) + "\n", encoding="utf-8")

views_pkg_path = ROOT / "client/packages/views/package.json"
views_pkg = json.loads(views_pkg_path.read_text(encoding="utf-8"))
views_pkg.setdefault("dependencies", {})["@glideapps/glide-data-grid"] = "workspace:*"
views_pkg_path.write_text(json.dumps(views_pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

views_tsconfig_path = ROOT / "client/packages/views/tsconfig.json"
views_tsconfig = json.loads(views_tsconfig_path.read_text(encoding="utf-8"))
refs = views_tsconfig.setdefault("references", [])
if not any(ref.get("path") == "../../vendor/glide-data-grid" for ref in refs):
    refs.append({"path": "../../vendor/glide-data-grid"})
views_tsconfig_path.write_text(json.dumps(views_tsconfig, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# 2. Sales Order: price catalog + Glide grid + one active detail editor.
path = ROOT / "client/packages/views/src/app/vertical/alumdoor/AlumdoorSalesOrderCreate.tsx"
src = path.read_text(encoding="utf-8")

src = replace_once(
    src,
    'import { useMetaForge } from "../../../container/provider.js";\n',
    'import { useMetaForge } from "../../../container/provider.js";\nimport { AlumdoorSalesLinesGrid, type SalesGridRow } from "./AlumdoorSalesLinesGrid.js";\n',
    "grid import",
)

src = replace_once(
    src,
    '  _commercial?: Json;\n',
    '  _commercial?: Json;\n  _itemPrices?: Doc[];\n  _selectedItemPrice?: string;\n',
    "ephemeral item price state",
)

src = replace_once(
    src,
    'function numberValue(value: unknown): number | undefined {\n',
    'function priceVariant(value: unknown): string {\n  return text(value).toUpperCase() || "STANDARD";\n}\n\nfunction numberValue(value: unknown): number | undefined {\n',
    "price variant helper",
)

src = replace_once(
    src,
    '  const [lines, setLines] = useState<SalesLine[]>([newLine(0)]);\n',
    '  const [lines, setLines] = useState<SalesLine[]>([newLine(0)]);\n  const [selectedLineKey, setSelectedLineKey] = useState("");\n',
    "selected line state",
)

load_prices = '''\n  const loadItemPrices = useCallback(async (itemCode: string): Promise<Doc[]> => {\n    const priceList = text(header.selling_price_list);\n    if (!itemCode || !priceList) return [];\n    try {\n      const rows = await adapter.getList("Item Price", {\n        fields: ["name", "price_list", "item_code", "uom", "price_variant", "currency", "rate", "disabled"],\n        filters: { item_code: itemCode, price_list: priceList, disabled: 0 },\n        pageLength: 200,\n      });\n      const currency = text(header.currency);\n      return rows\n        .filter((row) => !currency || !text(row.currency) || text(row.currency) === currency)\n        .sort((left, right) =>\n          priceVariant(left.price_variant).localeCompare(priceVariant(right.price_variant))\n          || text(left.uom).localeCompare(text(right.uom), "vi")\n          || (Number(left.rate) || 0) - (Number(right.rate) || 0)\n          || text(left.name).localeCompare(text(right.name), "vi"),\n        );\n    } catch {\n      return [];\n    }\n  }, [adapter, header.currency, header.selling_price_list]);\n'''

anchor = '  const previewLine = useCallback(async (\n'
if load_prices.strip() not in src:
    src = replace_once(src, anchor, load_prices + '\n' + anchor, "load Item Price")

# Load catalog prices together with Sales Options after item context has been resolved.
old = '''      next._salesOptions = options;\n\n      let candidate = { ...row, ...next, _context: context } as SalesLine;\n'''
new = '''      next._salesOptions = options;\n\n      let itemPrices = source._itemPrices ?? [];\n      if (changedField === "item_code" || changedField === "parent_context" || itemPrices.length === 0) {\n        itemPrices = await loadItemPrices(text(row.item_code));\n        if (lineSeq.current.get(row._key) !== seq) return;\n      }\n      next._itemPrices = itemPrices;\n\n      let candidate = { ...row, ...next, _context: context } as SalesLine;\n'''
src = replace_once(src, old, new, "load Item Price during preview")

src = replace_once(
    src,
    'next._commercial = commercial;\nnext._pricingError = "";\n',
    'next._commercial = commercial;\nnext._selectedItemPrice = text(commercial.item_price) || next._selectedItemPrice;\nnext._pricingError = "";\n',
    "authoritative selected Item Price",
)

src = replace_once(
    src,
    '  }, [adapter, childFieldSet, childFields, childMeta, cleanLine, header, loadSalesOptions, patchLine]);\n',
    '  }, [adapter, childFieldSet, childFields, childMeta, cleanLine, header, loadItemPrices, loadSalesOptions, patchLine]);\n',
    "preview dependencies",
)

callbacks_anchor = '''  const commitLine = useCallback((key: string, field: string, value: unknown) => {\n    const current = lines.find((line) => line._key === key);\n    if (!current) return;\n    patchLine(key, { [field]: value });\n    void previewLine(current, field, { [field]: value });\n  }, [lines, patchLine, previewLine]);\n'''
callbacks_new = callbacks_anchor + '''\n  const chooseItemPrice = useCallback((key: string, priceName: string) => {\n    const current = lines.find((line) => line._key === key);\n    if (!current) return;\n    const price = (current._itemPrices ?? []).find((row) => text(row.name) === priceName);\n    if (!price) return;\n\n    const variant = priceVariant(price.price_variant);\n    const applicableOptions = (current._salesOptions ?? []).filter((option) => salesOptionApplicable(option, current));\n    const matchingOptions = applicableOptions.filter((option) => priceVariant(option.price_variant) === variant);\n    const currentOption = matchingOptions.find((option) => text(option.name) === text(current.sales_option));\n    const option = currentOption\n      ?? matchingOptions.find((row) => row.is_default === true || row.is_default === 1)\n      ?? matchingOptions[0];\n\n    if ((current._salesOptions?.length ?? 0) > 0 && !option) {\n      toast.error(`Đơn giá ${priceName} thuộc biến thể ${variant} nhưng không có Cách bán hợp lệ cho mặt hàng này.`);\n      return;\n    }\n\n    const patch: Partial<SalesLine> = {\n      _selectedItemPrice: priceName,\n      ...(text(price.uom) ? { uom: text(price.uom) } : {}),\n      ...(option?.name ? { sales_option: text(option.name) } : {}),\n    };\n    patchLine(key, patch);\n    void previewLine(current, option?.name ? "sales_option" : "uom", patch);\n  }, [lines, patchLine, previewLine]);\n\n  const handleGridChange = useCallback((\n    key: string,\n    field: "item_code" | "sales_option" | "item_price" | "uom" | "qty" | "set_count",\n    value: unknown,\n  ) => {\n    const current = lines.find((line) => line._key === key);\n    if (!current) return;\n    if (field === "item_price") {\n      chooseItemPrice(key, text(value));\n      return;\n    }\n    if (field === "item_code") {\n      const itemCode = text(value);\n      const reset: Partial<SalesLine> = {\n        item_code: itemCode || undefined,\n        _itemLabel: undefined,\n        sales_option: undefined,\n        _context: undefined,\n        _salesOptions: [],\n        _itemPrices: [],\n        _selectedItemPrice: undefined,\n        _allowedColors: [],\n        _overrides: {},\n        _commercial: undefined,\n        _pricingError: "",\n        _error: "",\n      };\n      patchLine(key, reset);\n      if (itemCode) void previewLine({ ...current, ...reset } as SalesLine, "item_code", reset);\n      return;\n    }\n    const next = field === "qty" || field === "set_count"\n      ? (value == null || value === "" ? undefined : Number(value))\n      : (text(value) || undefined);\n    commitLine(key, field, next);\n  }, [chooseItemPrice, commitLine, lines, patchLine, previewLine]);\n\n  const addSalesLine = useCallback(() => {\n    const fresh = newLine(lines.length);\n    setLines((current) => [...current, fresh]);\n    setSelectedLineKey(fresh._key);\n  }, [lines.length]);\n\n  const duplicateSalesLine = useCallback((key: string) => {\n    const source = lines.find((line) => line._key === key);\n    if (!source) return;\n    const clone: SalesLine = {\n      ...source,\n      _key: newLine(lines.length)._key,\n      _loading: false,\n      _error: "",\n      _pricingError: "",\n    };\n    setLines((current) => [...current, clone]);\n    setSelectedLineKey(clone._key);\n  }, [lines]);\n\n  const deleteSalesLine = useCallback((key: string) => {\n    if (lines.length <= 1) return;\n    const index = lines.findIndex((line) => line._key === key);\n    const next = lines.filter((line) => line._key !== key);\n    setLines(next);\n    setSelectedLineKey(next[Math.min(Math.max(index, 0), next.length - 1)]?._key ?? "");\n  }, [lines]);\n\n  useEffect(() => {\n    if (!lines.length) return;\n    if (!selectedLineKey || !lines.some((line) => line._key === selectedLineKey)) {\n      setSelectedLineKey(lines[0]?._key ?? "");\n    }\n  }, [lines, selectedLineKey]);\n'''
src = replace_once(src, callbacks_anchor, callbacks_new, "grid callbacks")

# Replace the old per-row card/table hybrid with Glide + one active detail editor.
start = src.index('<section className="space-y-2" data-section="hardcoded-sales-lines">')
end_marker = '\n</section>\n        </div>'
end = src.index(end_marker, start) + len('\n</section>')
new_section = r'''<section className="space-y-2" data-section="hardcoded-sales-lines">
  <div className="flex min-h-8 items-center justify-between gap-3">
    <div className="min-w-0">
      <h2 className="text-sm font-semibold">Chi tiết bán hàng</h2>
      <div className="truncate text-[11px] text-muted-foreground">
        {text(header.customer_group) ? `Nhóm giá: ${text(header.customer_group)}` : "Chọn khách hàng để xác định nhóm giá"}
        {text(header.selling_price_list) ? ` · Bảng giá: ${text(header.selling_price_list)}` : ""}
      </div>
    </div>
  </div>

  <AlumdoorSalesLinesGrid
    rows={gridRows}
    selectedKey={selectedLineKey}
    onSelectedKeyChange={setSelectedLineKey}
    onChange={handleGridChange}
    onAdd={addSalesLine}
    onDuplicate={duplicateSalesLine}
    onDelete={deleteSalesLine}
    registry={registry}
    services={services}
    roles={roles}
    parentDocValues={header}
  />

  {activeLine && text(activeLine.item_code) && activeDetailNeeded ? (
    <div className="rounded-lg border bg-card px-3 py-2" data-section="active-sales-line-detail">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold">Thông số dòng {activeLineIndex + 1} · {text(activeLine.item_code)}</div>
          <div className="truncate text-[10px] text-muted-foreground">
            {text(activeLine._context?.availability_status) || "Thông số làm thay đổi số lượng tính giá / chính sách bán"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          {numberValue(activeLine.billable_area_sqm) !== undefined ? (
            <span>Diện tích tính giá <strong className="text-foreground">{numberValue(activeLine.billable_area_sqm)?.toLocaleString("vi-VN", { maximumFractionDigits: 6 })} m²</strong></span>
          ) : null}
          {text(activeCommercial.price_variant) ? <span>Biến thể <strong className="text-foreground">{text(activeCommercial.price_variant)}</strong></span> : null}
          {text(activeCommercial.item_price) ? <span>Item Price <strong className="text-foreground">{text(activeCommercial.item_price)}</strong></span> : null}
        </div>
      </div>

      <div className="grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {activeColors.length ? (
          <StandardField
            id={`sales-line-${activeLineIndex}-color`}
            field={selectField(childField("color"), "color", "Màu", activeColors)}
            value={activeLine.color}
            onChange={(value) => commitLine(activeLine._key, "color", text(value) || undefined)}
            registry={registry} services={services} parentDoctype="Sales Order Item" docValues={activeLine} roles={roles}
            label="Màu"
          />
        ) : null}

        {activeShowWidth ? (
          <StandardField
            id={`sales-line-${activeLineIndex}-width`}
            field={lineBaseField("width_m", fieldLabel(activeLine, "width_m", "Rộng (m)"), "Float")}
            value={activeLine.width_m}
            onChange={(value) => patchLine(activeLine._key, { width_m: value == null || value === "" ? undefined : Number(value) })}
            onCommit={() => commitLine(activeLine._key, "width_m", activeLine.width_m)}
            registry={registry} services={services} parentDoctype="Sales Order Item" docValues={activeLine} roles={roles}
            required={activeArea || fieldRequired(activeLine, "width_m")} readOnly={fieldReadonly(activeLine, "width_m")}
            label={fieldLabel(activeLine, "width_m", "Rộng (m)")}
          />
        ) : null}

        {activeShowHeight ? (
          <StandardField
            id={`sales-line-${activeLineIndex}-height`}
            field={lineBaseField("height_m", fieldLabel(activeLine, "height_m", "Cao (m)"), "Float")}
            value={activeLine.height_m}
            onChange={(value) => patchLine(activeLine._key, { height_m: value == null || value === "" ? undefined : Number(value) })}
            onCommit={() => commitLine(activeLine._key, "height_m", activeLine.height_m)}
            registry={registry} services={services} parentDoctype="Sales Order Item" docValues={activeLine} roles={roles}
            required={activeArea || fieldRequired(activeLine, "height_m")} readOnly={fieldReadonly(activeLine, "height_m")}
            label={fieldLabel(activeLine, "height_m", "Cao (m)")}
          />
        ) : null}

        {activeShowSets && activeQuantityField !== "set_count" ? (
          <StandardField
            id={`sales-line-${activeLineIndex}-sets`}
            field={lineBaseField("set_count", fieldLabel(activeLine, "set_count", activeArea ? "Số bộ" : "Số lượng"), "Int")}
            value={activeLine.set_count}
            onChange={(value) => patchLine(activeLine._key, { set_count: value == null || value === "" ? undefined : Number(value) })}
            onCommit={() => commitLine(activeLine._key, "set_count", activeLine.set_count)}
            registry={registry} services={services} parentDoctype="Sales Order Item" docValues={activeLine} roles={roles}
            required={activeArea || fieldRequired(activeLine, "set_count")} readOnly={fieldReadonly(activeLine, "set_count")}
            label={fieldLabel(activeLine, "set_count", activeArea ? "Số bộ" : "Số lượng")}
          />
        ) : null}

        {activeShowLeafVariant ? (
          <StandardField
            id={`sales-line-${activeLineIndex}-leaf-variant`}
            field={selectField(childField("leaf_variant"), "leaf_variant", "Kiểu lá / motor", leafVariants)}
            value={activeLine.leaf_variant}
            onChange={(value) => commitLine(activeLine._key, "leaf_variant", text(value) || undefined)}
            registry={registry} services={services} parentDoctype="Sales Order Item" docValues={activeLine} roles={roles}
            required={fieldRequired(activeLine, "leaf_variant")}
            label="Kiểu lá / motor"
          />
        ) : null}

        {activeKind === "mesh" && fieldVisible(activeLine, "mesh_height_m", true) ? (
          <StandardField
            id={`sales-line-${activeLineIndex}-mesh-height`}
            field={lineBaseField("mesh_height_m", fieldLabel(activeLine, "mesh_height_m", "Cao lưới (m)"), "Float")}
            value={activeLine.mesh_height_m}
            onChange={(value) => patchLine(activeLine._key, { mesh_height_m: value == null || value === "" ? undefined : Number(value) })}
            onCommit={() => commitLine(activeLine._key, "mesh_height_m", activeLine.mesh_height_m)}
            registry={registry} services={services} parentDoctype="Sales Order Item" docValues={activeLine} roles={roles}
            required={fieldRequired(activeLine, "mesh_height_m")} readOnly={fieldReadonly(activeLine, "mesh_height_m")}
            label={fieldLabel(activeLine, "mesh_height_m", "Cao lưới (m)")}
          />
        ) : null}

        {fieldVisible(activeLine, "has_butterfly_bracket") ? (
          <StandardField
            id={`sales-line-${activeLineIndex}-butterfly`}
            field={lineBaseField("has_butterfly_bracket", fieldLabel(activeLine, "has_butterfly_bracket", "Có bản bướm"), "Check")}
            value={activeLine.has_butterfly_bracket}
            onChange={(value) => commitLine(activeLine._key, "has_butterfly_bracket", value ? 1 : 0)}
            registry={registry} services={services} parentDoctype="Sales Order Item" docValues={activeLine} roles={roles}
            label={fieldLabel(activeLine, "has_butterfly_bracket", "Có bản bướm")}
          />
        ) : null}

        {activeShowLength ? (
          <StandardField
            id={`sales-line-${activeLineIndex}-length`}
            field={lineBaseField("length_m", fieldLabel(activeLine, "length_m", "Dài / cây (m)"), "Float")}
            value={activeLine.length_m}
            onChange={(value) => patchLine(activeLine._key, { length_m: value == null || value === "" ? undefined : Number(value) })}
            onCommit={() => commitLine(activeLine._key, "length_m", activeLine.length_m)}
            registry={registry} services={services} parentDoctype="Sales Order Item" docValues={activeLine} roles={roles}
            required={fieldRequired(activeLine, "length_m")} readOnly={fieldReadonly(activeLine, "length_m")}
            label={fieldLabel(activeLine, "length_m", "Dài / cây (m)")}
          />
        ) : null}

        {activeShowBars ? (
          <StandardField
            id={`sales-line-${activeLineIndex}-bars`}
            field={lineBaseField("qty_bar", fieldLabel(activeLine, "qty_bar", "Số cây"), "Int")}
            value={activeLine.qty_bar}
            onChange={(value) => patchLine(activeLine._key, { qty_bar: value == null || value === "" ? undefined : Number(value) })}
            onCommit={() => commitLine(activeLine._key, "qty_bar", activeLine.qty_bar)}
            registry={registry} services={services} parentDoctype="Sales Order Item" docValues={activeLine} roles={roles}
            required={fieldRequired(activeLine, "qty_bar")} readOnly={fieldReadonly(activeLine, "qty_bar")}
            label={fieldLabel(activeLine, "qty_bar", "Số cây")}
          />
        ) : null}
      </div>

      {activeLine._error || activeLine._pricingError ? (
        <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
          {activeLine._error || activeLine._pricingError}
        </div>
      ) : null}
    </div>
  ) : null}
</section>'''
src = src[:start] + new_section + src[end:]

# Build grid row projections + active detail projection directly before return.
anchor = '  const displayedTotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);\n\n  return (\n'
projection = r'''  const displayedTotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);

  const gridRows: SalesGridRow[] = lines.map((line) => {
    const kind = family(line);
    const area = isAreaDoor(line);
    const showWidth = area || fieldVisible(line, "width_m");
    const showHeight = area || fieldVisible(line, "height_m");
    const showSets = area || fieldVisible(line, "set_count");
    const showLength = fieldVisible(line, "length_m") && (fieldRequired(line, "length_m") || line.length_m != null);
    const showBars = fieldVisible(line, "qty_bar") && (fieldRequired(line, "qty_bar") || line.qty_bar != null);
    const simpleCountPrimary = showSets && !area && !showWidth && !showHeight && !showLength && !showBars;
    const directQtyPrimary = !simpleCountPrimary && !fieldReadonly(line, "qty") && !showWidth && !showHeight && !showSets && !showLength && !showBars;
    const quantityField = simpleCountPrimary ? "set_count" as const : directQtyPrimary ? "qty" as const : undefined;
    const commercial = line._commercial ?? {};
    const pricedQty = quantityField === "set_count"
      ? numberValue(line.set_count)
      : quantityField === "qty"
        ? numberValue(line.qty)
        : numberValue(commercial.priced_qty) ?? numberValue(line.qty);
    const sellingRate = numberValue(commercial.selling_rate) ?? numberValue(line.rate);
    const discountAmount = numberValue(commercial.discount_amount) ?? numberValue(line.discount_amount) ?? 0;
    const discountPercentage = numberValue(commercial.discount_percentage) ?? numberValue(line.discount_percentage) ?? 0;
    const adjustmentAmount = numberValue(commercial.adjustment_amount) ?? numberValue(line.adjustment_amount) ?? 0;
    const netAmount = numberValue(commercial.net_before_tax) ?? lineTotal(line);
    const allOptions = line._salesOptions ?? [];
    const applicableOptions = allOptions.filter((option) => salesOptionApplicable(option, line));
    const optionChoices = applicableOptions.map((option) => ({
      value: text(option.name),
      label: text(option.option_label) || text(option.name),
    }));
    const selectedOption = allOptions.find((option) => text(option.name) === text(line.sales_option));
    const salesOptionLabel = text(commercial.sales_option_label)
      || text(selectedOption?.option_label)
      || (text(line.sales_option) ? text(line.sales_option) : "Tiêu chuẩn");

    const allowedVariants = new Set(applicableOptions.map((option) => priceVariant(option.price_variant)));
    const rawPrices = line._itemPrices ?? [];
    const selectablePrices = rawPrices.filter((price) => {
      if (allOptions.length === 0) return priceVariant(price.price_variant) === "STANDARD";
      return allowedVariants.has(priceVariant(price.price_variant));
    });
    const priceChoices = selectablePrices.map((price) => {
      const variant = priceVariant(price.price_variant);
      const labels = applicableOptions
        .filter((option) => priceVariant(option.price_variant) === variant)
        .map((option) => text(option.option_label) || text(option.name))
        .filter(Boolean);
      return {
        value: text(price.name),
        label: `${money(price.rate)} ₫${text(price.uom) ? ` / ${text(price.uom)}` : ""}${labels.length ? ` · ${labels.join(" / ")}` : variant !== "STANDARD" ? ` · ${variant}` : ""}`,
      };
    });
    const resolvedPrice = text(commercial.item_price) || text(line._selectedItemPrice);
    const priceLabel = sellingRate === undefined
      ? ""
      : `${money(sellingRate)} ₫${text(line.uom) ? ` / ${text(line.uom)}` : ""}`;
    const uoms = Array.isArray(line._context?.allowed_uoms) ? line._context.allowed_uoms.map(text).filter(Boolean) : [];

    return {
      key: line._key,
      itemCode: text(line.item_code),
      itemLabel: text(line._itemLabel) || text(line.item_code),
      availability: text(line._context?.availability_status),
      salesOption: text(line.sales_option),
      salesOptionLabel,
      salesOptionChoices: optionChoices,
      priceId: resolvedPrice,
      priceLabel,
      priceChoices,
      uom: text(line.uom),
      uomChoices: uoms.map((uom) => ({ value: uom, label: uom })),
      quantity: pricedQty,
      quantityField,
      quantityEditable: Boolean(quantityField),
      discountLabel: discountAmount > 0
        ? `-${money(discountAmount)} ₫${discountPercentage > 0 ? ` · ${discountPercentage.toLocaleString("vi-VN", { maximumFractionDigits: 4 })}%` : ""}`
        : "—",
      adjustmentLabel: adjustmentAmount !== 0 ? `${money(adjustmentAmount)} ₫` : "—",
      amountLabel: `${money(netAmount)} ₫`,
      loading: line._loading,
      error: line._error,
      pricingError: line._pricingError,
      docValues: line,
    };
  });

  const activeLineIndex = Math.max(0, lines.findIndex((line) => line._key === selectedLineKey));
  const activeLine = lines[activeLineIndex];
  const activeKind = activeLine ? family(activeLine) : "ordinary";
  const activeArea = activeLine ? isAreaDoor(activeLine) : false;
  const activeColors = activeLine?._allowedColors ?? [];
  const activeShowWidth = Boolean(activeLine && (activeArea || fieldVisible(activeLine, "width_m")));
  const activeShowHeight = Boolean(activeLine && (activeArea || fieldVisible(activeLine, "height_m")));
  const activeShowSets = Boolean(activeLine && (activeArea || fieldVisible(activeLine, "set_count")));
  const activeShowLength = Boolean(activeLine && fieldVisible(activeLine, "length_m") && (fieldRequired(activeLine, "length_m") || activeLine.length_m != null));
  const activeShowBars = Boolean(activeLine && fieldVisible(activeLine, "qty_bar") && (fieldRequired(activeLine, "qty_bar") || activeLine.qty_bar != null));
  const activeShowLeafVariant = Boolean(activeLine && fieldVisible(activeLine, "leaf_variant", activeKind === "australian"));
  const activeSimpleCount = Boolean(activeLine && activeShowSets && !activeArea && !activeShowWidth && !activeShowHeight && !activeShowLength && !activeShowBars);
  const activeDirectQty = Boolean(activeLine && !activeSimpleCount && !fieldReadonly(activeLine, "qty") && !activeShowWidth && !activeShowHeight && !activeShowSets && !activeShowLength && !activeShowBars);
  const activeQuantityField = activeSimpleCount ? "set_count" : activeDirectQty ? "qty" : undefined;
  const activeDetailNeeded = Boolean(activeLine && (
    activeColors.length > 0 || activeShowWidth || activeShowHeight || (activeShowSets && activeQuantityField !== "set_count")
    || activeShowLeafVariant || activeKind === "mesh" || fieldVisible(activeLine, "has_butterfly_bracket")
    || activeShowLength || activeShowBars
  ));
  const activeCommercial = activeLine?._commercial ?? {};

  return (
'''
src = replace_once(src, anchor, projection, "grid projections")

path.write_text(src, encoding="utf-8")

# 3. Local preview installs the new dependency only once; regular sync stays lightweight.
sync_path = ROOT / ".github/workflows/sync-alumdoor-ui-local.yml"
sync = sync_path.read_text(encoding="utf-8")
sync = sync.replace("timeout-minutes: 2", "timeout-minutes: 8")
install_anchor = '''          git -C $path reset --hard origin/main\n\n          Write-Host "Synced hardcode preview to:"\n'''
install_block = '''          git -C $path reset --hard origin/main\n\n          $glidePackage = Join-Path $path 'client\\packages\\views\\node_modules\\@glideapps\\glide-data-grid'\n          if (-not (Test-Path $glidePackage)) {\n            Write-Host 'Glide Data Grid dependency missing; installing workspace dependencies once...'\n            Push-Location (Join-Path $path 'client')\n            try {\n              corepack enable\n              pnpm install --frozen-lockfile\n            } finally {\n              Pop-Location\n            }\n          }\n\n          Write-Host "Synced hardcode preview to:"\n'''
if "$glidePackage" not in sync:
    sync = replace_once(sync, install_anchor, install_block, "conditional preview install")
sync_path.write_text(sync, encoding="utf-8")

print("Patched Glide Sales Order integration")
