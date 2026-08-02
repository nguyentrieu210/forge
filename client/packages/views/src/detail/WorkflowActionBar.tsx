/** @jsxImportSource react */
/**
 * WorkflowActionBar + FormActionBar — thanh hành động header Form, metadata/server-driven.
 */
import { ChevronDown, MoreHorizontal } from "lucide-react";
import type { WorkflowTransition } from "@metaforge/adapter-frappe";
import {
  Button, useT,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@metaforge/ui";
import { resolveFormActions, DIRTY_GUARD_REASON, type FormActionCtx, type FormActionKind } from "./formActions.js";

export interface WorkflowAction {
  action: string;
  nextState: string;
}

export function resolveWorkflowActions(transitions: WorkflowTransition[]): WorkflowAction[] {
  const seen = new Set<string>();
  const out: WorkflowAction[] = [];
  for (const t of transitions) {
    if (!t.action || seen.has(t.action)) continue;
    seen.add(t.action);
    out.push({ action: t.action, nextState: t.next_state });
  }
  return out;
}

export function WorkflowActionBar({
  transitions, onAction, saving, dirty,
}: { transitions: WorkflowTransition[]; onAction: (action: string) => void; saving?: boolean; dirty?: boolean }) {
  const t = useT();
  const actions = resolveWorkflowActions(transitions);
  if (!actions.length) return null;
  const [first, ...rest] = actions;
  const locked = saving || dirty;
  const firstTitle = dirty ? t("form.dirty_guard", DIRTY_GUARD_REASON) : `→ ${first!.nextState}`;
  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="secondary"
        size="sm"
        className="h-6 rounded-md px-2 text-[10.5px]"
        disabled={locked}
        onClick={() => onAction(first!.action)}
        title={firstTitle}
      >
        {first!.action}
      </Button>
      {rest.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="icon-sm"
              className="size-6 rounded-md"
              disabled={locked}
              aria-label={t("form.other_workflow_actions")}
              title={dirty ? t("form.dirty_guard", DIRTY_GUARD_REASON) : undefined}
            >
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {rest.map((a) => (
              <DropdownMenuItem key={a.action} disabled={locked} onClick={() => onAction(a.action)}>
                {a.action} <span className="ml-auto text-xs text-muted-foreground">→ {a.nextState}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export function FormActionBar({
  ctx, onAction,
}: { ctx: FormActionCtx; onAction: (kind: FormActionKind) => void }) {
  const t = useT();
  const actions = resolveFormActions(ctx);
  const inline = actions.filter((a) => !a.inMenu);
  const menu = actions.filter((a) => a.inMenu);
  if (!actions.length) return null;
  return (
    <div className="flex items-center gap-1">
      {inline.map((a) => (
        <Button
          key={a.kind}
          type={a.kind === "save" ? "submit" : "button"}
          size="sm"
          variant={a.variant}
          className="h-6 rounded-md px-2 text-[10.5px]"
          disabled={a.disabled}
          title={a.disabledReason === DIRTY_GUARD_REASON ? t("form.dirty_guard", a.disabledReason) : a.disabledReason}
          onClick={a.kind === "save" ? undefined : () => onAction(a.kind)}
        >
          {a.kind === "save" && ctx.saving ? t("form.saving") : t(`form.action.${a.kind}`, a.label)}
        </Button>
      ))}
      {menu.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="size-6 rounded-md" aria-label={t("form.other_actions")}>
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {menu.map((a, i) => (
              <div key={a.kind}>
                {i > 0 && a.variant === "destructive" ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  destructive={a.variant === "destructive"}
                  disabled={a.disabled}
                  title={a.disabledReason === DIRTY_GUARD_REASON ? t("form.dirty_guard", a.disabledReason) : a.disabledReason}
                  onClick={() => onAction(a.kind)}
                >
                  {t(`form.action.${a.kind}`, a.label)}
                </DropdownMenuItem>
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
