/** 13 bảng màu dùng chung cho mọi app MetaForge. */
import { useCallback, useEffect, useState } from "react";

export type BrandMode =
  | "zinc" | "blue" | "warm"
  | "sakura" | "emerald" | "ocean" | "violet" | "indigo"
  | "teal" | "amber" | "rose" | "aurora" | "sunset";

const KEY = "metaforge-brand";
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
  const set = useCallback((value: BrandMode) => {
    if (controlled === undefined) setUserBrand(value);
  }, [controlled]);
  return [controlled ?? userBrand, set];
}
