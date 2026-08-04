import type {
  Actor,
  CanonicalDocument,
  JsonObject,
  MutationCommand,
  MutationReceipt,
} from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { DomainReader } from "../../document-kernel/src/index.js";
import type { MetadataPermissionService } from "../../frappe-model/src/index.js";
import { AppFactoryDefinitionResolver } from "./app-factory-definition-resolver.js";
import {
  createApprovalDecisionFact,
  evaluateApprovalPlan,
  parseApprovalPlan,
  type ApprovalDecision,
  type ApprovalDecisionFact,
  type ApprovalPlan,
} from "./bpm-approval.js";
import {
  evaluateApprovalTimers,
  parseApprovalTimerPlan,
  type ApprovalTimerPlan,
} from "./bpm-timer.js";

/**
 * Virtual command aggregate consumed by the tenant AggregateCoordinator.
 *
 * It persists BPM process-control facts only. Target documents, ledgers and other business
 * authorities are deliberately outside this runtime and continue through DocumentKernel.
 */
export const APP_FACTORY_APPROVAL_PROCESS_DOCTYPE = "App Factory Approval Process";

export interface AppFactoryApprovalSecurity {
  canActThroughDelegation(
    tenantId: string,
    actor: Actor,
    transitionRole: string,
    doctype: string,
    action: string,
    document: JsonObject,
    expectedGrantor?: string,
  ): Promise<{ allowed: boolean; delegation?: string; grantor?: string }>;
  checkSoD(
    tenantId: string,
    actor: Actor,
    doctype: string,
    name: string,
    action: string,
  ): Promise<{ allowed: boolean; conflicts?: JsonObject[] }>;
}

type ProcessStatus = "pending" | "approved" | "rejected";

type ProcessRow = {
  process_id: string;
  definition_name: string;
  definition_key: string;
  definition_version: number;
  target_doctype: string;
  target_name: string;
  target_version: number;
  approval_plan_json: string;
  timer_plan_json: string | null;
  stage_opened_json: string;
  status: ProcessStatus;
  open_stage: string | null;
  revision: number;
  started_by: string;
  started_at: string;
  modified_at: string;
};

type ReceiptRow = {
  process_id: string;
  actor_user_id: string;
  payload_hash: string;
  aggregate_version: number;
  result_json: string;
  committed_at: string;
};

type DecisionRow = {
  decision_id: string;
  process_revision: number;
  stage_key: string;
  actor_id: string;
  decision: ApprovalDecision;
  matched_approver: string;
  delegation_id: string | null;
  occurred_at: string;
};

function text(value: unknown, field: string, max = 320): string {
  if (typeof value !== "string") throw errors.validation(`${field} is required`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) {
    throw errors.validation(`${field} is invalid`);
  }
  return normalized;
}

function isoTimestamp(value: string, field: string): string {
  const normalized = text(value, field, 64);
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) throw errors.validation(`${field} must be an ISO datetime`);
  return new Date(parsed).toISOString();
}

function dayOf(isoValue: string): string {
  return isoTimestamp(isoValue, "now").slice(0, 10);
}

function processPayload(command: MutationCommand): JsonObject {
  const value = command.document;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw errors.validation("App Factory approval process document must be an object");
  }
  return value;
}

function parseDecision(value: unknown): ApprovalDecision {
  if (value !== "approve" && value !== "reject") {
    throw errors.validation("decision must be approve or reject");
  }
  return value;
}

function parseStageOpened(value: string): Record<string, string> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw errors.database("Stored App Factory stage-open evidence is invalid");
  }
  const result: Record<string, string> = {};
  for (const [key, timestamp] of Object.entries(parsed)) {
    result[text(key, "stage key", 64)] = isoTimestamp(String(timestamp), `stage_opened_at.${key}`);
  }
  return result;
}

function timerResult(
  plan: ApprovalPlan,
  timerPlan: ApprovalTimerPlan | null,
  facts: ApprovalDecisionFact[],
  stageOpenedAt: Record<string, string>,
  now: string,
): JsonObject | null {
  if (!timerPlan) return null;
  return evaluateApprovalTimers(plan, timerPlan, facts, stageOpenedAt, now) as unknown as JsonObject;
}

class D1AppFactoryApprovalStore {
  private readonly db: D1Database | D1DatabaseSession;

  constructor(database: D1Database) {
    this.db = database.withSession?.("first-primary") ?? database;
  }

