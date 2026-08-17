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
    // Current committed source extracts use one physical line per spreadsheet
    // row: "   7 | [0] ... · [1] ...". Parse this format first.
    const inlineRow = rawLine.match(/^\s*(\d+)\s*\|\s*(.*)$/);
    if (inlineRow) {
      flush();
      rows.push(Object.freeze({
        source_row: Number(inlineRow[1]),
        cells: Object.freeze(parseInlineCells(inlineRow[2])),
      }));
      continue;
    }

    // Keep compatibility with the earlier verbose export used by focused
    // fixtures: "## Row N" followed by "- [i] value" cells.
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
