import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../packages/shell/src/AppShell.tsx", import.meta.url), "utf8");

const required = [
  'id="mf-primary-navigation"',
  'role="navigation"',
  'aria-controls="mf-primary-navigation"',
  'aria-expanded={mobileOpen}',
  'if (event.key !== "Escape") return;',
  'className="hidden min-w-0 shrink-0 items-center lg:flex"',
  'Đang ngoại tuyến. Dữ liệu chưa tải và thao tác lưu cần kết nối mạng.',
  'className="mf-shell flex h-dvh w-full overflow-hidden bg-background text-foreground"',
  'const mobileMenuCloseRef = useRef<HTMLButtonElement | null>(null);',
  'window.requestAnimationFrame(() => mobileMenuCloseRef.current?.focus());',
  'ref={mobileMenuCloseRef}',
];

for (const invariant of required) {
  if (!source.includes(invariant)) {
    throw new Error(`AppShell mobile invariant missing: ${invariant}`);
  }
}

const misleadingOfflineCopy = "Bạn vẫn có thể xem dữ liệu đã tải; các thay đổi sẽ cần gửi lại khi có mạng.";
if (source.includes(misleadingOfflineCopy)) {
  throw new Error("AppShell must not claim offline cache/write-queue behavior before it exists.");
}
if (source.includes('className="mf-shell flex h-screen w-full')) {
  throw new Error("AppShell must use the dynamic viewport instead of legacy 100vh on mobile.");
}

console.log("AppShell mobile/a11y invariants: PASS");
