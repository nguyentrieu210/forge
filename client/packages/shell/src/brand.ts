/** Bảng màu dùng chung cho mọi app MetaForge. */
import { useCallback, useEffect, useState } from "react";

export type BrandMode =
  | "zinc" | "blue" | "warm"
  | "sakura" | "emerald" | "ocean" | "violet" | "indigo"
  | "teal" | "amber" | "rose" | "aurora" | "sunset";

const KEY = "metaforge-brand";
export const BRANDS: { id: BrandMode; label: string; swatch: string }[] = [
  { id: "zinc", label: "Zinc", swatch: "#18181b" },
  { id: "blue", label: "Electric Blue", swatch: "#1b4dff" },
  { id: "warm", label: "Warm Terracotta", swatch: "#b15b2e" },
  { id: "sakura", label: "Sakura Pink", swatch: "linear-gradient(135deg,#f472b6,#fbcfe8)" },
  { id: "emerald", label: "Emerald", swatch: "#059669" },
  { id: "ocean", label: "Ocean Gradient", swatch: "linear-gradient(135deg,#0284c7,#22d3ee)" },
  { id: "violet", label: "Royal Violet", swatch: "#7c3aed" },
  { id: "indigo", label: "Indigo Night", swatch: "#4f46e5" },
  { id: "teal", label: "Teal Mint", swatch: "#0f766e" },
  { id: "amber", label: "Amber Gold", swatch: "#d97706" },
  { id: "rose", label: "Rose Quartz", swatch: "#e11d48" },
  { id: "aurora", label: "Aurora Gradient", swatch: "linear-gradient(135deg,#14b8a6,#8b5cf6)" },
  { id: "sunset", label: "Sunset Gradient", swatch: "linear-gradient(135deg,#f97316,#ec4899)" },
];

export function isBrandMode(value: unknown): value is BrandMode {
  return BRANDS.some((brand) => brand.id === value);
}

export function applyBrand(brand: BrandMode): void {
  if (typeof document === "undefined") return;
  if (brand === "zinc") document.documentElement.removeAttribute("data-brand");
  else document.documentElement.setAttribute("data-brand", brand);
}

export function useBrand(): [BrandMode, (b: BrandMode) => void] {
  const [brand, setBrand] = useState<BrandMode>(() => {
    if (typeof localStorage === "undefined") return "blue";
    const value = localStorage.getItem(KEY);
    return isBrandMode(value) ? value : "blue";
  });
  useEffect(() => {
    applyBrand(brand);
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, brand);
  }, [brand]);
  const set = useCallback((value: BrandMode) => setBrand(value), []);
  return [brand, set];
}
