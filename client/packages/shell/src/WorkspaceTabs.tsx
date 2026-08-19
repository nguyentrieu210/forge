/** @jsxImportSource react */
import { useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@metaforge/ui";

/**
 * Thanh tab bàn làm việc — hình dạng dịch từ vben `tabs-chrome/tabs.vue` (v5.7.0, MIT).
 *
 * Vì sao ERP cần nó: một người bán hàng đang mở đơn của khách A, sếp hỏi tồn kho mã X, xong
 * quay lại đơn dở. Không có tab thì mỗi lần quay lại là nạp lại từ đầu và mất chỗ đang đứng.
 * Đây là lý do vben coi tab là primitive chứ không phải trang trí.
 *
 * Hình học Chrome: các tab CHỒNG mép nhau bằng lề âm, phần nền bo hai góc TRÊN, và hai chân
 * được khoét bằng hai cung tròn 7×7 để tab liền vào mặt bàn làm việc bên dưới. Bỏ một trong ba
 * thứ đó là mất ngay cảm giác "tab", nên chúng đi cùng nhau trong `styles.css`.
 *
 * Màu thì của Forge, không của vben: tab đang mở dùng `--card` — cùng mặt phẳng với vùng nội
 * dung ngay dưới nó, nên hai phần đọc ra là một. vben dùng `bg-primary/15`, hợp với bảng màu
 * của họ nhưng sẽ thành một vệt navy/cam nặng trên diện mạo Forge.
 */

export interface WorkspaceTabItem {
  key: string;
  label: string;
  icon?: ReactNode;
  /** Tab ghim không đóng được (vd Tổng quan). */
  pinned?: boolean;
}

export interface WorkspaceTabsProps {
  tabs: WorkspaceTabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
  className?: string;
}

/** Cung tròn ở chân tab. Bán kính phải khớp `--mf-tab-gap`. */
function TabCurve({ side }: { side: "left" | "right" }) {
  return (
    <svg
      className={cn("mf-tab-curve", side === "left" ? "mf-tab-curve-left" : "mf-tab-curve-right")}
      width="7"
      height="7"
      aria-hidden="true"
    >
      <path d={side === "left" ? "M 0 7 A 7 7 0 0 0 7 0 L 7 7 Z" : "M 0 0 A 7 7 0 0 0 7 7 L 0 7 Z"} />
    </svg>
  );
}

export function WorkspaceTabs({ tabs, activeKey, onSelect, onClose, className }: WorkspaceTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  // Mở một tab nằm ngoài tầm nhìn (qua Ctrl+K, qua link) mà không cuộn tới thì người dùng
  // tưởng tab không mở. Cuộn theo tab đang hoạt động.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeKey]);

  // Chuột giữa đóng tab — thói quen từ trình duyệt, và nhanh hơn nhắm vào dấu ×.
  const onAuxClick = useCallback((event: React.MouseEvent, tab: WorkspaceTabItem) => {
    if (event.button !== 1 || tab.pinned || tabs.length <= 1) return;
    event.preventDefault();
    onClose(tab.key);
  }, [onClose, tabs.length]);

  if (tabs.length === 0) return null;

  return (
    <div className={cn("mf-tabbar", className)} role="tablist" aria-label="Bàn làm việc đang mở">
      <div className="mf-tabbar-scroll" ref={scrollRef}>
        {tabs.map((tab, index) => {
          const active = tab.key === activeKey;
          const closable = !tab.pinned && tabs.length > 1;
          return (
            <div
              key={tab.key}
              ref={active ? activeRef : undefined}
              className="mf-tab"
              data-active={active ? "true" : "false"}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(tab.key)}
              onAuxClick={(event) => onAuxClick(event, tab)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(tab.key); }
                if ((event.key === "Delete" || event.key === "Backspace") && closable) { event.preventDefault(); onClose(tab.key); }
              }}
            >
              {index !== 0 ? <span className="mf-tab-divider" aria-hidden="true" /> : null}
              <span className="mf-tab-bg" aria-hidden="true">
                <span className="mf-tab-bg-fill" />
                <TabCurve side="left" />
                <TabCurve side="right" />
              </span>
              {tab.icon ? <span className="mr-1.5 flex size-4 shrink-0 items-center [&_svg]:size-4">{tab.icon}</span> : null}
              <span className="min-w-0 truncate">{tab.label}</span>
              {closable ? (
                <button
                  type="button"
                  className="mf-tab-close shrink-0"
                  aria-label={`Đóng ${tab.label}`}
                  onClick={(event) => { event.stopPropagation(); onClose(tab.key); }}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Kho tab nằm NGOÀI vòng đời component.
 *
 * Lý do không dùng `useState` trong shell: mỗi route render một `<Shell>` riêng, nên React
 * tháo và dựng lại nó mỗi lần điều hướng — `useState` sẽ reset về rỗng đúng lúc cần nhớ nhất,
 * và tab không bao giờ tích lũy được. Đây chính là mục đích của tab, nên chỗ giữ trạng thái
 * phải sống lâu hơn component.
 *
 * Một kho cho toàn ứng dụng là đủ: một tab chạy một bàn làm việc.
 */
const PERSIST_KEY = "mf-workspace-tabs";

/**
 * Tab sống qua lần tải lại trang.
 *
 * vben bật `tabbar.persist` mặc định, và có lý do nghiệp vụ: F5 hay mất mạng rồi vào lại mà
 * mất sạch chỗ đang mở thì tab thành đồ trang trí. Dùng `sessionStorage` chứ không phải
 * `localStorage` — tab thuộc về PHIÊN làm việc, không nên sống sang lần đăng nhập sau, và
 * càng không nên rò tên chứng từ của người này sang người khác trên máy dùng chung.
 *
 * Chỉ khôi phục `key` và `label`; `icon` là ReactNode nên không tuần tự hoá được, tab phục
 * hồi sẽ không có icon cho tới khi người dùng ghé lại đúng route đó.
 */
function restore(): WorkspaceTabItem[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = JSON.parse(sessionStorage.getItem(PERSIST_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item): item is { key: string; label: string; pinned?: boolean } =>
        Boolean(item) && typeof item === "object"
        && typeof (item as { key?: unknown }).key === "string"
        && typeof (item as { label?: unknown }).label === "string")
      .map((item) => ({ key: item.key, label: item.label, pinned: item.pinned }));
  } catch { return []; }
}

let store: WorkspaceTabItem[] = restore();
const listeners = new Set<() => void>();

function publish(next: WorkspaceTabItem[]) {
  if (next === store) return;
  store = next;
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.setItem(PERSIST_KEY, JSON.stringify(next.map(({ key, label, pinned }) => ({ key, label, pinned }))));
    } catch { /* hết quota hoặc chế độ riêng tư: tab vẫn chạy, chỉ không sống qua F5 */ }
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Xoá kho khi đổi phiên/đổi app — tab của tenant cũ không được sống sang tenant mới. */
export function resetWorkspaceTabs() {
  publish([]);
  if (typeof sessionStorage !== "undefined") {
    try { sessionStorage.removeItem(PERSIST_KEY); } catch { /* bỏ qua */ }
  }
}

/**
 * Giữ danh sách tab theo lịch sử điều hướng.
 *
 * Quy tắc cố ý đơn giản: mỗi đường dẫn là một tab, mở lại đường dẫn đã có thì nhảy về tab cũ
 * chứ không nhân bản. `pinnedKey` không bao giờ đóng được, để bàn làm việc không bao giờ trống.
 *
 * `max` chặn tab mọc vô hạn — vben mặc định không giới hạn, nhưng một ERP mở cả ngày sẽ tích
 * hàng chục tab rồi thanh cuộn thành vô dụng. Quá ngưỡng thì bỏ tab CŨ NHẤT không hoạt động.
 */
export function useWorkspaceTabs({
  activeKey,
  label,
  icon,
  pinnedKey,
  max = 12,
}: {
  activeKey: string;
  label: string;
  icon?: ReactNode;
  pinnedKey?: string;
  max?: number;
}) {
  const tabs = useSyncExternalStore(subscribe, () => store, () => store);

  useEffect(() => {
    if (!activeKey || !label) return;
    const current = store;
    const found = current.find((tab) => tab.key === activeKey);
    if (found) {
      // Nhãn có thể tới muộn (tên chứng từ chỉ biết sau khi nạp) — cập nhật tại chỗ.
      if (found.label !== label) {
        publish(current.map((tab) => tab.key === activeKey ? { ...tab, label, icon } : tab));
      }
      return;
    }
    const next = [...current, { key: activeKey, label, icon, pinned: activeKey === pinnedKey }];
    if (next.length <= max) { publish(next); return; }
    const victim = next.find((tab) => !tab.pinned && tab.key !== activeKey);
    publish(victim ? next.filter((tab) => tab.key !== victim.key) : next);
  }, [activeKey, label, icon, pinnedKey, max]);

  const close = useCallback((key: string) => {
    publish(store.filter((tab) => tab.key !== key));
  }, []);

  /** Sau khi đóng tab ĐANG mở, phải trả về tab kề để bàn làm việc không rỗng. */
  const neighbourOf = useCallback((key: string): string | undefined => {
    const index = store.findIndex((tab) => tab.key === key);
    if (index < 0) return undefined;
    return (store[index + 1] ?? store[index - 1])?.key;
  }, []);

  return { tabs, close, neighbourOf };
}
