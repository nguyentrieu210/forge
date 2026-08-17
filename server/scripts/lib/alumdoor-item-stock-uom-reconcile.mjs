const clean = (value) => String(value ?? "").trim();

const CHECK_FIELDS = new Set([
  "is_stock_item",
  "is_purchase_item",
  "is_sales_item",
  "is_fixed_asset",
  "include_item_in_manufacturing",
  "is_sub_contracted_item",
  "disabled",
]);

export const ITEM_RECONCILE_MANAGED_SCALARS = [
  "item_code",
  "item_name",
  "item_group",
  "item_nature",
  "material_stage",
  "supply_type",
  "is_stock_item",
  "is_purchase_item",
  "is_sales_item",
  "is_fixed_asset",
  "include_item_in_manufacturing",
  "is_sub_contracted_item",
  "stock_uom",
  "default_purchase_uom",
  "default_sales_uom",
  "measurement_profile",
  "disabled",
];

function normalizeScalar(field, value) {
  if (CHECK_FIELDS.has(field)) return Number(Boolean(Number(value) || value === true));
  return clean(value);
}

function normalizeConversions(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      uom: clean(row?.uom),
      conversion_factor: Number(row?.conversion_factor),
    }))
    .filter((row) => row.uom && Number.isFinite(row.conversion_factor) && row.conversion_factor > 0)
    .sort((a, b) => a.uom.localeCompare(b.uom, "vi"));
}

export function managedItemSnapshot(doc) {
  const out = {};
  for (const field of ITEM_RECONCILE_MANAGED_SCALARS) {
    out[field] = normalizeScalar(field, doc?.[field]);
  }
  out.uom_conversions = normalizeConversions(doc?.uom_conversions);
  return out;
}

export function diffManagedItem(expectedDoc, actualDoc) {
  const expected = managedItemSnapshot(expectedDoc);
  const actual = managedItemSnapshot(actualDoc);
  const diffs = [];
  for (const field of ITEM_RECONCILE_MANAGED_SCALARS) {
    if (expected[field] !== actual[field]) {
      diffs.push({ field, expected: expected[field], actual: actual[field] });
    }
  }
  if (JSON.stringify(expected.uom_conversions) !== JSON.stringify(actual.uom_conversions)) {
    diffs.push({
      field: "uom_conversions",
      expected: expected.uom_conversions,
      actual: actual.uom_conversions,
    });
  }
  return diffs;
}

/**
 * The only historical mismatch this reconciler is allowed to repair is the
 * pre-canonical finished-door stock UOM: old local records used `m2`, while the
 * canonical Item contract counts physical finished doors as `Bộ` and keeps
 * commercial area in `default_sales_uom=m2` + `measurement_profile=Thành phẩm theo m2`.
 *
 * Every other managed field must already match exactly. This keeps the migration
 * intentionally narrower than a generic Item upsert.
 */
export function classifyFinishedDoorStockUomReconciliation(expectedDoc, actualDoc) {
  if (!actualDoc) return { status: "missing", diffs: [] };
  const diffs = diffManagedItem(expectedDoc, actualDoc);
  if (diffs.length === 0) return { status: "exact", diffs };

  const expected = managedItemSnapshot(expectedDoc);
  const actual = managedItemSnapshot(actualDoc);
  const onlyStockUom = diffs.length === 1 && diffs[0].field === "stock_uom";
  const canonicalFinishedDoor = expected.stock_uom === "Bộ"
    && expected.default_sales_uom === "m2"
    && expected.measurement_profile === "Thành phẩm theo m2"
    && expected.material_stage === "Thành phẩm"
    && expected.supply_type === "Tự sản xuất";
  const knownLegacyValue = actual.stock_uom === "m2";

  if (onlyStockUom && canonicalFinishedDoor && knownLegacyValue) {
    return {
      status: "reconcile_stock_uom",
      diffs,
      update: { stock_uom: "Bộ" },
    };
  }

  return { status: "blocked", diffs };
}
