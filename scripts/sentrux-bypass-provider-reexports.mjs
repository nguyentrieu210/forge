import { readFile, writeFile } from "node:fs/promises";

const changes = [
  {
    path: "client/packages/views/src/app/doctype-workspace-support.ts",
    from: 'import { useMetaForge } from "../container/provider.js";',
    to: 'import { useMetaForge } from "../container/meta-context.js";',
  },
  {
    path: "client/packages/views/src/screen/ScreenView.tsx",
    from: 'import { useLocaleFormat } from "../container/provider.js";',
    to: 'import { useLocaleFormat } from "../container/meta-context.js";',
  },
  {
    path: "client/packages/views/src/action/ActionScreen.tsx",
    from: 'import { useMetaForge } from "../container/provider.js";',
    to: 'import { useMetaForge } from "../container/meta-context.js";',
  },
];

for (const change of changes) {
  const source = await readFile(change.path, "utf8");
  if (!source.includes(change.from)) {
    throw new Error(`Expected provider re-export import missing in ${change.path}`);
  }
  if (source.includes(change.to)) {
    throw new Error(`Direct meta-context import already exists in ${change.path}`);
  }
  await writeFile(change.path, source.replace(change.from, change.to), "utf8");
}
