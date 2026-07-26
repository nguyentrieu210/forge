/**
 * Theme — 3 chế độ (light/dark/system). Stamp data-theme lên <html> (khớp Artifact/CSS var).
 */
import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

const KEY = "metaforge-theme";

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolveTheme(mode));
}

export function useTheme(): [ThemeMode, (m: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof localStorage === "undefined") return "system";
    return (localStorage.getItem(KEY) as ThemeMode) ?? "system";
  });
  useEffect(() => {
    applyTheme(mode);
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, mode);
  }, [mode]);

  // Chế độ "system" TRƯỚC ĐÂY chỉ đọc prefers-color-scheme đúng 1 lần lúc mount: người dùng đổi
  // theme của máy (hoặc tới giờ tự chuyển tối) mà app đang mở thì giao diện đứng yên, phải tải lại
  // trang mới đổi. Nghe media query để bám theo ngay.
  useEffect(() => {
    if (mode !== "system" || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const set = useCallback((m: ThemeMode) => setMode(m), []);
  return [mode, set];
}