  async replay(command: MutationCommand): Promise<MutationReceipt | null> {
    const row = await this.db.prepare(
      `SELECT process_id,actor_user_id,payload_hash,aggregate_version,result_json,committed_at
       FROM app_factory_approval_commands
       WHERE tenant_id=?1 AND command_id=?2`,
    ).bind(command.tenant_id, command.command_id).first<ReceiptRow>();
    if (!row) return null;
    if (
      row.process_id !== command.aggregate.name
      || row.actor_user_id !== command.actor.user_id
      || row.payload_hash !== command.payload_hash
    ) {
      throw errors.lifecycle("App Factory approval command id was already used with different actor, process or payload");
    }
    return {
      command_id: command.command_id,
      tenant_id: command.tenant_id,
      actor_user_id: row.actor_user_id,
      aggregate: { doctype: APP_FACTORY_APPROVAL_PROCESS_DOCTYPE, name: row.process_id },
      aggregate_version: row.aggregate_version,
      payload_hash: row.payload_hash,
      committed_at: row.committed_at,
      result: JSON.parse(row.result_json) as JsonObject,
    };
  }

  async get(tenantId: string, processId: string): Promise<ProcessRow> {
    const row = await this.db.prepare(
      `SELECT process_id,definition_name,definition_key,definition_version,target_doctype,target_name,
              target_version,approval_plan_json,timer_plan_json,stage_opened_json,status,open_stage,
              revision,started_by,started_at,modified_at
       FROM app_factory_approval_processes
       WHERE tenant_id=?1 AND process_id=?2`,
    ).bind(tenantId, processId).first<ProcessRow>();
    if (!row) throw errors.notFound(`App Factory approval process not found: ${processId}`);
    return row;
  }

  async decisions(tenantId: string, processId: string): Promise<ApprovalDecisionFact[]> {
    const result = await this.db.prepare(
      `SELECT decision_id,process_revision,stage_key,actor_id,decision,matched_approver,delegation_id,occurred_at
       FROM app_factory_approval_decisions
       WHERE tenant_id=?1 AND process_id=?2
       ORDER BY process_revision,decision_id`,
    ).bind(tenantId, processId).all<DecisionRow>();
    return (result.results ?? []).map((row) => ({
      decision_id: row.decision_id,
      stage_key: row.stage_key,
      actor_id: row.actor_id,
      decision: row.decision,
      matched_approver: row.matched_approver,
      occurred_at: row.occurred_at,
      ...(row.delegation_id ? { delegation_id: row.delegation_id } : {}),
    }));
  }

  async create(
    command: MutationCommand,
    input: {
      definition_name: string;
      definition_key: string;
      definition_version: number;
      target: CanonicalDocument<JsonObject>;
      plan: ApprovalPlan;
      timer_plan: ApprovalTimerPlan | null;
      stage_opened_at: Record<string, string>;
      result: JsonObject;
      now: string;
    },
  ): Promise<MutationReceipt> {
    const resultJson = JSON.stringify(input.result);
    await this.db.batch([
      this.db.prepare(
        `INSERT INTO app_factory_approval_processes(
           tenant_id,process_id,definition_name,definition_key,definition_version,target_doctype,target_name,
           target_version,approval_plan_json,timer_plan_json,stage_opened_json,status,open_stage,revision,
           started_by,started_at,modified_at
         ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'pending',?12,1,?13,?14,?14)`,
      ).bind(
        command.tenant_id,
        command.aggregate.name,
        input.definition_name,
        input.definition_key,
        input.definition_version,
        input.target.doctype,
        input.target.name,
        input.target.version,
        JSON.stringify(input.plan),
        input.timer_plan ? JSON.stringify(input.timer_plan) : null,
        JSON.stringify(input.stage_opened_at),
        input.result.open_stage ?? null,
        command.actor.user_id,
        input.now,
      ),
      this.db.prepare(
        `INSERT INTO app_factory_approval_commands(
           tenant_id,command_id,process_id,actor_user_id,payload_hash,aggregate_version,result_json,committed_at
         ) VALUES(?1,?2,?3,?4,?5,1,?6,?7)`,
      ).bind(
        command.tenant_id,
        command.command_id,
        command.aggregate.name,
        command.actor.user_id,
        command.payload_hash,
        resultJson,
        input.now,
      ),
    ]);
    return {
      command_id: command.command_id,
      tenant_id: command.tenant_id,
      actor_user_id: command.actor.user_id,
      aggregate: command.aggregate,
      aggregate_version: 1,
      payload_hash: command.payload_hash,
      committed_at: input.now,
      result: input.result,
    };
  }

