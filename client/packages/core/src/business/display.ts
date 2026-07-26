export interface DisplayValueRequest {
  doctype: string;
  name: string;
}
export interface DisplayValueResult extends DisplayValueRequest {
  label: string;
  description?: string;
  image?: string;
  missing?: boolean;
}

export function displayValueKey(doctype: string, name: string): string {
  return `${doctype}::${name}`;
}
