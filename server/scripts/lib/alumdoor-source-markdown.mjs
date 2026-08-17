const clean = (value) => String(value ?? "").trim();

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

    // Exported source cells are normally one line, but preserve any wrapped
    // continuation deterministically rather than silently dropping evidence.
    if (lastCell !== null && rawLine.trim() && !rawLine.startsWith("#")) {
      current.cells[lastCell] = clean(`${current.cells[lastCell]} ${rawLine}`);
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
