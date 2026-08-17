export function normalizeProcessRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      id: Number(row?.ProcessId ?? row?.id),
      parentId: Number(row?.ParentProcessId ?? row?.parentId),
      name: String(row?.Name ?? row?.name ?? ''),
      commandLine: String(row?.CommandLine ?? row?.commandLine ?? ''),
    }))
    .filter((row) => Number.isInteger(row.id) && row.id > 0);
}

export function managedProcessTree(rows, rootPid) {
  const root = Number(rootPid);
  if (!Number.isInteger(root) || root <= 0) return [];
  const processes = normalizeProcessRows(rows);
  const byParent = new Map();
  for (const process of processes) {
    const bucket = byParent.get(process.parentId) ?? [];
    bucket.push(process);
    byParent.set(process.parentId, bucket);
  }

  const result = [];
  const seen = new Set();
  const walk = (pid, depth) => {
    if (seen.has(pid)) return;
    seen.add(pid);
    const current = processes.find((process) => process.id === pid);
    if (current) result.push({ ...current, depth });
    for (const child of byParent.get(pid) ?? []) walk(child.id, depth + 1);
  };
  walk(root, 0);
  return result.sort((a, b) => b.depth - a.depth || b.id - a.id);
}
