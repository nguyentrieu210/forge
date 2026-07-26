// A narrow, client-side "recent documents" list. Phase 1/2 has no server-side
// document-list endpoint (only GET /documents/{doctype}/{name} and the two
// report views), so this deliberately tracks ONLY the documents this browser
// has created/loaded — it is a session convenience, not an authoritative index.
import { useSyncExternalStore } from "react";

export interface RecentDoc {
  doctype: string;
  name: string;
  docstatus: number;
  version: number;
  status?: string;
  customer?: string;
  amount?: string;
  updated_at: number;
}

const KEY = "cloudforge_recent_docs";
const LIMIT = 40;

type Listener = () => void;
const listeners = new Set<Listener>();

function read(): RecentDoc[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RecentDoc[]) : [];
  } catch {
    return [];
  }
}

let cache: RecentDoc[] = read();

function commit(next: RecentDoc[]): void {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* ignore quota / private-mode failures — the in-memory cache still works */
  }
  listeners.forEach((listener) => listener());
}

export function rememberDoc(entry: Omit<RecentDoc, "updated_at">): void {
  const withoutThis = cache.filter((doc) => !(doc.doctype === entry.doctype && doc.name === entry.name));
  commit([{ ...entry, updated_at: Date.now() }, ...withoutThis].slice(0, LIMIT));
}

export function forgetDoc(doctype: string, name: string): void {
  commit(cache.filter((doc) => !(doc.doctype === doctype && doc.name === name)));
}

export function clearDocs(): void {
  commit([]);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): RecentDoc[] {
  return cache;
}

export function useRecentDocs(): RecentDoc[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
