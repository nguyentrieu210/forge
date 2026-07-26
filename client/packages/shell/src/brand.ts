/**
 * Brand — 3 visual direction import từ MetaForge Prototype: zinc (mặc định) · blue · warm.
 * Stamp data-brand lên <html> (cùng element với data-theme). zinc = gỡ attr (rơi về :root).
 */
import { useCallback, useEffect, useState } from "react";

export type BrandMode = "zinc" | "blue" | "warm";

const KEY = "metaforge-brand";
export const BRANDS: { id: BrandMode; label: string }[] = [
  { id: "zinc", label: "Zinc" },
  { id: "blue", label: "Electric Blue" },
  { id: "warm", label: "Warm Terracotta" },
];

export function applyBrand(brand: BrandMode): void {
  if (typeof document === "undefined") return;
  if (brand === "zinc") document.documentElement.removeAttribute("data-brand");
  else document.documentElement.setAttribute("data-brand", brand);
}

export function useBrand(): [BrandMode, (b: BrandMode) => void] {
  const [brand, setBrand] = useState<BrandMode>(() => {
    if (typeof localStorage === "undefined") return "blue";
    const v = localStorage.getItem(KEY);
    return v === "blue" || v === "warm" || v === "zinc" ? v : "blue"; // default Blue (design default)
  });
  useEffect(() => {
    applyBrand(brand);
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, brand);
  }, [brand]);
  const set = useCallback((b: BrandMode) => setBrand(b), []);
  return [brand, set];
}
