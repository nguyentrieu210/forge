#!/usr/bin/env python3
from pathlib import Path
import json, re, sys
root=Path(__file__).resolve().parents[2]
md=list(root.rglob('*.md'))
issues=[]
for p in md:
    t=p.read_text(encoding='utf-8',errors='ignore')
    for bad in ['sẽ bổ sung sau','TODO','TBD','theo business/source contract của màn']:
        if bad.lower() in t.lower(): issues.append(f'{p.relative_to(root)}: forbidden placeholder {bad}')
# critical docs
required=['docs/technical/atomic-write-protocol.md','docs/technical/tenant-routing-bindings.md','docs/business-rules/00-index.md','docs/oracle/00-oracle-harness.md']
for r in required:
    if not (root/r).exists(): issues.append(f'missing {r}')
res={'markdown_files':len(md),'issues':issues,'pass':not issues}
print(json.dumps(res,indent=2,ensure_ascii=False))
sys.exit(1 if issues else 0)
