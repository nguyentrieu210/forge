const clean = (value) => String(value ?? '').normalize('NFC').trim();

function normalizedCode(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

export function isFullSetCompositionParent(itemCode) {
  return normalizedCode(itemCode).includes('TRONBO');
}

export function buildSalesBomCompositionTemplates(source) {
  if (!['alumdoor-canonical-bom-importable/v1', 'alumdoor-canonical-bom-importable/v2'].includes(source?.format)
    || !Array.isArray(source.boms)) {
    throw new Error('Expected alumdoor-canonical-bom-importable/v1 or /v2');
  }

  const templates = [];
  const seenParents = new Set();
  for (const bom of source.boms) {
    const parent = clean(bom?.item);
    if (!isFullSetCompositionParent(parent)) continue;
    if (!parent) throw new Error('Sales BOM composition has a blank parent Item');
    if (seenParents.has(parent)) throw new Error(`Sales BOM composition has duplicate parent Item ${parent}`);
    seenParents.add(parent);

    const lines = Array.isArray(bom?.lines) ? bom.lines : [];
    if (!lines.length) throw new Error(`${parent}: sales BOM composition has no child Item`);
    const componentRules = lines.map((line, index) => {
      const itemCode = clean(line?.item_code);
      if (!itemCode) throw new Error(`${parent}: component ${index + 1} has a blank Item code`);
      const componentKey = `ROW-${String(index + 1).padStart(3, '0')}`;
      return {
        rule_code: `${parent}:${componentKey}`,
        component_key: componentKey,
        item_code: itemCode,
        priority: 0,
        sequence: index + 1,
        quantity_formula_json: JSON.stringify({
          kind: 'DEFERRED',
          reason: 'sales_composition_only',
          source_value: line?.source_value ?? null,
          source_formula: line?.source_formula_text ?? line?.quantity_formula_json ?? null,
        }),
        source_row: Number.isFinite(Number(line?.source_row)) ? Number(line.source_row) : undefined,
        source_uom: clean(line?.source_uom) || undefined,
        source_formula: clean(line?.source_formula_text),
      };
    });
    const requiredKeys = componentRules.map((row) => row.component_key);
    templates.push({
      doctype: 'BOM Template',
      template_code: parent,
      item_code: parent,
      conditions_json: JSON.stringify({ item_code: parent }),
      required_context_fields_json: JSON.stringify(['item_code']),
      required_component_keys_json: JSON.stringify(requiredKeys),
      source_status: 'COMPOSITION',
      source_ref: clean(bom?.source_ref) || clean(source?.source?.workbook) || clean(source?.source),
      deferred_components_json: JSON.stringify(lines),
      component_rules: componentRules,
      note: 'Danh sách cấu thành dùng trên đơn bán hàng; SL, ĐVT bán và kích thước được tính từ dòng thành phẩm cha, không dùng định mức sản xuất.',
    });
  }

  templates.sort((left, right) => left.item_code.localeCompare(right.item_code, 'vi'));
  return templates;
}

function normalizedRule(rule) {
  return {
    component_key: clean(rule?.component_key),
    item_code: clean(rule?.item_code),
    sequence: Number(rule?.sequence) || 0,
  };
}

export function salesBomCompositionSignature(template) {
  return JSON.stringify({
    template_code: clean(template?.template_code),
    item_code: clean(template?.item_code),
    source_status: clean(template?.source_status),
    conditions: JSON.parse(clean(template?.conditions_json) || '{}'),
    required_component_keys: JSON.parse(clean(template?.required_component_keys_json) || '[]'),
    components: (Array.isArray(template?.component_rules) ? template.component_rules : [])
      .map(normalizedRule)
      .sort((left, right) => left.sequence - right.sequence || left.component_key.localeCompare(right.component_key, 'vi')),
  });
}
