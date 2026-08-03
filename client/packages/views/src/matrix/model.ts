import type {
  MatrixCoordinate,
  MatrixMember,
  MatrixNavigatorNode,
} from "./types.js";

/** JSON tuple encoding avoids accidental key collisions when IDs contain punctuation. */
export function matrixCellKey(rowId: string, columnId: string): string {
  return JSON.stringify([rowId, columnId]);
}

export function normalizeMatrixSearch(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function matrixTextMatches(value: unknown, query: string): boolean {
  const tokens = normalizeMatrixSearch(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const haystack = normalizeMatrixSearch(value);
  return tokens.every((token) => haystack.includes(token));
}

export function filterMatrixMembers(members: MatrixMember[], query: string): MatrixMember[] {
  if (!normalizeMatrixSearch(query)) return members;
  return members.filter((member) => matrixTextMatches(
    `${member.label} ${member.subtitle ?? ""} ${member.searchText ?? ""} ${member.id}`,
    query,
  ));
}

/** Keep matching descendants AND their ancestors so hierarchical context never disappears. */
export function filterNavigatorNodes(nodes: MatrixNavigatorNode[], query: string): MatrixNavigatorNode[] {
  if (!normalizeMatrixSearch(query)) return nodes;
  const visit = (node: MatrixNavigatorNode): MatrixNavigatorNode | null => {
    const children = (node.children ?? []).map(visit).filter((child): child is MatrixNavigatorNode => Boolean(child));
    const ownMatch = matrixTextMatches(
      `${node.label} ${node.subtitle ?? ""} ${node.searchText ?? ""} ${node.badge ?? ""} ${node.id}`,
      query,
    );
    if (!ownMatch && !children.length) return null;
    return children.length === (node.children ?? []).length
      ? node
      : { ...node, children };
  };
  return nodes.map(visit).filter((node): node is MatrixNavigatorNode => Boolean(node));
}

export type MatrixMoveKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";

/** Pure roving-focus resolver used by desktop/tablet grid keyboard navigation. */
export function nextMatrixCoordinate(
  current: MatrixCoordinate,
  rowIds: string[],
  columnIds: string[],
  key: MatrixMoveKey,
  edge: boolean,
): MatrixCoordinate | null {
  const rowIndex = rowIds.indexOf(current.rowId);
  const columnIndex = columnIds.indexOf(current.columnId);
  if (rowIndex < 0 || columnIndex < 0 || !rowIds.length || !columnIds.length) return null;

  let nextRow = rowIndex;
  let nextColumn = columnIndex;
  if (key === "ArrowLeft") nextColumn = edge ? 0 : Math.max(0, columnIndex - 1);
  else if (key === "ArrowRight") nextColumn = edge ? columnIds.length - 1 : Math.min(columnIds.length - 1, columnIndex + 1);
  else if (key === "ArrowUp") nextRow = edge ? 0 : Math.max(0, rowIndex - 1);
  else if (key === "ArrowDown") nextRow = edge ? rowIds.length - 1 : Math.min(rowIds.length - 1, rowIndex + 1);
  else if (key === "Home") nextColumn = 0;
  else if (key === "End") nextColumn = columnIds.length - 1;

  const rowId = rowIds[nextRow];
  const columnId = columnIds[nextColumn];
  return rowId && columnId ? { rowId, columnId } : null;
}

export function clampColumnWindow(length: number, start = 0, end = length): { start: number; end: number } {
  const safeStart = Math.max(0, Math.min(Math.trunc(start), length));
  const safeEnd = Math.max(safeStart, Math.min(Math.trunc(end), length));
  return { start: safeStart, end: safeEnd };
}
