# METADATA INTELLIGENCE CONFORMANCE MATRIX — 2026-08-06

Baseline source: `main@80a15818bab618defe76bbd58fb862443914327e`

Legend: `FULL` = canonical primitive + executing surface; `PARTIAL` = primitive exists but surface-specific path still owns behavior; `LEGACY` = business/schema knowledge still lives in renderer; `GAP` = no safe generic path yet.

| Capability | Core | Form | ChildGrid | AppAction | Builder | Baseline |
|---|---|---:|---:|---:|---:|---|
| field visibility / required / readonly dependency | FULL | FULL | PARTIAL | PARTIAL | PARTIAL | PARTIAL |
| native `valueSource` | FULL | PARTIAL | GAP | GAP | GAP | PARTIAL |
| native `editMode` | FULL | FULL | FULL through resolver | PARTIAL | GAP | PARTIAL |
| native `surface` | FULL | PARTIAL | GAP | GAP | GAP | PARTIAL |
| `serverEnforced` interpretation | FULL | PARTIAL | PARTIAL | PARTIAL | GAP | PARTIAL |
| `dirtyGuard=preserve_user_value` | FULL | GAP | GAP | GAP | GAP | PARTIAL |
| literal / Today / Now default | FULL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL |
| `fetch_from` | FULL parser | FULL bespoke effect | GAP | LEGACY enrichment | GAP authoring | PARTIAL |
| `link_filters` | FULL | FULL | FULL cell control | PARTIAL copy | GAP authoring | PARTIAL |
| Dynamic Link target | FULL | FULL | FULL | PARTIAL | PARTIAL | PARTIAL |
| Business Context list/create | FULL | FULL | PARTIAL row default | PARTIAL | N/A | PARTIAL |
| viewPolicy list/form/quick | FULL | FULL | LEGACY DocType branches | PARTIAL | PARTIAL | PARTIAL |
| action canonical field binding | N/A | N/A | N/A | GAP | GAP | GAP |
| domain projection seam | N/A | N/A | bespoke named calls | bespoke named calls | N/A | PARTIAL |
| generic-runtime business literal guard | GAP | GAP | GAP | GAP | N/A | GAP |

## Baseline interpretation

The platform already has enough metadata vocabulary for most Class-A/Class-B behavior. The main deficit is execution parity, not schema vocabulary. Therefore MDI-02..05 must first make existing metadata executable across surfaces. New shared contract keys are allowed only when a neutral or cross-domain fixture proves the current canonical contract cannot represent the behavior.
