from pathlib import Path

path = Path("client/packages/shell/src/WorkspaceAppShellV2.tsx")
text = path.read_text(encoding="utf-8")

import_anchor = '} from "./workspace-navigation.js";\n'
import_line = 'import { productMasterItems, productNavigation, productReportItems } from "./workspace-product-policy.js";\n'
if import_line not in text:
    if text.count(import_anchor) != 1:
        raise SystemExit("workspace-navigation import anchor changed")
    text = text.replace(import_anchor, import_anchor + import_line, 1)

start = text.find("const ALUMDOOR_SIDEBAR_GROUPS")
end = text.find("function indexHubKey", start)
if start < 0 or end < 0:
    raise SystemExit("AlumDoor shell policy block anchors changed")
text = text[:start] + text[end:]

old_sidebar = '''  const sidebarNav = useMemo(() => {\n    const filtered = props.nav.filter(isVisibleProductNavigation);\n    const hrItems = sortAlumdoorHrItems(filtered.filter((item) => ALUMDOOR_HR_KEYS.has(item.key)));\n    let hrCursor = 0;\n    return filtered.map((item) => (ALUMDOOR_HR_KEYS.has(item.key) ? hrItems[hrCursor++]! : item));\n  }, [props.nav]);'''
new_sidebar = '  const sidebarNav = useMemo(() => productNavigation(props.nav), [props.nav]);'
if text.count(old_sidebar) != 1:
    raise SystemExit("sidebar policy anchor changed")
text = text.replace(old_sidebar, new_sidebar, 1)

old_reports = "scopedWorkspaceMeta(allReportItems, selectedModule, ALUMDOOR_REPORT_WORKSPACES)"
old_masters = "scopedWorkspaceMeta(allMasterItems, selectedModule, ALUMDOOR_MASTER_WORKSPACES)"
if text.count(old_reports) != 1 or text.count(old_masters) != 1:
    raise SystemExit("workspace affinity anchors changed")
text = text.replace(old_reports, "productReportItems(allReportItems, selectedModule)", 1)
text = text.replace(old_masters, "productMasterItems(allMasterItems, selectedModule)", 1)

path.write_text(text, encoding="utf-8")
