import { useEffect, useMemo, useState } from "react";
import type { NavItem, WorkspaceTab } from "./AppShell.js";

const STORAGE_KEY = "mf-shell-v3-workspace-tabs";

interface StoredWorkspaceTabs {
  keys?: string[];
  pinned?: string[];
}

function loadStored(): StoredWorkspaceTabs {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as StoredWorkspaceTabs;
  } catch {
    return {};
  }
}

function store(keys: string[], pinned: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ keys, pinned: [...pinned] }));
  } catch {
    // Private mode / denied storage: workspace tabs remain session-local.
  }
}

function isWorkspaceRoute(item: NavItem): boolean {
  return !item.disabledReason && !item.key.startsWith("workspace-module:");
}

export interface WorkspaceTabState {
  tabs: WorkspaceTab[];
  navigate: (key: string) => void;
  close: (key: string) => void;
  pin: (key: string, pinned: boolean) => void;
  closeOthers: (key: string) => void;
  closeRight: (key: string) => void;
  refresh: (key: string) => void;
  reorder: (key: string, direction: "left" | "right") => void;
}

/**
 * Local shell-only workspace history. It stores route keys and presentation preferences,
 * never document/query data. Apps that own richer route/record/dirty truth can override
 * the complete workspaceTabs contract on AppShellProps.
 */
export function useWorkspaceTabState(
  nav: NavItem[],
  activeKey: string,
  onNavigate: (key: string) => void,
): WorkspaceTabState {
  const itemsByKey = useMemo(
    () => new Map(nav.filter(isWorkspaceRoute).map((item) => [item.key, item] as const)),
    [nav],
  );
  const [keys, setKeys] = useState<string[]>(() => loadStored().keys ?? []);
  const [pinnedKeys, setPinnedKeys] = useState<Set<string>>(() => new Set(loadStored().pinned ?? []));

  useEffect(() => {
    setKeys((current) => {
      const valid = current.filter((key) => itemsByKey.has(key));
      if (itemsByKey.has(activeKey) && !valid.includes(activeKey)) valid.push(activeKey);
      return valid.length === current.length && valid.every((key, index) => key === current[index]) ? current : valid;
    });
    setPinnedKeys((current) => {
      const valid = new Set([...current].filter((key) => itemsByKey.has(key)));
      return valid.size === current.size ? current : valid;
    });
  }, [activeKey, itemsByKey]);

  useEffect(() => { store(keys, pinnedKeys); }, [keys, pinnedKeys]);

  const tabs = useMemo<WorkspaceTab[]>(() => keys.flatMap((key) => {
    const item = itemsByKey.get(key);
    if (!item) return [];
    return [{
      key,
      label: item.label,
      icon: item.icon,
      pinned: pinnedKeys.has(key),
      closeable: !pinnedKeys.has(key),
    }];
  }), [itemsByKey, keys, pinnedKeys]);

  const fallbackKey = useMemo(
    () => nav.find((item) => item.key === "__overview" && !item.disabledReason)?.key,
    [nav],
  );

  const close = (key: string) => {
    if (pinnedKeys.has(key)) return;
    const index = keys.indexOf(key);
    if (index < 0) return;
    const next = keys.filter((entry) => entry !== key);
    setKeys(next);
    if (activeKey === key) {
      const target = next[Math.min(index, Math.max(0, next.length - 1))] ?? fallbackKey;
      if (target && target !== key) onNavigate(target);
    }
  };

  const pin = (key: string, pinned: boolean) => {
    if (!itemsByKey.has(key)) return;
    setPinnedKeys((current) => {
      const next = new Set(current);
      pinned ? next.add(key) : next.delete(key);
      return next;
    });
  };

  const closeOthers = (key: string) => {
    if (!keys.includes(key)) return;
    setKeys((current) => current.filter((entry) => entry === key || pinnedKeys.has(entry)));
    if (activeKey !== key && !pinnedKeys.has(activeKey)) onNavigate(key);
  };

  const closeRight = (key: string) => {
    const index = keys.indexOf(key);
    if (index < 0) return;
    const keep = new Set(keys.slice(0, index + 1));
    for (const pinned of pinnedKeys) keep.add(pinned);
    const next = keys.filter((entry) => keep.has(entry));
    setKeys(next);
    if (!next.includes(activeKey)) onNavigate(key);
  };

  const reorder = (key: string, direction: "left" | "right") => {
    setKeys((current) => {
      const index = current.indexOf(key);
      const target = direction === "left" ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  return {
    tabs,
    navigate: onNavigate,
    close,
    pin,
    closeOthers,
    closeRight,
    refresh: onNavigate,
    reorder,
  };
}
