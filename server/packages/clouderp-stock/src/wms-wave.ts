import { errors } from "../../core/src/index.js";

export interface WaveLine {
  line_id: string;
  group_key: string;
  sequence: number;
  qty_micros: number;
}

export interface PickWave {
  wave_key: string;
  group_key: string;
  lines: WaveLine[];
  total_qty_micros: number;
}

function text(value: unknown): string { return String(value ?? "").normalize("NFC").trim(); }
function positive(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw errors.validation(`${field} must be a positive safe integer`);
  return value;
}

/**
 * Deterministically partitions caller-grouped pick demand into waves.
 * Route/zone/customer grouping policy stays outside this primitive and is supplied as group_key.
 */
export function buildPickWaves(lines: WaveLine[], maxLinesPerWave: number): PickWave[] {
  const maxLines = positive(maxLinesPerWave, "maxLinesPerWave");
  const ids = new Set<string>();
  const normalized = lines.map((line, index) => {
    const lineId = text(line.line_id);
    const groupKey = text(line.group_key);
    if (!lineId || !groupKey) throw errors.validation(`lines[${index}] requires line_id and group_key`);
    if (ids.has(lineId)) throw errors.validation(`Duplicate wave line ${lineId}`);
    ids.add(lineId);
    return { ...line, line_id: lineId, group_key: groupKey, sequence: positive(line.sequence, `lines[${index}].sequence`), qty_micros: positive(line.qty_micros, `lines[${index}].qty_micros`) };
  }).sort((a, b) => a.group_key.localeCompare(b.group_key) || a.sequence - b.sequence || a.line_id.localeCompare(b.line_id));

  const byGroup = new Map<string, WaveLine[]>();
  for (const line of normalized) {
    const group = byGroup.get(line.group_key) ?? [];
    group.push(line);
    byGroup.set(line.group_key, group);
  }

  const waves: PickWave[] = [];
  for (const [groupKey, group] of byGroup) {
    for (let offset = 0, waveIndex = 1; offset < group.length; offset += maxLines, waveIndex += 1) {
      const chunk = group.slice(offset, offset + maxLines);
      const total = chunk.reduce((sum, line) => {
        const next = sum + line.qty_micros;
        if (!Number.isSafeInteger(next)) throw errors.validation("Wave quantity exceeds safe integer bounds");
        return next;
      }, 0);
      waves.push({ wave_key: `${groupKey}#${String(waveIndex).padStart(3, "0")}`, group_key: groupKey, lines: chunk, total_qty_micros: total });
    }
  }
  return waves;
}