  async appendDecision(
    command: MutationCommand,
    current: ProcessRow,
    fact: ApprovalDecisionFact,
    status: ProcessStatus,
    openStage: string | null,
    stageOpenedAt: Record<string, string>,
    result: JsonObject,
    now: string,
  ): Promise<MutationReceipt> {
    const nextRevision = current.revision + 1;
    const results = await this.db.batch([
      this.db.prepare(
        `UPDATE app_factory_approval_processes
         SET status=?1,open_stage=?2,stage_opened_json=?3,revision=?4,modified_at=?5
         WHERE tenant_id=?6 AND process_id=?7 AND revision=?8 AND status='pending'`,
      ).bind(
        status,
        openStage,
        JSON.stringify(stageOpenedAt),
        nextRevision,
        now,
        command.tenant_id,
        command.aggregate.name,
        current.revision,
      ),
      this.db.prepare(
        `INSERT INTO app_factory_approval_decisions(
           tenant_id,process_id,decision_id,process_revision,stage_key,actor_id,decision,
           matched_approver,delegation_id,occurred_at
         ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`,
      ).bind(
        command.tenant_id,
        command.aggregate.name,
        fact.decision_id,
        nextRevision,
        fact.stage_key,
        fact.actor_id,
        fact.decision,
        fact.matched_approver,
        fact.delegation_id ?? null,
        fact.occurred_at,
      ),
      this.db.prepare(
        `INSERT INTO app_factory_approval_commands(
           tenant_id,command_id,process_id,actor_user_id,payload_hash,aggregate_version,result_json,committed_at
         ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)`,
      ).bind(
        command.tenant_id,
        command.command_id,
        command.aggregate.name,
        command.actor.user_id,
        command.payload_hash,
        nextRevision,
        JSON.stringify(result),
        now,
      ),
    ]);
    if ((results[0]?.meta?.changes ?? 0) !== 1) {
      throw errors.lifecycle("App Factory approval process changed while the decision was being committed");
    }
    return {
      command_id: command.command_id,
      tenant_id: command.tenant_id,
      actor_user_id: command.actor.user_id,
      aggregate: command.aggregate,
      aggregate_version: nextRevision,
      payload_hash: command.payload_hash,
      committed_at: now,
      result,
    };
  }
}

/**
 * Persisted generic parallel/quorum approval executor.
 *
 * Security invariants:
 * - tenant and actor come from the authenticated MutationCommand;
 * - start/inspect re-check target DocPerm; a decision additionally checks SoD;
 * - role/user selectors are re-evaluated from the live actor on every decision;
 * - delegated role decisions are accepted only through the existing WS11 delegation authority;
 * - the target version is pinned when the process starts, so an approval cannot silently apply
 *   to a document that changed underneath it;
 * - no target document or ledger is ever mutated here.
 */
export class AppFactoryApprovalRuntime {
  private readonly store: D1AppFactoryApprovalStore;
  private readonly definitions: AppFactoryDefinitionResolver;

  constructor(
    database: D1Database,
    private readonly reader: DomainReader,
    private readonly permissions: MetadataPermissionService,
    private readonly security: AppFactoryApprovalSecurity,
  ) {
    this.store = new D1AppFactoryApprovalStore(database);
    this.definitions = new AppFactoryDefinitionResolver(reader);
  }

  async execute(command: MutationCommand, nowValue: string): Promise<MutationReceipt> {
    if (command.aggregate.doctype !== APP_FACTORY_APPROVAL_PROCESS_DOCTYPE) {
      throw errors.validation(`Unsupported App Factory process aggregate: ${command.aggregate.doctype}`);
    }
    const now = isoTimestamp(nowValue, "now");
    const payload = processPayload(command);

    // `inspect` is deliberately read-only even though it travels through the already-authenticated
    // command envelope. It does not consume a command receipt or advance process revision.
    if (payload.operation === "inspect") return this.inspect(command, now);

    const replay = await this.store.replay(command);
    if (replay) return replay;
    if (command.action === "create") return this.start(command, payload, now);
    if (command.action === "save") return this.decide(command, payload, now);
    throw errors.lifecycle("App Factory approval process supports create, save decision and inspect only");
  }

