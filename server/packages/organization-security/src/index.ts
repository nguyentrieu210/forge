import type { Actor, JsonObject, JsonValue, MutationCommand } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { MetadataStore } from "../../frappe-model/src/index.js";

const SECURITY_DOCTYPES = new Set([
  "Organization Assignment", "Role Policy", "SoD Rule", "Approval Policy", "Delegation",
]);

const ACTION_PATTERN = /^[a-z][a-z0-9_.:-]{1,79}$/;
const BLOCKED_RULE_KEYS = new Set(["$where", "sql", "script", "javascript", "eval", "expression"]);

interface StoredDocumentRow {
  name: string;
  owner: string;
  docstatus: number;
  payload_json: string;
}

interface ScopeGrantRow {
  allow_doctype: string;
  allow_name: string;
}

interface VersionActorRow {
  actor: string;
  action: string;
}

export interface AuditSearchInput {
  entity_type?: string;
  entity_name?: string;
  actor?: string;
  action?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export interface OrganizationAuditEvent extends JsonObject {
  event_id: string;
  correlation_id: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_name: string;
  before_json: JsonValue;
  after_json: JsonValue;
  occurred_at: string;
  source: "document_version" | "rbac";
}

export interface DelegationDecision extends JsonObject {
  allowed: boolean;
  delegation?: string;
  grantor?: string;
}

export interface SoDCheckResult extends JsonObject {
  allowed: boolean;
  conflicts: JsonObject[];
}

/**
 * Platform guard for G03 invariants that metadata alone cannot express.
 *
 * It runs before every command surface (Frappe and native). D1 triggers remain the
 * concurrency-safe authority for the effective-scope projection; this guard supplies
 * field-level errors, hierarchy checks, SoD and approval-policy decisions.
 */
export class D1OrganizationSecurityGuard {
  private readonly db: D1Database | D1DatabaseSession;

  constructor(database: D1Database, private readonly metadata: MetadataStore) {
    this.db = database.withSession?.("first-primary") ?? database;
  }

  async canActThroughDelegation(
    tenantId: string,
    actor: Actor,
    transitionRole: string,
    doctype: string,
    action: string,
    document: JsonObject,
    expectedGrantor?: string,
  ): Promise<DelegationDecision> {
    const rows = await this.db.prepare(
      `SELECT name,payload_json FROM documents
       WHERE tenant_id=?1 AND doctype='Delegation' AND docstatus=1
         AND json_extract(payload_json,'$.workflow_state')='Active'
         AND json_extract(payload_json,'$.grantee')=?2
         AND datetime(json_extract(payload_json,'$.effective_from'))<=datetime('now')
         AND datetime(json_extract(payload_json,'$.effective_to'))>=datetime('now')
       ORDER BY datetime(json_extract(payload_json,'$.effective_to')),name`,
    ).bind(tenantId, actor.user_id).all<{ name: string; payload_json: string }>();
    const aliases = actionAliases(doctype, action);
    aliases.add(action.trim().toLowerCase());
    for (const row of rows.results ?? []) {
      const data = JSON.parse(row.payload_json) as JsonObject;
      const grantor = optionalText(data.grantor);
      const actions = new Set(Array.isArray(data.action_scope_json)
        ? data.action_scope_json.filter((value): value is string => typeof value === "string").map((value) => value.trim().toLowerCase())
        : []);
      if (!grantor || (expectedGrantor && grantor !== expectedGrantor) || ![...aliases].some((candidate) => actions.has(candidate))) continue;
      const grantorRoles = await this.userRoles(tenantId, grantor);
      if (!expectedGrantor && !grantorRoles.includes(transitionRole) && !grantorRoles.some((role) => ["Administrator", "System Manager"].includes(role))) continue;
      if (!await this.documentWithinDelegatedScope(tenantId, grantor, data.organization_scope_json, document)) continue;
      return { allowed: true, delegation: row.name, grantor };
    }
    return { allowed: false };
  }

