import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const source = fs.readFileSync(path.join(process.cwd(), "packages/views/src/list/pull-to-refresh.ts"), "utf8");
const required = [
  "const onRefreshRef = useRef(onRefresh);",
  "onRefreshRef.current = onRefresh;",
  "const enabled = Boolean(onRefresh);",
  "}, [scrollRef, enabled]);",
];

let failed = false;
for (const needle of required) {
  if (source.includes(needle)) continue;
  console.error(`Pull-to-refresh check failed: missing ${needle}`);
  failed = true;
}
if (source.includes("}, [scrollRef, onRefresh]);")) {
  console.error("Pull-to-refresh check failed: listener effect depends on handler identity");
  failed = true;
}
if (failed) process.exitCode = 1;
else console.log("Pull-to-refresh listener contract OK");
