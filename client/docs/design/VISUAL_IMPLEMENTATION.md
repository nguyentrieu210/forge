# Visual implementation map

| Design handoff | Production implementation |
|---|---|
| Run2 Product Shell | `packages/shell/src/AppShell.tsx` + shell classes in `packages/ui/src/styles.css` |
| Run2 P0 Components | Existing Radix/shadcn primitives in `packages/ui/src/components/ui/*` |
| Run3 Awesomebar | `packages/shell/src/CommandPalette.tsx`, `packages/ui/src/components/ui/command.tsx` |
| Run3 List | `packages/views/src/list/ListView.tsx`, `ListToolbar.tsx` |
| Run4 Form Detail | `packages/views/src/form/FormView.tsx`, `detail/SplitView.tsx` |
| Run5 Timeline/Context | `packages/views/src/detail/ContextPanel.tsx`, `WorkflowActionBar.tsx` |
| Run6 Login | `packages/shell/src/auth/LoginForm.tsx` |
| Run6 Workspace | `packages/views/src/workspace/WorkspaceView.tsx` |
| Run6 Report | `packages/views/src/report/ReportView.tsx` |
| Run6 Kanban | `packages/views/src/kanban/KanbanView.tsx` |
| Run6 Calendar | `packages/views/src/calendar/CalendarView.tsx` |
| Run6 Gantt | `packages/views/src/gantt/GanttView.tsx` |
| Run6 Tree | `packages/views/src/tree/TreeView.tsx` |
| Run6 Dashboard | `packages/views/src/dashboard/DashboardView.tsx` |
| Run6 Print | `packages/views/src/print/PrintView.tsx` |
| Builder directions | `packages/builder/src/*` using shared `mf-builder` hooks |

The original `.dc.html` files remain under `docs/design/visual-directions-review` as the
pixel-level design reference for future visual regression work.