  private async start(command: MutationCommand, payload: JsonObject, now: string): Promise<MutationReceipt> {
    if (command.expected_version !== null) throw errors.validation("Approval process create requires expected_version=null");
    const definitionKey = text(payload.definition_key, "definition_key", 64);
    const targetDoctype = text(payload.target_doctype, "target_doctype", 160);
    const targetName = text(payload.target_name, "target_name", 240);
    const target = await this.requireTarget(command.tenant_id, targetDoctype, targetName);
    await this.permissions.assert({
      actor: command.actor,
      tenantId: command.tenant_id,
      doctype: target.doctype,
      name: target.name,
      owner: target.owner,
      data: target.data,
      action: "save",
    });

    const definition = await this.definitions.require({
      tenant_id: command.tenant_id,
      definition_key: definitionKey,
      definition_kind: "Process",
      target_doctype: targetDoctype,
      effective_on: dayOf(now),
    });
    const definitionJson = definition.data.definition_json;
    const plan = parseApprovalPlan(definitionJson.approval_plan);
    const timerPlan = definitionJson.timer_plan === undefined
      ? null
      : parseApprovalTimerPlan(definitionJson.timer_plan, plan);
    const approval = evaluateApprovalPlan(plan, []);
    const stageOpenedAt: Record<string, string> = approval.open_stage ? { [approval.open_stage]: now } : {};
    const result: JsonObject = {
      process_id: command.aggregate.name,
      definition_key: definitionKey,
      definition_version: definition.data.version_no,
      target_doctype: targetDoctype,
      target_name: targetName,
      target_version: target.version,
      revision: 1,
      status: approval.status,
      open_stage: approval.open_stage,
      approval: approval as unknown as JsonObject,
      timer: timerResult(plan, timerPlan, [], stageOpenedAt, now),
    };
    return this.store.create(command, {
      definition_name: definition.name,
      definition_key: definitionKey,
      definition_version: definition.data.version_no,
      target,
      plan,
      timer_plan: timerPlan,
      stage_opened_at: stageOpenedAt,
      result,
      now,
    });
  }

  private async decide(command: MutationCommand, payload: JsonObject, now: string): Promise<MutationReceipt> {
    if (command.expected_version === null) throw errors.validation("Approval decision requires expected_version");
    const current = await this.store.get(command.tenant_id, command.aggregate.name);
    if (command.expected_version !== current.revision) {
      throw errors.lifecycle(`Approval process version changed: expected ${command.expected_version}, current ${current.revision}`);
    }
    if (current.status !== "pending") throw errors.lifecycle(`Approval process is already ${current.status}`);
    const target = await this.requireTarget(command.tenant_id, current.target_doctype, current.target_name);
    if (target.version !== current.target_version) {
      throw errors.lifecycle(
        `Approval target changed from version ${current.target_version} to ${target.version}; restart approval against the current document`,
      );
    }
    await this.permissions.assert({
      actor: command.actor,
      tenantId: command.tenant_id,
      doctype: target.doctype,
      name: target.name,
      owner: target.owner,
      data: target.data,
      action: "read",
    });
    const sod = await this.security.checkSoD(
      command.tenant_id,
      command.actor,
      target.doctype,
      target.name,
      "approve",
    );
    if (!sod.allowed) throw errors.permission("Segregation-of-duties policy blocks this approval decision");

    const plan = parseApprovalPlan(JSON.parse(current.approval_plan_json));
    const facts = await this.store.decisions(command.tenant_id, command.aggregate.name);
    const evaluation = evaluateApprovalPlan(plan, facts);
    if (!evaluation.open_stage) throw errors.lifecycle("Approval process has no open stage");
    const matchedApprover = text(payload.matched_approver, "matched_approver", 480);
    const stage = plan.stages.find((candidate) => candidate.key === evaluation.open_stage);
    const selector = stage?.approvers.find((candidate) => candidate.key === matchedApprover);
    if (!stage || !selector) {
      throw errors.permission(`Approver selector ${matchedApprover} is not allowed for open stage ${evaluation.open_stage}`);
    }

    let delegationId: string | undefined;
    if (selector.user) {
      if (selector.user !== command.actor.user_id) {
        throw errors.permission(`Approval selector ${matchedApprover} belongs to another user`);
      }
    } else if (selector.role) {
      if (!command.actor.roles.includes(selector.role)) {
        const delegated = await this.security.canActThroughDelegation(
          command.tenant_id,
          command.actor,
          selector.role,
          target.doctype,
          "approve",
          target.data,
        );
        if (!delegated.allowed) {
          throw errors.permission(`Actor is not eligible for approval selector ${matchedApprover}`);
        }
        delegationId = delegated.delegation;
      }
    } else {
      throw errors.database(`Approval selector ${matchedApprover} has no role or user authority`);
    }

    const fact = createApprovalDecisionFact(plan, facts, {
      decision_id: command.command_id,
      stage_key: evaluation.open_stage,
      actor_id: command.actor.user_id,
      decision: parseDecision(payload.decision),
      eligible_approvers: [matchedApprover],
      matched_approver: matchedApprover,
      occurred_at: now,
      ...(delegationId ? { delegation_id: delegationId } : {}),
    });
    const nextFacts = [...facts, fact];
    const nextApproval = evaluateApprovalPlan(plan, nextFacts);
    const stageOpenedAt = parseStageOpened(current.stage_opened_json);
    if (nextApproval.open_stage && nextApproval.open_stage !== evaluation.open_stage) {
      stageOpenedAt[nextApproval.open_stage] = now;
    }
    const timerPlan = current.timer_plan_json
      ? parseApprovalTimerPlan(JSON.parse(current.timer_plan_json), plan)
      : null;
    const nextRevision = current.revision + 1;
    const result: JsonObject = {
      process_id: command.aggregate.name,
      definition_key: current.definition_key,
      definition_version: current.definition_version,
      target_doctype: current.target_doctype,
      target_name: current.target_name,
      target_version: current.target_version,
      revision: nextRevision,
      status: nextApproval.status,
      open_stage: nextApproval.open_stage,
      approval: nextApproval as unknown as JsonObject,
      timer: timerResult(plan, timerPlan, nextFacts, stageOpenedAt, now),
      decision_id: fact.decision_id,
      delegation_id: fact.delegation_id ?? null,
    };
    return this.store.appendDecision(
      command,
      current,
      fact,
      nextApproval.status,
      nextApproval.open_stage,
      stageOpenedAt,
      result,
      now,
    );
  }

