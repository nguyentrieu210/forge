import { readFileSync } from "node:fs";

const entry = readFileSync(new URL("../packages/shell/src/AppShell.tsx", import.meta.url), "utf8");
const chrome = readFileSync(new URL("../packages/shell/src/ShellV3Chrome.tsx", import.meta.url), "utf8");

if (!entry.includes("return <ShellV3Chrome {...props} />;")) {
  throw new Error("AppShell must delegate presentation to the decomposed V3 chrome.");
}

const required = [
  'id="mf-primary-navigation"',
  'role="navigation"',
  '<Sheet open={open} onOpenChange={onOpenChange}>',
  '<SheetContent side="left"',
  'onClick={() => setMobileOpen(true)}',
  'aria-label="Mở điều hướng"',
  'open={mobileOpen}',
  'onOpenChange={setMobileOpen}',
  'className="hidden min-w-0 shrink-0 items-center lg:flex"',
  'Đang ngoại tuyến. Dữ liệu chưa tải và thao tác lưu cần kết nối mạng.',
  'mf-shell flex h-dvh w-full overflow-hidden bg-background text-foreground',
  'href="#mf-main-content"',
  'id="mf-main-content"',
];

for (const invariant of required) {
  if (!chrome.includes(invariant)) {
    throw new Error(`Shell V3 mobile/a11y invariant missing: ${invariant}`);
  }
}

// Mobile navigation is a Radix Sheet, so ESC/focus trapping/restoration belongs to the
// shared dialog primitive instead of being reimplemented with shell-specific key handlers.
if (!chrome.includes('import {') || !chrome.includes('Sheet,') || !chrome.includes('SheetContent,')) {
  throw new Error("Shell V3 mobile navigation must use the shared Sheet primitive.");
}

const combined = `${entry}\n${chrome}`;
const misleadingOfflineCopy = "Bạn vẫn có thể xem dữ liệu đã tải; các thay đổi sẽ cần gửi lại khi có mạng.";
if (combined.includes(misleadingOfflineCopy)) {
  throw new Error("AppShell must not claim offline cache/write-queue behavior before it exists.");
}
if (combined.includes('className="mf-shell flex h-screen w-full')) {
  throw new Error("AppShell must use the dynamic viewport instead of legacy 100vh on mobile.");
}

console.log("Shell V3 mobile/a11y invariants: PASS");
