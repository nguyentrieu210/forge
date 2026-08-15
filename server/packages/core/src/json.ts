type StableJsonPrimitive = string | number | boolean | null;
type StableJsonValue = StableJsonPrimitive | StableJsonObject | StableJsonValue[];
interface StableJsonObject { [key: string]: StableJsonValue | undefined }

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): StableJsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value === "object") {
    const result: Record<string, StableJsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) result[key] = sortValue(child);
    }
    return result;
  }
  return String(value);
}
