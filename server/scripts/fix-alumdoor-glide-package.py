from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[2]

# The upstream source is kept in vendor/src, while runtime resolves the upstream-built
# dist from the exact same v6.0.4-alpha24 package. This avoids requiring Linaria's
# compile-time transform in the Forge Vite pipeline.
vendor_pkg_path = ROOT / "client/vendor/glide-data-grid/package.json"
vendor_pkg = json.loads(vendor_pkg_path.read_text(encoding="utf-8"))
vendor_pkg["private"] = True
vendor_pkg["version"] = "6.0.4-alpha24"
vendor_pkg["browser"] = "dist/esm/index.js"
vendor_pkg["main"] = "dist/cjs/index.js"
vendor_pkg["module"] = "dist/esm/index.js"
vendor_pkg["types"] = "dist/dts/index.d.ts"
vendor_pkg["exports"] = {
    ".": {
        "types": "./dist/dts/index.d.ts",
        "import": "./dist/esm/index.js",
        "require": "./dist/cjs/index.js",
    },
    "./dist/index.css": {
        "import": "./dist/index.css",
        "require": "./dist/index.css",
    },
    "./index.css": {
        "import": "./dist/index.css",
        "require": "./dist/index.css",
    },
}
vendor_pkg["scripts"] = {}
vendor_pkg["dependencies"] = {
    "@linaria/react": "^6.3.0",
    "canvas-hypertxt": "^1.0.3",
    "lodash": "^4.17.21",
    "marked": "^16.0.10",
    "react-number-format": "^5.4.4",
    "react-responsive-carousel": "^3.2.23",
}
vendor_pkg["peerDependencies"] = {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
}
vendor_pkg["devDependencies"] = {}
vendor_pkg_path.write_text(json.dumps(vendor_pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# Raw upstream source should not be compiled with Forge's stricter project-reference config.
vendor_tsconfig = ROOT / "client/vendor/glide-data-grid/tsconfig.json"
if vendor_tsconfig.exists():
    vendor_tsconfig.unlink()

views_tsconfig_path = ROOT / "client/packages/views/tsconfig.json"
views_tsconfig = json.loads(views_tsconfig_path.read_text(encoding="utf-8"))
views_tsconfig["references"] = [
    ref for ref in views_tsconfig.get("references", [])
    if ref.get("path") != "../../vendor/glide-data-grid"
]
views_tsconfig_path.write_text(json.dumps(views_tsconfig, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# Tighten the Glide wrapper's typing and load mandatory grid CSS.
grid_path = ROOT / "client/packages/views/src/app/vertical/alumdoor/AlumdoorSalesLinesGrid.tsx"
grid = grid_path.read_text(encoding="utf-8")
grid = grid.replace('import { useCallback, useMemo, useState } from "react";', 'import { useCallback, useState } from "react";')
grid = grid.replace(
    '  type ProvideEditorCallback,\n  type TextCell,\n} from "@glideapps/glide-data-grid";\n',
    '  type ProvideEditorCallback,\n  type ProvideEditorComponent,\n  type TextCell,\n} from "@glideapps/glide-data-grid";\nimport "@glideapps/glide-data-grid/dist/index.css";\n',
)
grid = grid.replace(
    'export function AlumdoorSalesLinesGrid(props: AlumdoorSalesLinesGridProps) {\n',
    'type GlideEditorProps = Parameters<ProvideEditorComponent<GridCell>>[0];\n\nexport function AlumdoorSalesLinesGrid(props: AlumdoorSalesLinesGridProps) {\n',
)
grid = grid.replace('return (editorProps) => (\n        <GridForgeEditor', 'return (editorProps: GlideEditorProps) => (\n        <GridForgeEditor', 1)
grid = grid.replace('return (editorProps) => (\n      <GridForgeEditor', 'return (editorProps: GlideEditorProps) => (\n      <GridForgeEditor', 1)
grid = grid.replace('onCellClicked={(cell) => {', 'onCellClicked={(cell: Item) => {')
grid = grid.replace('onColumnResize={(column, newSize) => {', 'onColumnResize={(column: GridColumn, newSize: number) => {')
grid_path.write_text(grid, encoding="utf-8")

print("Adjusted Glide package/runtime boundary")
