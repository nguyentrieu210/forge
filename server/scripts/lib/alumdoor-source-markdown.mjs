const clean = (value) => String(value ?? "").trim();

function parseInlineCells(payload) {
  const cells = {};
  const matcher = /\[(\d+)\]\s*(.*?)(?=\s+·\s+\[\d+\]|$)/g;
  let match;
  while ((match = matcher.exec(String(payload ?? ""))) !== null) {
    cells[Number(match[1])] = clean(match[2]);
  }
  return cells;
}

function lastCellIndex(cells) {
  const indexes = Object.keys(cells).map(Number).filter(Number.isFinite);
  return indexes.length > 0 ? Math.max(...indexes) : null;
}

export function parseAlumdoorIndexedMarkdownRows(text) {
  const rows = [];
  let current = null;
  let lastCell = null;

  const flush = () => {
    if (!current) return;
    rows.push(Object.freeze({
      source_row: current.source_row,
      cells: Object.freeze({ ...current.cells }),
    }));
    current = null;
    lastCell = null;
  };

  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    // Current committed source extracts use one spreadsheet row prefix:
    // "   7 | [0] ... · [1] ...". Keep it open until the next row because
    // long Excel cell values may wrap to the following physical Markdown line.
    const inlineRow = rawLine.match(/^\s*(\d+)\s*\|\s*(.*)$/);
    if (inlineRow) {
      flush();
      const cells = parseInlineCells(inlineRow[2]);
      current = { source_row: Number(inlineRow[1]), cells };
      lastCell = lastCellIndex(cells);
      continue;
    }

    // Compatibility with the earlier verbose fixture export.
    const rowMatch = rawLine.match(/^##\s+Row\s+(\d+)\s*$/i);
    if (rowMatch) {
      flush();
      current = { source_row: Number(rowMatch[1]), cells: {} };
      continue;
    }
    if (!current) continue;

    const cellMatch = rawLine.match(/^-\s*\[(\d+)\]\s*(.*)$/);
    if (cellMatch) {
      const index = Number(cellMatch[1]);
      current.cells[index] = clean(cellMatch[2]);
      lastCell = index;
      continue;
    }

    if (!rawLine.trim() || rawLine.startsWith("#")) continue;

    // Wrapped committed rows can continue a cell value and then introduce more
    // indexed cells, e.g. "THÙNG · [6] 1.4 ..." after a prior "[5] KG/".
    const nextCellOffset = rawLine.search(/\[\d+\]/);
    if (nextCellOffset >= 0) {
      const prefix = clean(rawLine.slice(0, nextCellOffset).replace(/·\s*$/, ""));
      if (prefix && lastCell !== null) {
        current.cells[lastCell] = clean(`${current.cells[lastCell]}${prefix}`);
      }
      const extra = parseInlineCells(rawLine.slice(nextCellOffset));
      Object.assign(current.cells, extra);
      lastCell = lastCellIndex(current.cells);
      continue;
    }

    if (lastCell !== null) {
      current.cells[lastCell] = clean(`${current.cells[lastCell]}${rawLine}`);
    }
  }
  flush();
  return rows;
}

export function readAlumdoorCell(row, index) {
  return clean(row?.cells?.[index]);
}

export function parseAlumdoorSourceIndex(value) {
  const raw = clean(value);
  if (!raw) return null;
  const numeric = Number(raw.replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
}
