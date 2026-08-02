/** 13 bảng màu dùng chung cho mọi app MetaForge. */
import { useCallback, useEffect, useState } from "react";

export type BrandMode =
  | "zinc" | "blue" | "warm"
  | "sakura" | "emerald" | "ocean" | "violet" | "indigo"
  | "teal" | "amber" | "rose" | "aurora" | "sunset";

const KEY = "metaforge-brand";
const CHANGE_EVENT = "metaforge-brand-change";
export const BRANDS: { id: BrandMode; label: string; swatch: string }[] = [
  { id: "zinc", label: "Than chì", swatch: "#18181b" },
  { id: "blue", label: "Xanh điện", swatch: "#1b4dff" },
  { id: "warm", label: "Đất nung", swatch: "#b15b2e" },
  { id: "sakura", label: "Hồng cánh sen", swatch: "linear-gradient(135deg,#be185d,#ec4899 55%,#f472b6)" },
  { id: "emerald", label: "Ngọc lục bảo", swatch: "#059669" },
  { id: "ocean", label: "Đại dương", swatch: "linear-gradient(135deg,#0284c7,#22d3ee)" },
  { id: "violet", label: "Tím hoàng gia", swatch: "#7c3aed" },
  { id: "indigo", label: "Chàm đêm", swatch: "#4f46e5" },
  { id: "teal", label: "Xanh ngọc", swatch: "#0f766e" },
  { id: "amber", label: "Hổ phách", swatch: "#d97706" },
  { id: "rose", label: "Thạch anh hồng", swatch: "#e11d48" },
  { id: "aurora", label: "Cực quang", swatch: "linear-gradient(135deg,#14b8a6,#8b5cf6)" },
  { id: "sunset", label: "Hoàng hôn", swatch: "linear-gradient(135deg,#f97316,#ec4899)" },
];

export const BRAND_COLOR_COUNT = BRANDS.length;

export function isBrandMode(value: unknown): value is BrandMode {
  return BRANDS.some((brand) => brand.id === value);
}

export function applyBrand(brand: BrandMode): void {
  if (typeof document === "undefined") return;
  if (brand === "zinc") document.documentElement.removeAttribute("data-brand");
  else document.documentElement.setAttribute("data-brand", brand);
}

export function useBrand(controlled?: BrandMode, defaultBrand: BrandMode = "blue"): [BrandMode, (b: BrandMode) => void] {
  const [userBrand, setUserBrand] = useState<BrandMode>(() => {
    if (typeof localStorage === "undefined") return defaultBrand;
    const value = localStorage.getItem(KEY);
    return isBrandMode(value) ? value : defaultBrand;
  });
  useEffect(() => {
    const effective = controlled ?? userBrand;
    applyBrand(effective);
    if (controlled === undefined && typeof localStorage !== "undefined") {
      localStorage.setItem(KEY, effective);
    }
  }, [controlled, userBrand]);

  // Có thể có nhiều shell/hộp chọn màu cùng mount trong một runtime. Khi một nơi đổi màu,
  // các nơi còn lại phải cập nhật dấu chọn ngay thay vì đợi reload trang.
  useEffect(() => {
    if (controlled !== undefined || typeof window === "undefined" || typeof localStorage === "undefined") return;
    const sync = () => {
      const value = localStorage.getItem(KEY);
      if (isBrandMode(value)) setUserBrand(value);
    };
    const onStorage = (event: StorageEvent) => { if (event.key === KEY) sync(); };
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, [controlled]);

  const set = useCallback((value: BrandMode) => {
    if (controlled !== undefined) return;
    setUserBrand(value);
    applyBrand(value);
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, value);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [controlled]);
  return [controlled ?? userBrand, set];
}