  private async inspect(command: MutationCommand, now: string): Promise<MutationReceipt> {
    if (command.action !== "save" || command.expected_version !== null) {
      throw errors.validation("Approval process inspect uses action=save and expected_version=null");
    }
    const current = await this.store.get(command.tenant_id, command.aggregate.name);
    const target = await this.requireTarget(command.tenant_id, current.target_doctype, current.target_name);
    await this.permissions.assert({
      actor: command.actor,
      tenantId: command.tenant_id,
      doctype: target.doctype,
      name: target.name,
      owner: target.owner,
      data: target.data,
      action: "read",
    });
    const plan = parseApprovalPlan(JSON.parse(current.approval_plan_json));
    const facts = await this.store.decisions(command.tenant_id, command.aggregate.name);
    const approval = evaluateApprovalPlan(plan, facts);
    const timerPlan = current.timer_plan_json
      ? parseApprovalTimerPlan(JSON.parse(current.timer_plan_json), plan)
      : null;
    const result: JsonObject = {
      process_id: current.process_id,
      definition_key: current.definition_key,
      definition_version: current.definition_version,
      target_doctype: current.target_doctype,
      target_name: current.target_name,
      target_version: current.target_version,
      target_current_version: target.version,
      target_changed: target.version !== current.target_version,
      revision: current.revision,
      status: current.status,
      open_stage: current.open_stage,
      approval: approval as unknown as JsonObject,
      timer: timerResult(plan, timerPlan, facts, parseStageOpened(current.stage_opened_json), now),
      decisions: facts as unknown as JsonObject[],
    };
    return {
      command_id: command.command_id,
      tenant_id: command.tenant_id,
      actor_user_id: command.actor.user_id,
      aggregate: command.aggregate,
      aggregate_version: current.revision,
      payload_hash: command.payload_hash,
      committed_at: current.modified_at,
      result,
    };
  }

  private async requireTarget(
    tenantId: string,
    doctype: string,
    name: string,
  ): Promise<CanonicalDocument<JsonObject>> {
    const target = await this.reader.getDocument<JsonObject>(tenantId, doctype, name);
    if (!target) throw errors.notFound(`Approval target not found: ${doctype} ${name}`);
    if (target.docstatus === 2) throw errors.lifecycle("Cancelled documents cannot enter or continue approval");
    return target;
  }
}
