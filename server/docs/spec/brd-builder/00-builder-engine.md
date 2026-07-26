# Builder Engine

Four canvas paradigms share `BuilderKernel`: CommandBus, history/undo/redo, selection, clipboard, keyboard, dirty tracking, validation and versioned serialization.

| Builder | Canvas | Output |
|---|---|---|
| DocType | sortable tree Tab→Section→Column→Field | schema/meta + migration |
| Workflow | node graph State→Transition | workflow state machine |
| Print | paper block canvas + code mode | print template/model |
| Dashboard | responsive grid | widgets/filters/layout |
| App Studio | artifact tree + dependency graph | app package/release |

Mandatory: palette drag, reorder, drop indicators, multi-select, copy/paste, keyboard map, ≥100 history steps, autosave draft, desktop authoring/mobile limited edit, serialize↔deserialize round-trip, preview using production renderer, validation and migration impact before publish.