  async listAuditEvents(tenantId: string, actor: Actor, input: AuditSearchInput = {}): Promise<{ events: OrganizationAuditEvent[]; next_cursor: string | null }> {
    requireAuditReader(actor);
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 1000);
    const fetchLimit = Math.min(limit * 5, 1000);
    const versions = await this.db.prepare(
      `WITH history AS (
         SELECT doc_key,version,command_id,actor,action,snapshot_json,created_at,
                LAG(snapshot_json) OVER (PARTITION BY doc_key ORDER BY version) AS before_json
         FROM versions WHERE tenant_id=?1
       )
       SELECT doc_key,version,command_id,actor,action,snapshot_json,created_at,before_json
       FROM history ORDER BY created_at DESC,command_id DESC LIMIT ?2`,
    ).bind(tenantId, fetchLimit).all<{
      doc_key: string; version: number; command_id: string; actor: string; action: string;
      snapshot_json: string; before_json: string | null; created_at: string;
    }>();
    const rbac = await this.db.prepare(
      `SELECT event_id,event_type,actor_user_id,target_user_id,before_json,after_json,trace_id,created_at
       FROM rbac_audit_events WHERE tenant_id=?1 ORDER BY created_at DESC,event_id DESC LIMIT ?2`,
    ).bind(tenantId, fetchLimit).all<{
      event_id: string; event_type: string; actor_user_id: string; target_user_id: string | null;
      before_json: string; after_json: string; trace_id: string; created_at: string;
    }>();
    const events: OrganizationAuditEvent[] = [];
    for (const row of versions.results ?? []) {
      const separator = row.doc_key.indexOf(":");
      events.push({
        event_id: row.command_id,
        correlation_id: row.command_id,
        actor: row.actor,
        action: row.action,
        entity_type: separator < 0 ? row.doc_key : row.doc_key.slice(0, separator),
        entity_name: separator < 0 ? row.doc_key : row.doc_key.slice(separator + 1),
        before_json: redactAuditJson(parseAuditJson(row.before_json)),
        after_json: redactAuditJson(parseAuditJson(row.snapshot_json)),
        occurred_at: row.created_at,
        source: "document_version",
      });
    }
    for (const row of rbac.results ?? []) {
      events.push({
        event_id: row.event_id,
        correlation_id: row.trace_id,
        actor: row.actor_user_id,
        action: row.event_type,
        entity_type: "User",
        entity_name: row.target_user_id ?? row.actor_user_id,
        before_json: redactAuditJson(parseAuditJson(row.before_json)),
        after_json: redactAuditJson(parseAuditJson(row.after_json)),
        occurred_at: row.created_at,
        source: "rbac",
      });
    }
    const cursor = decodeAuditCursor(input.cursor);
    const filtered = events
      .filter((event) => !input.entity_type || event.entity_type === input.entity_type)
      .filter((event) => !input.entity_name || event.entity_name === input.entity_name)
      .filter((event) => !input.actor || event.actor === input.actor)
      .filter((event) => !input.action || event.action === input.action)
      .filter((event) => !input.from || event.occurred_at >= input.from)
      .filter((event) => !input.to || event.occurred_at <= input.to)
      .filter((event) => !cursor || event.occurred_at < cursor.time || (event.occurred_at === cursor.time && event.event_id < cursor.id))
      .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at) || right.event_id.localeCompare(left.event_id));
    const page = filtered.slice(0, limit);
    const last = page.at(-1);
    return { events: page, next_cursor: filtered.length > limit && last ? encodeAuditCursor(last.occurred_at, last.event_id) : null };
  }

  async checkSoD(tenantId: string, actor: Actor, doctype: string, name: string, action: string): Promise<SoDCheckResult> {
    const conflicts = await this.findSoDConflicts(tenantId, actor, doctype, name, action, false);
    return { allowed: !conflicts.some((conflict) => conflict.severity === "Block"), conflicts };
  }

  async assertMutation(tenantId: string, actor: Actor, command: MutationCommand): Promise<void> {
    if (command.tenant_id !== tenantId) throw errors.authentication("Command tenant does not match organization-security context");
    if (SECURITY_DOCTYPES.has(command.aggregate.doctype)) {
      await this.assertSecurityDocument(tenantId, actor, command);
    }
    await this.assertApprovalPolicy(tenantId, actor, command);
    await this.assertSoD(tenantId, actor, command);
  }

  private async assertSecurityDocument(tenantId: string, actor: Actor, command: MutationCommand): Promise<void> {
    if (command.action === "cancel") return;
    const data = command.document;
    switch (command.aggregate.doctype) {
      case "Organization Assignment": await this.assertOrganizationAssignment(tenantId, actor, command.aggregate.name, data); break;
      case "Role Policy": await this.assertRolePolicy(tenantId, command, data); break;
      case "SoD Rule": await this.assertSoDRule(tenantId, command.aggregate.name, data); break;
      case "Approval Policy": await this.assertApprovalPolicyDocument(tenantId, command.aggregate.name, data); break;
      case "Delegation": await this.assertDelegation(tenantId, actor, command.aggregate.name, data); break;
    }
  }

  private async assertOrganizationAssignment(tenantId: string, actor: Actor, name: string, data: JsonObject): Promise<void> {
    stampSystemCode(data, "assignment_code", name);
    const user = requiredText(data.user, "Người dùng");
    const company = requiredText(data.company, "Công ty");
    const branch = optionalText(data.branch);
    const department = optionalText(data.department);
    const from = requiredDate(data.effective_from, "Ngày bắt đầu");
    const to = optionalDate(data.effective_to, "Ngày kết thúc");
    if (to && to < from) throw errors.validation("Ngày kết thúc phạm vi phải từ ngày bắt đầu trở đi");

    await this.assertActiveUser(tenantId, user, "Người được gán phạm vi");
    await this.assertMasterOrDocument(tenantId, "Company", company);
    if (branch) {
      const branchData = await this.requireMasterOrDocumentData(tenantId, "Branch", branch);
      if (branchData.company !== company) throw errors.reference(`Chi nhánh ${branch} không thuộc công ty ${company}`);
    }
    if (department) {
      if (!branch) throw errors.validation("Chọn chi nhánh trước khi chọn phòng ban");
      const departmentData = await this.requireMasterOrDocumentData(tenantId, "Department", department);
      if (departmentData.company !== company || departmentData.branch !== branch) {
        throw errors.reference(`Phòng ban ${department} không thuộc đúng công ty và chi nhánh đã chọn`);
      }
    }
    await this.assertWithinActorScope(tenantId, actor, { Company: company, ...(branch ? { Branch: branch } : {}), ...(department ? { Department: department } : {}) });

    const duplicate = await this.db.prepare(
      `SELECT name FROM documents
       WHERE tenant_id=?1 AND doctype='Organization Assignment' AND name<>?2 AND docstatus<>2
         AND json_extract(payload_json,'$.user')=?3
         AND json_extract(payload_json,'$.company')=?4
         AND COALESCE(json_extract(payload_json,'$.branch'),'')=?5
         AND COALESCE(json_extract(payload_json,'$.department'),'')=?6
         AND date(json_extract(payload_json,'$.effective_from'))<=date(COALESCE(?7,'9999-12-31'))
         AND date(COALESCE(json_extract(payload_json,'$.effective_to'),'9999-12-31'))>=date(?8)
       LIMIT 1`,
    ).bind(tenantId, name, user, company, branch, department, to, from).first<{ name: string }>();
    if (duplicate) throw errors.validation(`Phạm vi này chồng thời gian với ${duplicate.name}`);
  }

  private async assertRolePolicy(tenantId: string, command: MutationCommand, data: JsonObject): Promise<void> {
    const name = command.aggregate.name;
    stampSystemCode(data, "policy_code", name);
    const role = requiredText(data.role, "Vai trò");
    const resource = requiredText(data.resource, "Tài nguyên");
    const previous = await this.db.prepare(
      `SELECT MAX(CAST(json_extract(payload_json,'$.version_no') AS INTEGER)) AS version_no
       FROM documents WHERE tenant_id=?1 AND doctype='Role Policy' AND name<>?2
         AND json_extract(payload_json,'$.role')=?3 AND json_extract(payload_json,'$.resource')=?4`,
    ).bind(tenantId, name, role, resource).first<{ version_no: number | null }>();
    if (command.action === "create") data.version_no = Number(previous?.version_no ?? 0) + 1;
    const version = Number(data.version_no);
    if (!Number.isSafeInteger(version) || version <= 0) throw errors.validation("Phiên bản chính sách phải là số nguyên dương");
    if (version <= Number(previous?.version_no ?? 0)) throw errors.validation("Policy version must increase monotonically for the same role and resource");
    const roleExists = await this.db.prepare(
      "SELECT 1 AS found FROM roles WHERE tenant_id=?1 AND role=?2 AND disabled=0 LIMIT 1",
    ).bind(tenantId, role).first<{ found: number }>();
    if (!roleExists) throw errors.reference(`Vai trò ${role} chưa được cài hoặc đã ngừng dùng`);
    const resourceMeta = await this.metadata.getDocType(tenantId, resource);
    if (!resourceMeta) throw errors.reference(`Tài nguyên ${resource} không phải DocType đang hoạt động`);

    const actions = stringArray(data.actions_json, "Quyền hành động");
    if (!actions.length) throw errors.validation("Chính sách vai trò phải có ít nhất một quyền hành động");
    for (const action of actions) if (!ACTION_PATTERN.test(action)) throw errors.validation(`Hành động không hợp lệ: ${action}`);
    assertSafeRuleObject(data.row_rule_json, "Điều kiện dòng");
    assertSafeRuleObject(data.field_rule_json, "Quyền trường");
    assertFieldRule(data.field_rule_json, new Set(resourceMeta.fields.map((field) => field.fieldname)));
    if (data.workflow_state === "Published") {
      const duplicate = await this.db.prepare(
        `SELECT name FROM documents
         WHERE tenant_id=?1 AND doctype='Role Policy' AND name<>?2 AND docstatus=1
           AND json_extract(payload_json,'$.workflow_state')='Published'
           AND json_extract(payload_json,'$.role')=?3
           AND json_extract(payload_json,'$.resource')=?4 LIMIT 1`,
      ).bind(tenantId, name, role, resource).first<{ name: string }>();
      if (duplicate) throw errors.validation(`Retire ${duplicate.name} before publishing another policy for ${role} on ${resource}`);
    }
  }

  private async assertSoDRule(tenantId: string, name: string, data: JsonObject): Promise<void> {
    stampSystemCode(data, "rule_code", name);
    const left = requiredText(data.left_action, "Hành động thứ nhất");
    const right = requiredText(data.right_action, "Hành động thứ hai");
    if (left === right) throw errors.validation("Hai phía của luật tách nhiệm vụ phải khác nhau");
    if (!ACTION_PATTERN.test(left) || !ACTION_PATTERN.test(right)) throw errors.validation("Tên hành động SoD không thuộc action registry hợp lệ");
    const doctype = optionalText(data.document_type);
    if (doctype && !await this.metadata.getDocType(tenantId, doctype)) throw errors.reference(`DocType ${doctype} chưa được cài`);
    const severity = requiredText(data.severity, "Mức kiểm soát");
    if (!new Set(["Block", "Warn"]).has(severity)) throw errors.validation("Mức SoD chỉ được là Block hoặc Warn");
    const reason = requiredText(data.reason, "Lý do");
    if (reason.length < 5 || reason.length > 500) throw errors.validation("Lý do SoD phải từ 5 đến 500 ký tự");
    if (data.workflow_state === "Published") {
      const duplicate = await this.db.prepare(
        `SELECT name FROM documents
         WHERE tenant_id=?1 AND doctype='SoD Rule' AND name<>?2 AND docstatus=1
           AND json_extract(payload_json,'$.workflow_state')='Published'
           AND COALESCE(json_extract(payload_json,'$.document_type'),'')=?3
           AND ((json_extract(payload_json,'$.left_action')=?4 AND json_extract(payload_json,'$.right_action')=?5)
             OR (json_extract(payload_json,'$.left_action')=?5 AND json_extract(payload_json,'$.right_action')=?4)) LIMIT 1`,
      ).bind(tenantId, name, doctype, left, right).first<{ name: string }>();
      if (duplicate) throw errors.validation(`Retire ${duplicate.name} before publishing the same SoD pair again`);
    }
  }

  private async assertApprovalPolicyDocument(tenantId: string, name: string, data: JsonObject): Promise<void> {
    stampSystemCode(data, "policy_code", name);
    const doctype = requiredText(data.document_type, "Loại chứng từ");
    const targetMeta = await this.metadata.getDocType(tenantId, doctype);
    if (!targetMeta) throw errors.reference(`DocType ${doctype} chưa được cài`);
    requiredDate(data.effective_from, "Ngày hiệu lực");
    assertSafeRuleObject(data.condition_json, "Điều kiện phê duyệt");
    assertApprovalCondition(data.condition_json, new Set(targetMeta.fields.map((field) => field.fieldname)));
    const steps = jsonArray(data.steps_json, "Các bước phê duyệt");
    if (!steps.length) throw errors.validation("Chính sách phê duyệt phải có ít nhất một bước");
    for (const [index, value] of steps.entries()) {
      if (!isObject(value)) throw errors.validation(`Bước duyệt ${index + 1} phải là một object`);
      const role = optionalText(value.role);
      const user = optionalText(value.user);
      if (!role && !user) throw errors.validation(`Bước duyệt ${index + 1} phải chỉ định role hoặc user`);
      if (role) {
        const exists = await this.db.prepare("SELECT 1 AS found FROM roles WHERE tenant_id=?1 AND role=?2 AND disabled=0 LIMIT 1")
          .bind(tenantId, role).first<{ found: number }>();
        if (!exists) throw errors.reference(`Vai trò duyệt ${role} chưa được cài`);
      }
      if (user) await this.assertActiveUser(tenantId, user, `Người duyệt bước ${index + 1}`);
    }
    if (data.workflow_state === "Published") {
      const duplicate = await this.db.prepare(
        `SELECT name FROM documents
         WHERE tenant_id=?1 AND doctype='Approval Policy' AND name<>?2 AND docstatus=1
           AND json_extract(payload_json,'$.workflow_state')='Published'
           AND json_extract(payload_json,'$.document_type')=?3 LIMIT 1`,
      ).bind(tenantId, name, doctype).first<{ name: string }>();
      if (duplicate) throw errors.validation(`Retire ${duplicate.name} before publishing another approval policy for ${doctype}`);
    }
  }

  private async assertDelegation(tenantId: string, actor: Actor, name: string, data: JsonObject): Promise<void> {
    stampSystemCode(data, "delegation_code", name);
    const grantor = requiredText(data.grantor, "Người ủy quyền");
    const grantee = requiredText(data.grantee, "Người nhận ủy quyền");
    if (grantor === grantee) throw errors.validation("Không thể tự ủy quyền cho chính mình");
    await Promise.all([
      this.assertActiveUser(tenantId, grantor, "Người ủy quyền"),
      this.assertActiveUser(tenantId, grantee, "Người nhận ủy quyền"),
    ]);
    if (!isSecurityManager(actor) && actor.user_id !== grantor && !actor.roles.includes("Domain Manager")) {
      throw errors.permission("Chỉ người ủy quyền hoặc quản lý được tạo ủy quyền này");
    }
    const from = requiredDatetime(data.effective_from, "Thời điểm bắt đầu");
    const to = requiredDatetime(data.effective_to, "Thời điểm kết thúc");
    if (to <= from) throw errors.validation("Thời điểm kết thúc ủy quyền phải sau thời điểm bắt đầu");
    const actions = stringArray(data.action_scope_json, "Phạm vi hành động");
    if (!actions.length) throw errors.validation("Ủy quyền phải có ít nhất một hành động");
    for (const action of actions) if (!ACTION_PATTERN.test(action)) throw errors.validation(`Hành động ủy quyền không hợp lệ: ${action}`);

    const organization = data.organization_scope_json;
    if (!isObject(organization)) throw errors.validation("Phạm vi tổ chức của ủy quyền phải là object JSON");
    const requested: Record<string, string> = {};
    for (const [key, value] of Object.entries(organization)) {
      const normalized = optionalText(value);
      if (!new Set(["Company", "Branch", "Department"]).has(key) || !normalized) {
        throw errors.validation(`Phạm vi tổ chức không hợp lệ: ${key}`);
      }
      requested[key] = normalized;
    }
    await this.assertWithinUserScope(tenantId, grantor, requested);
  }

  private async assertApprovalPolicy(tenantId: string, actor: Actor, command: MutationCommand): Promise<void> {
    if (command.action !== "submit" || SECURITY_DOCTYPES.has(command.aggregate.doctype)) return;
    const result = await this.db.prepare(
      `SELECT name,payload_json FROM documents
       WHERE tenant_id=?1 AND doctype='Approval Policy' AND docstatus=1
         AND json_extract(payload_json,'$.workflow_state')='Published'
         AND json_extract(payload_json,'$.document_type')=?2
         AND date(json_extract(payload_json,'$.effective_from'))<=date('now')
       ORDER BY date(json_extract(payload_json,'$.effective_from')) DESC,name`,
    ).bind(tenantId, command.aggregate.doctype).all<{ name: string; payload_json: string }>();
    const policies = result.results ?? [];
    if (!policies.length) return;

    const current = await this.db.prepare(
      "SELECT owner FROM documents WHERE tenant_id=?1 AND doc_key=?2",
    ).bind(tenantId, `${command.aggregate.doctype}:${command.aggregate.name}`).first<{ owner: string }>();
    for (const row of policies) {
      const policy = JSON.parse(row.payload_json) as JsonObject;
      if (!matchesApprovalCondition(policy.condition_json, command.document)) continue;
      if (policy.require_sod !== false && policy.require_sod !== 0 && current?.owner === actor.user_id) {
        throw errors.permission(`Chính sách ${row.name} không cho phép người lập tự duyệt`);
      }
      const steps = Array.isArray(policy.steps_json) ? policy.steps_json.filter(isObject) : [];
      const actorMatches = steps.some((step) => step.user === actor.user_id || (typeof step.role === "string" && actor.roles.includes(step.role)));
      let delegated = false;
      if (steps.length && !actorMatches && !isSecurityManager(actor)) {
        for (const step of steps) {
          const decision = await this.canActThroughDelegation(
            tenantId,
            actor,
            optionalText(step.role),
            command.aggregate.doctype,
            command.action,
            command.document,
            optionalText(step.user) || undefined,
          );
          if (decision.allowed) { delegated = true; break; }
        }
      }
      if (steps.length && !actorMatches && !delegated && !isSecurityManager(actor)) {
        throw errors.permission(`Tài khoản không nằm trong luồng duyệt của chính sách ${row.name}`);
      }
    }
  }

  private async assertSoD(tenantId: string, actor: Actor, command: MutationCommand): Promise<void> {
    if (command.action === "create" || SECURITY_DOCTYPES.has(command.aggregate.doctype)) return;
    const conflicts = await this.findSoDConflicts(
      tenantId, actor, command.aggregate.doctype, command.aggregate.name, command.action, true,
    );
    const blocked = conflicts.find((conflict) => conflict.severity === "Block");
    if (blocked) {
      throw errors.permission(`Luật ${String(blocked.rule)} chặn tự thực hiện cả “${String(blocked.left_action)}” và “${String(blocked.right_action)}” trên cùng chứng từ`);
    }
  }

  private async findSoDConflicts(
    tenantId: string,
    actor: Actor,
    doctype: string,
    name: string,
    action: string,
    blockOnly: boolean,
  ): Promise<JsonObject[]> {
    const rules = await this.db.prepare(
      `SELECT name,payload_json FROM documents
       WHERE tenant_id=?1 AND doctype='SoD Rule' AND docstatus=1
         AND json_extract(payload_json,'$.workflow_state')='Published'
         AND (COALESCE(json_extract(payload_json,'$.document_type'),'')='' OR json_extract(payload_json,'$.document_type')=?2)`,
    ).bind(tenantId, doctype).all<{ name: string; payload_json: string }>();
    if (!(rules.results ?? []).length) return [];
    const versions = await this.db.prepare(
      "SELECT actor,action FROM versions WHERE tenant_id=?1 AND doc_key=?2 AND actor=?3",
    ).bind(tenantId, `${doctype}:${name}`, actor.user_id).all<VersionActorRow>();
    const performed = new Set<string>();
    for (const version of versions.results ?? []) {
      actionAliases(doctype, version.action).forEach((value) => performed.add(value));
    }
    const current = actionAliases(doctype, action);
    const conflicts: JsonObject[] = [];
    for (const row of rules.results ?? []) {
      const rule = JSON.parse(row.payload_json) as JsonObject;
      const left = optionalText(rule.left_action).toLowerCase();
      const right = optionalText(rule.right_action).toLowerCase();
      const severity = optionalText(rule.severity) || "Block";
      if (blockOnly && severity !== "Block") continue;
      if ((performed.has(left) && current.has(right)) || (performed.has(right) && current.has(left))) {
        conflicts.push({ rule: row.name, severity, left_action: left, right_action: right, reason: optionalText(rule.reason) });
      }
    }
    return conflicts;
  }

  private async assertWithinActorScope(tenantId: string, actor: Actor, requested: Record<string, string>): Promise<void> {
    if (isSecurityManager(actor) || actor.roles.includes("Owner")) return;
    await this.assertWithinUserScope(tenantId, actor.user_id, requested);
  }

  private async assertWithinUserScope(tenantId: string, user: string, requested: Record<string, string>): Promise<void> {
    const result = await this.db.prepare(
      `SELECT allow_doctype,allow_name FROM erp_organization_scope_grants
       WHERE tenant_id=?1 AND user_id=?2 AND date(effective_from)<=date('now')
         AND (effective_to IS NULL OR date(effective_to)>=date('now'))`,
    ).bind(tenantId, user).all<ScopeGrantRow>();
    const grants = result.results ?? [];
    // No assignment means legacy tenant-wide scope. Once assignments exist they are a
    // strict ceiling and neither delegation nor a manager can widen them.
    if (!grants.length) return;
    for (const [doctype, name] of Object.entries(requested)) {
      if (!grants.some((grant) => grant.allow_doctype === doctype && grant.allow_name === name)) {
        throw errors.permission(`${doctype} ${name} nằm ngoài phạm vi hiệu lực của người ủy quyền`);
      }
    }
  }

  private async userRoles(tenantId: string, user: string): Promise<string[]> {
    const result = await this.db.prepare(
      `SELECT ur.role FROM user_roles ur JOIN roles r ON r.tenant_id=ur.tenant_id AND r.role=ur.role
       WHERE ur.tenant_id=?1 AND ur.user_id=?2 AND r.disabled=0 ORDER BY ur.role`,
    ).bind(tenantId, user).all<{ role: string }>();
    return (result.results ?? []).map((row) => row.role);
  }

  private async documentWithinDelegatedScope(
    tenantId: string,
    grantor: string,
    delegatedScope: JsonValue | undefined,
    document: JsonObject,
  ): Promise<boolean> {
    const fields: Record<string, string> = { Company: "company", Branch: "branch", Department: "department" };
    const explicit = isObject(delegatedScope) ? delegatedScope : {};
    for (const [doctype, fieldname] of Object.entries(fields)) {
      const documentValue = optionalText(document[fieldname]);
      const delegatedValue = optionalText(explicit[doctype]);
      if (delegatedValue && documentValue !== delegatedValue) return false;
    }
    const result = await this.db.prepare(
      `SELECT allow_doctype,allow_name FROM erp_organization_scope_grants
       WHERE tenant_id=?1 AND user_id=?2 AND date(effective_from)<=date('now')
         AND (effective_to IS NULL OR date(effective_to)>=date('now'))`,
    ).bind(tenantId, grantor).all<ScopeGrantRow>();
    const grants = result.results ?? [];
    if (!grants.length) return true;
    for (const [doctype, fieldname] of Object.entries(fields)) {
      const applicable = grants.filter((grant) => grant.allow_doctype === doctype);
      const documentValue = optionalText(document[fieldname]);
      if (applicable.length && (!documentValue || !applicable.some((grant) => grant.allow_name === documentValue))) return false;
    }
    return true;
  }

  private async assertMasterOrDocument(tenantId: string, doctype: string, name: string): Promise<void> {
    const master = await this.db.prepare(
      "SELECT 1 AS found FROM master_records WHERE tenant_id=?1 AND record_type=?2 AND name=?3 AND disabled=0 LIMIT 1",
    ).bind(tenantId, doctype, name).first<{ found: number }>();
    if (master) return;
    await this.requireDocument(tenantId, doctype, name);
  }

  private async requireMasterOrDocumentData(tenantId: string, doctype: string, name: string): Promise<JsonObject> {
    const master = await this.db.prepare(
      "SELECT data_json FROM master_records WHERE tenant_id=?1 AND record_type=?2 AND name=?3 AND disabled=0 LIMIT 1",
    ).bind(tenantId, doctype, name).first<{ data_json: string }>();
    if (master) {
      const parsed = JSON.parse(master.data_json) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as JsonObject;
      throw errors.database(`${doctype} ${name} has invalid master data`);
    }
    return (await this.requireDocument(tenantId, doctype, name)).payload;
  }

  private async requireDocument(tenantId: string, doctype: string, name: string): Promise<{ row: StoredDocumentRow; payload: JsonObject }> {
    const row = await this.db.prepare(
      "SELECT name,owner,docstatus,payload_json FROM documents WHERE tenant_id=?1 AND doctype=?2 AND name=?3 AND docstatus<>2",
    ).bind(tenantId, doctype, name).first<StoredDocumentRow>();
    if (!row) throw errors.reference(`${doctype} ${name} không tồn tại hoặc đã ngừng hiệu lực`);
    return { row, payload: JSON.parse(row.payload_json) as JsonObject };
  }

  private async assertActiveUser(tenantId: string, user: string, label: string): Promise<void> {
    const row = await this.db.prepare(
      "SELECT enabled FROM users WHERE tenant_id=?1 AND user_id=?2 LIMIT 1",
    ).bind(tenantId, user).first<{ enabled: number }>();
    if (!row || row.enabled !== 1) throw errors.reference(`${label} ${user} không tồn tại hoặc đã bị khóa`);
  }
}

