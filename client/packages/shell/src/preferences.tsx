/** @jsxImportSource react */
import { useCallback, useEffect, useSyncExternalStore, type ReactNode } from "react";
import type { AppDesign } from "@metaforge/core";
import { Button, cn } from "@metaforge/ui";

/**
 * Tuỳ chọn hiển thị của NGƯỜI DÙNG, chồng lên mặc định của APP.
 *
 * Bối cảnh: hợp đồng `design` (mật độ / bo góc / bề rộng nội dung) đã nối hoàn chỉnh từ
 * `brief.schema.json` → `AppDesign` → `applyDesign()` → chín nhánh CSS trong `styles.css`, và
 * sáu app App Factory đang khai thật. Nhưng nó là mặc định do APP đặt — **người dùng không có
 * đường nào chạm tới**. Với Alumdoor, brief không khai `design` nên chín nhánh CSS đó chưa ai
 * từng nhìn thấy.
 *
 * vben giải bằng một bảng tuỳ chọn: app đặt mặc định, người dùng chỉnh trên máy mình và lựa
 * chọn đó được nhớ. Đây là bản Forge của ý đó.
 *
 * Thứ tự áp: `applyDesign(manifest.design)` chạy trước (mặc định của app), rồi lớp này ghi đè
 * những gì người dùng đã chọn. Chưa chọn thì KHÔNG động vào — mặc định của app giữ nguyên,
 * chứ không bị ghi đè bằng một giá trị mà người dùng chưa hề bấm.
 *
 * Lưu `localStorage` chứ không phải `sessionStorage`: đây là sở thích lâu dài của người dùng
 * trên MÁY này, khác với tab bàn làm việc vốn thuộc về phiên.
 */

export type DesignPreference = Partial<AppDesign>;

const KEY = "mf-design-preference";

/** Cùng bảng ánh xạ với `design.ts` — hai nơi lệch nhau là thuộc tính dán sai chỗ. */
const ATTRIBUTES = {
  density: "data-density",
  radius: "data-radius",
  content_width: "data-content-width",
} as const;

const OPTIONS = {
  density: [
    { value: "compact", label: "Gọn" },
    { value: "comfortable", label: "Vừa" },
    { value: "touch", label: "Rộng" },
  ],
  radius: [
    { value: "square", label: "Vuông" },
    { value: "soft", label: "Mềm" },
    { value: "round", label: "Tròn" },
  ],
  content_width: [
    { value: "contained", label: "Hẹp" },
    { value: "wide", label: "Rộng" },
    { value: "fluid", label: "Tràn" },
  ],
} as const;

function read(): DesignPreference {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    if (!raw || typeof raw !== "object") return {};
    const value = raw as Record<string, unknown>;
    const out: DesignPreference = {};
    for (const key of Object.keys(ATTRIBUTES) as Array<keyof typeof ATTRIBUTES>) {
      const picked = value[key];
      if (typeof picked === "string" && OPTIONS[key].some((option) => option.value === picked)) {
        out[key] = picked as never;
      }
    }
    return out;
  } catch { return {}; }
}

let store: DesignPreference = read();
const listeners = new Set<() => void>();

/** Dán lên `<html>`. Chỉ đụng khoá mà người dùng ĐÃ chọn — phần còn lại để app quyết. */
function stamp(preference: DesignPreference) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [key, attribute] of Object.entries(ATTRIBUTES) as Array<[keyof typeof ATTRIBUTES, string]>) {
    const value = preference[key];
    if (value) root.setAttribute(attribute, value);
  }
}

function publish(next: DesignPreference) {
  store = next;
  if (typeof localStorage !== "undefined") {
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* chế độ riêng tư */ }
  }
  stamp(next);
  for (const listener of listeners) listener();
}

export function useDesignPreference() {
  const preference = useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => store,
    () => store,
  );

  // Dán lại sau mỗi lần `applyDesign` chạy (đổi app, tải lại manifest) — nếu không, mặc định
  // của app sẽ ghi đè lựa chọn người dùng và họ tưởng thiết lập bị mất.
  useEffect(() => { stamp(store); });

  const set = useCallback(<K extends keyof typeof ATTRIBUTES>(key: K, value: DesignPreference[K]) => {
    publish({ ...store, [key]: value });
  }, []);

  const reset = useCallback(() => {
    if (typeof localStorage !== "undefined") {
      try { localStorage.removeItem(KEY); } catch { /* bỏ qua */ }
    }
    // Gỡ thuộc tính để mặc định của app hiện trở lại. KHÔNG đoán giá trị mặc định là gì —
    // chỉ app biết, và `applyDesign` sẽ dán lại ở lần render tới.
    if (typeof document !== "undefined") {
      for (const attribute of Object.values(ATTRIBUTES)) document.documentElement.removeAttribute(attribute);
    }
    publish({});
  }, []);

  return { preference, set, reset };
}

/** Một nhóm tuỳ chọn có tiêu đề — tương đương `blocks/block.vue` của vben. */
function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border-b py-4 last:border-b-0">
      <h3 className="text-[13px] font-semibold">{title}</h3>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">{children}</div>
    </section>
  );
}

function Choice({ active, label, onSelect }: { active: boolean; label: string; onSelect: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={active}
      onClick={onSelect}
      className={cn("h-8 justify-center text-xs font-normal", active && "border-primary bg-accent font-medium text-accent-foreground")}
    >
      {label}
    </Button>
  );
}

/**
 * Thân bảng tuỳ chọn. Đặt trong Sheet/Dialog của app — component này không tự dựng khung, để
 * shell quyết nó xuất hiện ở đâu.
 */
export function DesignPreferencePanel() {
  const { preference, set, reset } = useDesignPreference();
  const dirty = Object.keys(preference).length > 0;

  return (
    <div className="flex flex-col">
      <Block title="Mật độ" hint="Ảnh hưởng chiều cao hàng, mục menu và đệm của mọi màn.">
        {OPTIONS.density.map((option) => (
          <Choice key={option.value} label={option.label} active={preference.density === option.value} onSelect={() => set("density", option.value)} />
        ))}
      </Block>

      <Block title="Bo góc" hint="Nút, ô nhập và panel.">
        {OPTIONS.radius.map((option) => (
          <Choice key={option.value} label={option.label} active={preference.radius === option.value} onSelect={() => set("radius", option.value)} />
        ))}
      </Block>

      <Block title="Bề rộng nội dung" hint="Giới hạn chiều ngang vùng làm việc trên màn hình lớn.">
        {OPTIONS.content_width.map((option) => (
          <Choice key={option.value} label={option.label} active={preference.content_width === option.value} onSelect={() => set("content_width", option.value)} />
        ))}
      </Block>

      <div className="pt-4">
        <Button type="button" variant="ghost" size="sm" disabled={!dirty} onClick={reset} className="text-xs">
          Trả về mặc định của ứng dụng
        </Button>
        {!dirty ? <p className="mt-1 text-xs text-muted-foreground">Đang dùng mặc định do ứng dụng đặt.</p> : null}
      </div>
    </div>
  );
}