function actionAliases(doctype: string, action: string): Set<string> {
  const normalized = action.trim().toLowerCase();
  const slug = doctype.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const aliases = new Set([normalized, `${normalized}_${slug}`]);
  if (normalized === "save") aliases.add("write");
  if (normalized === "submit") {
    aliases.add("approve");
    aliases.add(`approve_${slug}`);
    if (doctype === "Journal Entry") aliases.add("post_journal_entry");
    if (doctype === "Payroll Entry") aliases.add("approve_payroll");
  }
  if (normalized === "create") aliases.add(`prepare_${slug}`);
  return aliases;
}

function stampSystemCode(data: JsonObject, fieldname: string, name: string): void {
  const supplied = optionalText(data[fieldname]);
  if (supplied && supplied !== name) throw errors.validation(`${fieldname} is server-owned and must match the document name`);
  data[fieldname] = name;
}

function requiredText(value: JsonValue | undefined, label: string): string {
  const normalized = optionalText(value);
  if (!normalized) throw errors.validation(`${label} là bắt buộc`);
  return normalized;
}

function optionalText(value: JsonValue | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function requiredDate(value: JsonValue | undefined, label: string): string {
  const normalized = optionalDate(value, label);
  if (!normalized) throw errors.validation(`${label} là bắt buộc`);
  return normalized;
}

function optionalDate(value: JsonValue | undefined, label: string): string {
  const normalized = optionalText(value);
  if (!normalized) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00Z`))) {
    throw errors.validation(`${label} phải theo định dạng YYYY-MM-DD`);
  }
  return normalized;
}

function requiredDatetime(value: JsonValue | undefined, label: string): number {
  const normalized = requiredText(value, label);
  const timestamp = Date.parse(normalized);
  if (Number.isNaN(timestamp)) throw errors.validation(`${label} phải là thời gian ISO hợp lệ`);
  return timestamp;
}

function jsonArray(value: JsonValue | undefined, label: string): JsonValue[] {
  if (!Array.isArray(value)) throw errors.validation(`${label} phải là mảng JSON`);
  return value;
}

function stringArray(value: JsonValue | undefined, label: string): string[] {
  const values = jsonArray(value, label);
  if (!values.every((item) => typeof item === "string" && item.trim())) throw errors.validation(`${label} chỉ được chứa chuỗi không rỗng`);
  return [...new Set(values.map((item) => String(item).trim().toLowerCase()))];
}

function assertSafeRuleObject(value: JsonValue | undefined, label: string): void {
  if (!isObject(value)) throw errors.validation(`${label} phải là object JSON`);
  if (JSON.stringify(value).length > 32_000) throw errors.validation(`${label} vượt quá 32 KB`);
  const visit = (current: JsonValue | undefined): void => {
    if (Array.isArray(current)) { current.forEach(visit); return; }
    if (!isObject(current)) return;
    for (const [key, nested] of Object.entries(current)) {
      if (BLOCKED_RULE_KEYS.has(key.toLowerCase())) throw errors.validation(`${label} chứa toán tử không được phép: ${key}`);
      visit(nested);
    }
  };
  visit(value);
}

const APPROVAL_OPERATORS = new Set(["$eq", "$ne", "$gt", "$gte", "$lt", "$lte", "$in", "$not_in", "$exists"]);

function assertApprovalCondition(value: JsonValue | undefined, fields: Set<string>, path = "condition"): void {
  if (!isObject(value)) throw errors.validation("Approval condition must be a JSON object");
  for (const [key, expected] of Object.entries(value)) {
    if (key === "all" || key === "any") {
      if (!Array.isArray(expected) || !expected.length || expected.some((item) => !isObject(item as JsonValue))) {
        throw errors.validation(`${path}.${key} must be a non-empty array of condition objects`);
      }
      expected.forEach((item, index) => assertApprovalCondition(item as JsonValue, fields, `${path}.${key}[${index}]`));
      continue;
    }
    if (!fields.has(key)) throw errors.validation(`Approval condition references unknown field ${key}`);
    if (!isObject(expected as JsonValue)) continue;
    const operators = Object.keys(expected as JsonObject);
    if (!operators.length || operators.some((operator) => !APPROVAL_OPERATORS.has(operator))) {
      throw errors.validation(`Approval condition for ${key} contains an unsupported operator`);
    }
    for (const [operator, operand] of Object.entries(expected as JsonObject)) {
      if ((operator === "$in" || operator === "$not_in") && !Array.isArray(operand)) {
        throw errors.validation(`${operator} for ${key} must be an array`);
      }
      if (operator === "$exists" && typeof operand !== "boolean") {
        throw errors.validation(`$exists for ${key} must be true or false`);
      }
    }
  }
}

/** Safe, deterministic approval-policy DSL. Unsupported input never executes code. */
export function matchesApprovalCondition(condition: JsonValue | undefined, document: JsonObject): boolean {
  if (!isObject(condition)) return false;
  for (const [key, expected] of Object.entries(condition)) {
    if (key === "all") {
      if (!Array.isArray(expected) || !expected.every((item) => isObject(item as JsonValue) && matchesApprovalCondition(item as JsonValue, document))) return false;
      continue;
    }
    if (key === "any") {
      if (!Array.isArray(expected) || !expected.some((item) => isObject(item as JsonValue) && matchesApprovalCondition(item as JsonValue, document))) return false;
      continue;
    }
    const actual = document[key];
    if (!isObject(expected as JsonValue)) {
      if (!sameConditionValue(actual, expected as JsonValue)) return false;
      continue;
    }
    for (const [operator, operand] of Object.entries(expected as JsonObject)) {
      const comparison = compareConditionValues(actual, operand as JsonValue);
      const matched = operator === "$eq" ? sameConditionValue(actual, operand as JsonValue)
        : operator === "$ne" ? !sameConditionValue(actual, operand as JsonValue)
        : operator === "$gt" ? comparison > 0
        : operator === "$gte" ? comparison >= 0
        : operator === "$lt" ? comparison < 0
        : operator === "$lte" ? comparison <= 0
        : operator === "$in" ? Array.isArray(operand) && operand.some((item) => sameConditionValue(actual, item))
        : operator === "$not_in" ? Array.isArray(operand) && !operand.some((item) => sameConditionValue(actual, item))
        : operator === "$exists" ? Boolean(operand) === (actual !== undefined && actual !== null && actual !== "")
        : false;
      if (!matched) return false;
    }
  }
  return true;
}

function sameConditionValue(left: JsonValue | undefined, right: JsonValue): boolean {
  if (typeof left === "number" || typeof right === "number") {
    const a = Number(left); const b = Number(right);
    return Number.isFinite(a) && Number.isFinite(b) && a === b;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function compareConditionValues(left: JsonValue | undefined, right: JsonValue): number {
  const aNumber = Number(left); const bNumber = Number(right);
  if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;
  if (typeof left === "string" && typeof right === "string") return left.localeCompare(right);
  return Number.NaN;
}

function assertFieldRule(value: JsonValue | undefined, fields: Set<string>): void {
  if (!isObject(value)) throw errors.validation("Quyền trường phải là object JSON");
  const collectionKeys = new Set(["hidden", "mask", "read_only", "deny_write"]);
  const modes = new Set(["hidden", "mask", "read_only", "read-only", "deny_write", "deny-write"]);
  for (const [key, raw] of Object.entries(value)) {
    if (collectionKeys.has(key)) {
      if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string" || !fields.has(item))) {
        throw errors.validation(`Quyền trường ${key} chỉ được chứa fieldname có thật của tài nguyên`);
      }
      continue;
    }
    if (!fields.has(key) || typeof raw !== "string" || !modes.has(raw.trim().toLowerCase())) {
      throw errors.validation(`Quyền trường không hợp lệ tại ${key}`);
    }
  }
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseAuditJson(value: string | null): JsonValue {
  if (!value) return null;
  try { return JSON.parse(value) as JsonValue; }
  catch { return null; }
}

function redactAuditJson(value: JsonValue): JsonValue {
  const blocked = /(password|passwd|secret|token|private.?key|credential|raw.?xml|session|cookie)/i;
  if (Array.isArray(value)) return value.map(redactAuditJson);
  if (!isObject(value)) return value;
  const output: JsonObject = {};
  for (const [key, nested] of Object.entries(value)) {
    output[key] = blocked.test(key) ? "[REDACTED]" : redactAuditJson(nested as JsonValue);
  }
  return output;
}

function encodeAuditCursor(time: string, id: string): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify({ time, id })))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeAuditCursor(value?: string): { time: string; id: string } | null {
  if (!value) return null;
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const parsed = JSON.parse(decodeURIComponent(escape(atob(padded)))) as { time?: unknown; id?: unknown };
    if (typeof parsed.time !== "string" || typeof parsed.id !== "string") throw new Error("invalid");
    return { time: parsed.time, id: parsed.id };
  } catch {
    throw errors.validation("Audit cursor không hợp lệ");
  }
}

function requireAuditReader(actor: Actor): void {
  if (actor.user_id === "Administrator" || actor.roles.some((role) => ["Administrator", "System Manager", "Owner", "Internal Auditor"].includes(role))) return;
  throw errors.permission("Chỉ Owner, System Manager hoặc Internal Auditor được xem nhật ký kiểm toán toàn tenant");
}

function isSecurityManager(actor: Actor): boolean {
  return actor.user_id === "Administrator" || actor.roles.includes("Administrator") || actor.roles.includes("System Manager");
}
