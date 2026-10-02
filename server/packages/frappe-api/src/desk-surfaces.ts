import {
  blocksSelfApproval, combinedNavigation, errors, evaluateWorkflowCondition, parseQueryRequest, permissionAllows,
  type Actor, type DocTypeMeta, type ExtendedPermissionAction, type JsonObject, type JsonValue,
  type AppReportSpec, type CanonicalDocument, type ListFilter, type QueryFilter,
} from "./router-platform.js";
import type { FrappeArgs } from "./args.js";
import { toKernelFilters, toKernelSearch, toKernelSort } from "./filters.js";
import { toFrappeListRow } from "./doc-shape.js";
import { batchDisplayValues } from "./link-search.js";
import {
  CONTEXT_DIMENSIONS, OVERVIEW_MAX_DOCTYPES, clampPageLength, contextFilters, permittedNav,
  hasRequiredNavRole, requireMeta, stringOr, toKernelProjection,
} from "./router-helpers.js";
import { assertDocumentAction, isPlatformAdmin, loadReadable, workflowTransitionAccess } from "./document-access.js";
import type { FrappeRouterContext } from "./router.js";

// Các mặt bàn làm việc: bảng năng lực, hộp chờ duyệt, đếm việc đang mở, báo cáo truy vấn,
// ngữ cảnh nghiệp vụ, khung danh sách và bảng tổng quan.
//
// Bảy thứ này trả lời cùng một loại câu hỏi — "màn hình cần thấy gì" — nhưng từng nằm rải
// rác trong 4000 dòng router, xen giữa REST resource và dispatch method. Gom lại để sửa một
// mặt bàn không phải đọc cả bộ định tuyến.

/**
 * Effective capabilities, FAIL-CLOSED.
 *
 * Every flag is resolved by asking the permission service and treating any
 * refusal — or any unexpected error — as denied. The client greys out actions
 * from this, so an optimistic `true` would offer a button that then fails.
 */
export async function capabilities(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.requireText("doctype", 160);
  const name = args.text("name");
  const meta = await requireMeta(doctype, context);
  const document = name ? await context.documents.getDocument(context.tenantId, doctype, name) : null;
  if (name && !document) throw errors.notFound();
  return capabilityFlags(doctype, meta, document, context);
}

export async function capabilityFlags(
  doctype: string,
  meta: DocTypeMeta,
  document: CanonicalDocument | null,
  context: FrappeRouterContext,
): Promise<JsonObject> {
  const submittable = Boolean(meta.is_submittable);
  const check = async (action: ExtendedPermissionAction): Promise<boolean> => {
    try {
      await context.permissions.assert({
        actor: context.actor, tenantId: context.tenantId, doctype,
        ...(document ? { name: document.name, owner: document.owner, data: document.data } : {}),
        action,
      });
      return true;
    } catch {
      return false;
    }
  };
  const [read, checkedWrite, create, submit, cancel, amend] = await Promise.all([
    check("read"),
    check("save"),
    check("create"),
    submittable ? check("submit") : Promise.resolve(false),
    submittable ? check("cancel") : Promise.resolve(false),
    submittable ? check("amend") : Promise.resolve(false),
  ]);
  // A list request has no concrete owner/document. Asking the document permission
  // service to assert "save" in that shape is intentionally denied, which used to
  // hide every row action even for users with ordinary DocType write permission.
  // Owner-only rules stay false here; the kernel still re-checks the selected row.
  const write = document
    ? checkedWrite
    : isPlatformAdmin(context) || meta.permissions.some((permission) =>
      permissionAllows(permission, context.actor, "save"),
    );
  return {
    read,
    write,
    create,
    // Ở form có document cụ thể: chỉ bản nháp mới được xoá. Ở list không có document:
    // trả quyền write ở cấp DocType để giao diện có thể hiện thao tác; từng dòng vẫn bị
    // kernel kiểm tra docstatus và quyền lại khi người dùng xác nhận xoá.
    delete: document
      ? (document.docstatus === 0 || (meta.kind === "master" && meta.allow_delete_non_draft === true)) && write
      : write,
    submit,
    cancel,
    amend,
  };
}

export function numericPermissionFlags(flags: JsonObject): JsonObject {
  const output: JsonObject = {};
  // docinfo.permissions is 0/1, not booleans.
  for (const [key, value] of Object.entries(flags)) output[key] = value ? 1 : 0;
  return output;
}

export async function approvalInbox(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const requestedDoctype = args.text("doctype");
  const search = (args.text("search") ?? "").toLocaleLowerCase("vi");
  const limit = Math.min(Math.max(args.int("limit", 50), 1), 200);
  const items: JsonObject[] = [];
  for (const doctype of await context.metadata.listWorkflowDocTypes(context.tenantId)) {
    if (requestedDoctype && doctype !== requestedDoctype) continue;
    const meta = await context.metadata.getDocType(context.tenantId, doctype);
    if (!meta || meta.is_child) continue;
    const workflow = await context.metadata.getWorkflow(context.tenantId, doctype);
    if (!workflow) continue;
    for (const document of await context.documents.listDocumentsByDoctype<JsonObject>(context.tenantId, meta.name)) {
      if (document.docstatus === 2) continue;
      const state = String(document.data[workflow.state_field] ?? workflow.states[0]?.state ?? "");
      const candidates = workflow.transitions.filter((transition) => transition.state === state);
      if (!candidates.length) continue;
      try {
        await context.permissions.assert({
          actor: context.actor, tenantId: context.tenantId, doctype: meta.name, name: document.name,
          owner: document.owner, data: document.data, action: "save",
        });
      } catch { continue; }

      const actions: JsonObject[] = [];
      for (const transition of candidates) {
        if (transition.condition && !evaluateWorkflowCondition(transition.condition, document.data, document.data)) continue;
        const target = workflow.states.find((candidate) => candidate.state === transition.next_state);
        const targetDocstatus = Number(target?.docstatus ?? document.docstatus);
        if (blocksSelfApproval(transition, document.owner, context.actor.user_id, document.docstatus, targetDocstatus)) continue;
        const delegationAction = targetDocstatus > document.docstatus ? "submit" : transition.action;
        const decision = await workflowTransitionAccess(context, transition.allowed_role, meta.name, delegationAction, document.data);
        if (!decision.allowed) continue;
        actions.push({
          action: transition.action,
          next_state: transition.next_state,
          role: transition.allowed_role,
          ...(decision.delegation ? { delegation: decision.delegation, delegated_by: decision.grantor ?? null } : {}),
        });
      }
      if (!actions.length) continue;
      const titleValue = meta.title_field ? document.data[meta.title_field] : undefined;
      const title = typeof titleValue === "string" && titleValue.trim() ? titleValue.trim() : document.name;
      if (search && !`${meta.name} ${document.name} ${title} ${state}`.toLocaleLowerCase("vi").includes(search)) continue;
      items.push({
        doctype: meta.name,
        name: document.name,
        title,
        owner: document.owner,
        state,
        docstatus: document.docstatus,
        version: document.version,
        modified_at: document.modified_at,
        actions,
      });
    }
  }
  items.sort((left, right) => String(right.modified_at).localeCompare(String(left.modified_at)) || String(left.name).localeCompare(String(right.name)));
  return { items: items.slice(0, limit), total: items.length, limit };
}

/**
 * Open-document counts for the sidebar badges.
 *
 * Counted through the list service, so the number respects the actor's read scope
 * — a badge showing documents the user cannot open would be worse than no badge.
 */
export async function openCount(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.text("doctype");
  if (!doctype) return { count: 0, open_count: 0 };
  const name = args.text("name");
  if (name) {
    // Form sidebar: trả CÁC DocType đang trỏ trực tiếp tới bản ghi hiện tại.
    //
    // Bản cũ bỏ qua hoàn toàn `name`, rồi đếm chính DocType hiện tại theo docstatus. Shape trả về
    // `{count:number}` cũng không phải danh sách connection mà adapter cần, nên panel "Liên kết"
    // luôn rỗng dù Item đã có Item Price/Pricing Rule/Supplier Item trỏ tới.
    await assertDocumentAction(context, doctype, name, "read");
    const metas = await context.metadata.listDocTypes(context.tenantId);
    const related: JsonObject[] = [];
    for (const target of metas) {
      if (target.is_child) continue;
      for (const field of target.fields ?? []) {
        if (field.fieldtype !== "Link" || field.options !== doctype) continue;
        try {
          const result = await context.listService.count(context.actor, context.tenantId, {
            doctype: target.name,
            filters: [{ field: field.fieldname, operator: "eq", value: name }] as unknown as JsonValue,
          });
          const count = Number(result.count ?? 0);
          if (count <= 0) continue;
          related.push({
            name: target.name,
            label: target.label ?? target.name,
            relation_label: field.label ?? field.fieldname,
            fieldname: field.fieldname,
            filter_value: name,
            count,
            open_count: count,
          });
        } catch {
          // Không có quyền đọc DocType đích hoặc field không khả dụng trong list definition:
          // bỏ quan hệ đó, không dùng count làm existence oracle.
        }
      }
    }
    related.sort((a, b) =>
      String(a.label ?? a.name).localeCompare(String(b.label ?? b.name), context.language === "vi" ? "vi" : "en"));
    return { count: related };
  }
  try {
    const result = await context.listService.count(context.actor, context.tenantId, {
      doctype,
      filters: [{ field: "docstatus", operator: "eq", value: 0 }] as unknown as JsonValue,
    });
    const count = typeof result === "number" ? result : Number((result as { count?: number }).count ?? 0);
    return { count, open_count: count };
  } catch {
    // A doctype without a list definition or without read access reports zero
    // rather than failing the whole sidebar.
    return { count: 0, open_count: 0 };
  }
}

/**
 * Runs a server-defined report.
 *
 * `ignore_prepared_report` is honoured: the client re-runs synchronously when the
 * server queued a heavy report and has no cached result, because showing an empty
 * table would be read as "there is no stock" rather than "still calculating".
 */
export async function runQueryReport(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const report = args.requireText("report_name", 160);
  const forceSynchronous = args.bool("ignore_prepared_report", false);
  const rawFilters = args.json<JsonValue>("filters");

  /**
   * A report an installed app declares takes precedence over nothing and shadows nothing:
   * it is looked up FIRST because the platform's own names are fixed and few, so an app
   * report can only ever be a name the platform does not have.
   *
   * Permission is asserted against the DOCTYPE the report reads, not against the report's
   * name. Frappe conflates the two — the report is named after its doctype — but an app
   * report is called "Doanh thu theo lớp" and reads `Enrollment`, and checking the name
   * would look up a doctype that does not exist and let everyone through.
   */
  const appReport = await findAppReport(report, context);
  if (appReport) {
    await context.permissions.assert({
      actor: context.actor, tenantId: context.tenantId,
      doctype: appReport.doctype, action: "report",
    });
    const answer = await context.appReports.run(appReport, {
      tenant_id: context.tenantId,
      report,
      filters: await applicableFilters(appReport, normalizeReportFilters(rawFilters), context),
      order_by: [],
      limit: appReport.limit,
      offset: 0,
    }) as JsonObject;
    /*
     * Đơn mua: phần trăm đã nhận phải TÍNH LẠI cho báo cáo, y như đường danh sách.
     *
     * Giá trị lưu trong tài liệu là "0.00" từ lúc tạo đơn và không ai ghi đè — chỉ đường mở MỘT
     * chứng từ mới tính lại. Nên báo cáo "Đơn mua chưa nhận đủ" liệt kê cả những đơn đã về đủ,
     * và thủ kho đi giục nhà cung cấp những đơn không cần giục. Đường báo cáo đi lối riêng, nên
     * vá ở đường danh sách thôi là chưa đủ.
     */
    if (appReport.doctype === "Purchase Order" && Array.isArray(answer.result)) {
      const rows = answer.result.filter((row): row is JsonObject => Boolean(row) && typeof row === "object" && !Array.isArray(row));
      const tienDo = await context.documents.getPurchaseOrderProgress(
        context.tenantId,
        rows.map((row) => String(row.name ?? "")).filter(Boolean),
      );
      for (const row of rows) {
        const so = tienDo.get(String(row.name ?? ""));
        if (!so) continue;
        if ("received_percentage" in row) row.received_percentage = so.received.toFixed(2);
        if ("billed_percentage" in row) row.billed_percentage = so.billed.toFixed(2);
      }
      /*
       * Báo cáo tên là "chưa nhận đủ" thì phải chỉ còn đơn CHƯA nhận đủ.
       *
       * Không lọc được ở SQL: phần trăm vừa tính lại sau khi truy vấn xong, còn giá trị nằm
       * trong tài liệu là "0.00" cũ. Lọc ở đây, sau khi đã có số thật. Tên báo cáo mà liệt kê cả
       * đơn đã về đủ thì thủ kho đi giục nhầm — đúng thứ bản test 23/08 báo.
       */
      if (appReport.name === "Đơn mua chưa nhận đủ") {
        answer.result = rows.filter((row) => Number(row.received_percentage ?? 0) < 100);
      }
    }
    return { ...answer, columns: frappeReportColumns(answer.columns) };
  }

  await context.permissions.assert({
    actor: context.actor, tenantId: context.tenantId,
    // Report access is gated on the report permission of the doctype the report is
    // named after when one exists; otherwise on being able to read reports at all.
    doctype: report, action: "report",
  }).catch(async () => {
    if (!isPlatformAdmin(context)) throw errors.permission(`Report ${report} is not permitted`);
  });

  const result = await context.reports.run({
    tenant_id: context.tenantId,
    report,
    filters: normalizeReportFilters(rawFilters),
    order_by: [],
    limit: 500,
    offset: 0,
  }, forceSynchronous);

  if (result.prepared === true) {
    // Frappe's shape for "queued, nothing cached": no columns, no result, `doc`
    // null. The client detects exactly this and re-runs synchronously.
    return { prepared_report: true, doc: null, columns: [], result: [] };
  }
  return {
    result: result.result ?? [],
    columns: frappeReportColumns(result.columns),
    message: result.message ?? null,
    chart: result.chart ?? null,
    report_summary: result.report_summary ?? [],
    skip_total_row: result.skip_total_row === true ? 1 : 0,
  };
}

export async function businessContext(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const requested = args.array<string>("dimensions");
  const wanted = requested?.length ? new Set(requested.map((entry) => String(entry))) : null;
  const requestedSelection = args.object("selection") ?? {};
  const permissions = await context.access.listUserPermissions(context.tenantId, context.actor.user_id);

  const dimensions: JsonObject[] = [];
  const selection: JsonObject = {};
  for (const dimension of CONTEXT_DIMENSIONS) {
    if (wanted && !wanted.has(dimension.key)) continue;
    const restrictions = permissions.filter((record) => record.allow_doctype === dimension.recordType);
    let options = await context.documents.listMasterRecords(context.tenantId, dimension.recordType, 200);
    // Warehouse is managed through the Warehouse DocType. Historical app fixtures
    // also live in master_records, but they are not rows in the Warehouse screen
    // and can survive after that screen has been cleared. Reading the generic union
    // here exposed those stale fixtures as ghost warehouses in the global selector.
    // Keep this selector on the same document source as the CRUD screen.
    if (dimension.recordType === "Warehouse") {
      const warehouseDocuments = await context.documents.listDocumentsByDoctype<JsonObject>(context.tenantId, "Warehouse");
      options = warehouseDocuments
        .filter((document) => document.docstatus !== 2
          && document.data.disabled !== true
          && Number(document.data.disabled ?? 0) !== 1
          && Number(document.data.is_group ?? 0) !== 1)
        .map((document) => ({
          name: document.name,
          label: typeof document.data.warehouse_name === "string" && document.data.warehouse_name.trim()
            ? document.data.warehouse_name.trim()
            : document.name,
        }))
        .sort((left, right) => left.name.localeCompare(right.name))
        .slice(0, 200);
    }
    const permitted = restrictions.length
      ? options.filter((option) => restrictions.some((record) => record.allow_name === option.name))
      : options;
    const permissionDefault = restrictions.find((record) => record.is_default)?.allow_name;
    const locked = restrictions.length === 1 && permitted.length === 1;
    const defaultValue = dimension.required
      ? permissionDefault ?? permitted[0]?.name
      : locked
        ? permitted[0]?.name
        : undefined;
    const selectedValue = resolveContextDimensionValue(
      requestedSelection[dimension.key],
      permitted.map((option) => option.name),
      { required: dimension.required, locked, ...(defaultValue ? { defaultValue } : {}) },
    );
    if (selectedValue) selection[dimension.key] = selectedValue;

    dimensions.push({
      key: dimension.key,
      label: dimension.label,
      // A dimension with no master data is reported disabled rather than as an
      // empty dropdown the user would try to use.
      enabled: permitted.length > 0,
      required: dimension.required,
      // Locked when a User Permission pins exactly one value: the user has no
      // choice to make, and offering one would imply they do.
      locked,
      ...(dimension.dependsOn ? { dependsOn: dimension.dependsOn } : {}),
      ...(defaultValue ? { defaultValue } : {}),
      options: permitted.map((option) => ({ value: option.name, label: option.label })) as unknown as JsonValue,
    });
  }
  return { dimensions: dimensions as unknown as JsonValue, selection };
}

export async function listView(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const doctype = args.requireText("doctype", 160);
  const requested = args.array<string>("fields") ?? ["name"];
  const contextual = await contextFilters(doctype, args.object("context") ?? {}, context);
  const filters = [
    ...toKernelFilters(args.json("filters"), doctype),
    ...contextual,
  ];
  const search = toKernelSearch(args.json("or_filters"));
  const sort = toKernelSort(args.text("order_by"));
  const listBody: JsonObject = {
    doctype,
    ...(requested.includes("*") ? {} : { fields: toKernelProjection(requested.map(String)) }),
    filters: filters as unknown as JsonValue,
    limit: clampPageLength(args.int("page_length", args.int("limit_page_length", 20))),
    offset: args.int("limit_start", 0),
    ...(search ? { search } : {}),
    ...(sort.length ? { sort: sort as unknown as JsonValue } : {}),
  };
  const countBody: JsonObject = {
    doctype,
    filters: filters as unknown as JsonValue,
    ...(search ? { search } : {}),
  };
  const metaPromise = requireMeta(doctype, context);
  const [page, rawCount, meta, flags] = await Promise.all([
    context.listService.list(context.actor, context.tenantId, listBody),
    context.listService.count(context.actor, context.tenantId, countBody),
    metaPromise,
    metaPromise.then((value) => capabilityFlags(doctype, value, null, context)),
  ]);
  const rows = page.rows.map((row) => toFrappeListRow(row as JsonObject));

  /*
   * Đơn mua: phần trăm đã nhận / đã xuất hoá đơn phải TÍNH LẠI cho danh sách.
   *
   * Giá trị lưu trong `documents` là "0.00" từ lúc tạo đơn và không ai ghi đè; chỉ đường mở MỘT
   * chứng từ mới tính lại. Nên trước 23/08/2026, mở DMH-2026-0009 ra thấy 100,00% còn danh sách
   * và báo cáo "Đơn mua chưa nhận đủ" đều thấy 0,00% — thủ kho đi giục nhà cung cấp những đơn
   * đã về đủ. Một truy vấn gộp cho cả trang, không đọc từng đơn một.
   */
  if (doctype === "Purchase Order" && rows.length) {
    const tienDo = await context.documents.getPurchaseOrderProgress(
      context.tenantId,
      rows.map((row) => String(row.name ?? "")).filter(Boolean),
    );
    for (const row of rows) {
      const so = tienDo.get(String(row.name ?? ""));
      if (!so) continue;
      if ("received_percentage" in row) row.received_percentage = so.received.toFixed(2);
      if ("billed_percentage" in row) row.billed_percentage = so.billed.toFixed(2);
    }
  }
  const linkFields = meta.fields.filter((field) => field.fieldtype === "Link" && field.options);
  const displayItems: Array<{ doctype: string; name: string }> = [];
  for (const row of rows) {
    for (const field of linkFields) {
      const value = row[field.fieldname];
      if (typeof value === "string" && value) {
        displayItems.push({ doctype: field.options!, name: value });
      }
    }
  }
  const displayValues = await batchDisplayValues(
    [...new Map(displayItems.map((item) => [`${item.doctype}\u0000${item.name}`, item])).values()],
    context,
  );
  const count = typeof rawCount === "number" ? rawCount : Number((rawCount as { count?: number }).count ?? 0);
  return {
    rows: rows as unknown as JsonValue,
    count,
    capabilities: flags,
    display_values: displayValues as unknown as JsonValue,
  };
}

export async function overviewDashboard(args: FrappeArgs, context: FrappeRouterContext): Promise<JsonObject> {
  const requested = args.text("domain") ?? args.text("app");
  const installed = await context.apps.list(context.tenantId);
  // `domain` names a client-side grouping, not an app id, so it is matched loosely and
  // never used to exclude everything — an unrecognised domain shows the whole tenant
  // rather than an empty screen the user cannot explain.
  const matched = requested
    ? installed.filter((app) => app.app_id === requested || app.client?.domain === requested)
    : installed;
  const apps = requested && matched.length ? matched : installed;

  const metrics: JsonObject[] = [];
  const tasks: JsonObject[] = [];
  const charts: JsonObject[] = [];
  const actions: JsonObject[] = [];

  const doctypes: Array<{ key: string; label: string; icon?: string; app: string }> = [];
  const permittedByApp = await Promise.all(apps.map(async (app) => ({
    app,
    nav: await permittedNav(app.nav, context),
  })));
  for (const { app, nav } of permittedByApp) {
    for (const item of nav) {
      if (item.kind !== "doctype" || doctypes.some((entry) => entry.key === item.key)) continue;
      doctypes.push({ key: item.key, label: item.label, ...(item.icon ? { icon: item.icon } : {}), app: app.app_id });
    }
  }

  /**
   * Counts through `toKernelFilters`, the SAME translator every other list path uses.
   *
   * Handing the kernel a raw Frappe-shaped filter looks like it should work and does not:
   * field names differ (`modified` vs `modified_at`) and the operator form is not the one
   * the compiler expects. It fails silently into the catch below, so the dashboard renders
   * with every state count missing and no error anywhere — which is exactly what happened
   * on the first run: twelve correct totals and not one task.
   */
  const count = async (doctype: string, filters?: JsonValue): Promise<number> => {
    const result = await context.listService.count(context.actor, context.tenantId, {
      doctype,
      ...(filters === undefined ? {} : { filters: toKernelFilters(filters, doctype) as unknown as JsonValue }),
    });
    return typeof result === "number" ? result : Number((result as { count?: number }).count ?? 0);
  };

  /**
   * Every doctype's numbers are fetched CONCURRENTLY, then folded in declaration order.
   *
   * Written as a plain `for … await` first, and that cost roughly what you would expect:
   * one round trip per doctype, plus one per workflow state, all in series. On a tenant
   * with nine doctypes the dashboard took ~800 ms to answer while each individual query
   * took ~20 ms — the screen was not doing hard work, it was queueing.
   *
   * The fold below stays sequential on purpose: metrics, tasks and charts are arrays the
   * client renders in order, and resolving concurrently while APPENDING concurrently
   * would reorder the cards run to run for no reason a user could understand.
   */
  const perDoctype = await Promise.all(doctypes.slice(0, OVERVIEW_MAX_DOCTYPES).map(async (entry) => {
    const [total, workflow] = await Promise.all([
      count(entry.key).catch(() => null),
      context.metadata.getWorkflow(context.tenantId, entry.key),
    ]);
    if (total === null) {
      // A doctype that cannot be counted is skipped, not reported as zero: "0 học viên"
      // on a tenant with 120 of them is a lie, while a missing card is visibly missing.
      return { entry, total: null, workflow: null, states: [] as Array<{ state: string; docstatus: number; count: number }> };
    }
    if (!workflow?.is_active) return { entry, total, workflow: null, states: [] as Array<{ state: string; docstatus: number; count: number }> };
    // Deliberately NOT wrapped in a catch. A state count that fails and is swallowed
    // produces a dashboard reporting "0 việc đang chờ" on a tenant with sixty — a
    // confident lie, and the exact failure this whole screen exists to prevent.
    const states = await Promise.all(workflow.states.slice(0, OVERVIEW_MAX_STATES).map(async (state) => ({
      state: state.state,
      docstatus: state.docstatus,
      count: await count(entry.key, [[workflow.state_field || "workflow_state", "=", state.state]] as unknown as JsonValue),
    })));
    return { entry, total, workflow, states };
  }));

  for (const { entry, total, workflow, states } of perDoctype) {
    if (total === null) continue;
    metrics.push({
      key: `count:${entry.key}`,
      label: entry.label,
      value: total,
      icon: entry.icon ?? "layers",
      route: `/app/${encodeURIComponent(entry.key)}`,
      tone: "neutral",
      description: `Tổng số bản ghi`,
    });
    actions.push({ key: `new:${entry.key}`, label: `Thêm ${entry.label.toLowerCase()}`, icon: "plus", route: `/app/${encodeURIComponent(entry.key)}?new=1` });

    if (!workflow) continue;

    // States a transition can LEAVE are the ones with work outstanding — the same
    // derivation the approval inbox uses, so the number on this card and the number of
    // cards in that queue cannot disagree.
    const pending = [...new Set(workflow.transitions.map((transition) => transition.state))];
    for (const { state, docstatus, count: stateCount } of states) {
      if (!pending.includes(state) || stateCount === 0) continue;
      tasks.push({
        key: `pending:${entry.key}:${state}`,
        label: `${entry.label} · ${state}`,
        count: stateCount,
        tone: docstatus === 0 ? "warning" : "info",
        // Straight to the operational queue when the app declared one, so a number on a
        // dashboard is one click from the work it describes.
        route: `/x/${encodeURIComponent(`approval:${entry.key}`)}`,
        description: "Đang chờ xử lý",
      });
    }
  }

  // A workflow state is an operational queue, not automatically a meaningful chart.
  // Overview charts are rendered only from explicit report-backed declarations.
  const visibleCharts = apps
    .flatMap((app) => (app.charts ?? []).map((chart) => ({ app, chart })))
    .filter(({ chart }) => hasRequiredNavRole(context.actor, chart.roles))
    .slice(0, 3);
  for (const { app, chart } of visibleCharts) {
    const report = app.reports.find((candidate) => candidate.name === chart.source);
    if (!report) continue;
    try {
      await context.permissions.assert({
        actor: context.actor,
        tenantId: context.tenantId,
        doctype: report.doctype,
        action: "report",
      });
      const answer = await context.appReports.run(report, {
        tenant_id: context.tenantId,
        report: report.name,
        filters: await applicableFilters(report, [], context),
        order_by: [],
        limit: Math.min(report.limit, 12),
        offset: 0,
      });
      const rows = Array.isArray(answer.result) ? answer.result as JsonObject[] : [];
      const dimension = chart.dimensions[0]!;
      const columns = new Map(report.columns.map((column) => [column.field, column]));
      charts.push({
        key: `chart:${app.app_id}:${chart.name}`,
        label: chart.label,
        type: chart.type === "Line" ? "line" : chart.type === "Donut" || chart.type === "Pie" || chart.type === "Percentage" ? "donut" : "bar",
        labels: rows.map((row) => String(row[dimension] ?? "Chưa xác định")),
        series: chart.measures.map((measure) => ({
          name: columns.get(measure)?.label ?? measure,
          values: rows.map((row) => Number(row[measure] ?? 0)),
        })),
        route: chart.drilldown.route,
        emptyFallback: chart.emptyFallback,
      });
    } catch {
      // Permission or a stale stored report removes the card; it must never become a false zero.
    }
  }

  // Recent activity, from the doctypes most likely to move. Bounded to two so the
  // dashboard stays one screen's worth of queries.
  const activityEntries = doctypes
    .filter((candidate) => tasks.some((task) => String(task.key).includes(candidate.key)))
    .slice(0, 2);
  const activityGroups = await Promise.all(activityEntries.map(async (entry): Promise<JsonObject[]> => {
    try {
      const page = await context.listService.list(context.actor, context.tenantId, {
        doctype: entry.key,
        limit: 5,
        sort: [{ field: "modified_at", direction: "desc" }] as unknown as JsonValue,
      });
      return (page.rows as JsonObject[]).map((row) => ({
          key: `${entry.key}:${String(row.name)}`,
          label: `${entry.label} ${String(row.name)}`,
          ...(row.workflow_state ? { description: String(row.workflow_state) } : {}),
          ...(row.modified_at ? { timestamp: String(row.modified_at) } : {}),
          route: `/app/${encodeURIComponent(entry.key)}/${encodeURIComponent(String(row.name))}`,
        }));
    } catch {
      return [];
    }
  }));
  const activities = activityGroups.flat();

  const primary = apps.find((app) => app.client) ?? apps[0];
  return {
    key: requested ?? primary?.app_id ?? "forge",
    label: primary?.app_name ?? "Tổng quan",
    subtitle: metrics.length ? `${metrics.length} nhóm dữ liệu · ${tasks.reduce((sum, task) => sum + Number(task.count ?? 0), 0)} việc đang chờ` : "Chưa có dữ liệu để tổng hợp",
    metrics: metrics as unknown as JsonValue,
    charts: charts as unknown as JsonValue,
    tasks: tasks as unknown as JsonValue,
    activities: activities.slice(0, 8) as unknown as JsonValue,
    actions: actions.slice(0, 6) as unknown as JsonValue,
  };
}

/**
 * Report columns in the shape a Frappe client actually reads.
 *
 * The report engines describe a column as `{field, label, type}` — their own vocabulary.
 * Every Frappe consumer reads `{fieldname, label, fieldtype, options}`, and reads the
 * cell out of the row BY `fieldname`. Handing over the engine's names produced a table
 * with the right headers, the right row count, and every cell blank: the client asked
 * each row for `row[undefined]`. Nothing errored, so it read as "no data".
 *
 * Translated here, at the façade, because that is what this layer is for — the engines
 * should not have to know Frappe's field names, and the client should not have to know
 * theirs.
 */
function frappeReportColumns(columns: JsonValue | undefined): JsonValue {
  if (!Array.isArray(columns)) return [];
  return columns.map((entry) => {
    const column = (entry ?? {}) as JsonObject;
    // Already Frappe-shaped (a report engine may grow to emit it directly) — leave it.
    if (column.fieldname !== undefined) return column;
    const fieldtype = String(column.type ?? "Data");
    return {
      fieldname: String(column.field ?? ""),
      label: String(column.label ?? column.field ?? ""),
      fieldtype,
      ...(column.options === undefined ? {} : { options: column.options }),
      width: fieldtype === "Currency" || fieldtype === "Float" || fieldtype === "Int" ? 140 : 180,
    };
  }) as JsonValue;
}

/**
 * The installed app that declares this report, or null.
 *
 * Reports live in the manifest rather than in `app_objects` because they own no schema:
 * nothing else can collide with them, and uninstalling the app removes the row that
 * carries them. Two apps declaring the same report NAME is possible, and the first
 * installed wins — stated here rather than left to be discovered, but not worth a
 * migration to prevent, since a report that shadows another is visibly the wrong report
 * while a missing DocType is a broken app.
 */
async function findAppReport(name: string, context: FrappeRouterContext): Promise<AppReportSpec | null> {
  for (const installed of await context.apps.list(context.tenantId)) {
    for (const report of installed.reports ?? []) {
      if (report.name === name) return report;
    }
  }
  return null;
}

/**
 * Drops a context dimension the report's doctype does not have — and ONLY that.
 *
 * The distinction matters more than it looks. If the doctype has no such field, the
 * dimension does not apply to this data at all and ignoring it changes nothing. If the
 * doctype DOES have the field but the report did not declare it filterable, then dropping
 * it would silently widen the report past the scope the user selected — one branch's
 * manager reading every branch's numbers, with the branch still named on screen. That
 * stays a refusal, because it is an app defect and must be visible as one.
 */
async function applicableFilters(
  report: AppReportSpec,
  filters: QueryFilter[],
  context: FrappeRouterContext,
): Promise<QueryFilter[]> {
  const unknown = filters.filter((filter) => !report.filters.includes(filter.field));
  if (!unknown.length) return filters;
  const meta = await context.metadata.getDocType(context.tenantId, report.doctype);
  const fields = new Set((meta?.fields ?? []).map((field) => field.fieldname));
  const contextual = clientContextFilters();
  return filters.filter((filter) => {
    if (report.filters.includes(filter.field)) return true;
    if (contextual.has(filter.field) && !fields.has(filter.field)) return false;
    // Anything else reaches the compiler, which refuses it by name.
    return true;
  });
}

/** Frappe report filters arrive as an object; the report engine wants a list. */
function normalizeReportFilters(raw: JsonValue | undefined): QueryFilter[] {
  if (raw === undefined || raw === null || raw === "") return [];
  if (Array.isArray(raw)) {
    return parseQueryRequest({ report: "Report Filter Validation", filters: raw }, "__filter_validation__").filters ?? [];
  }
  if (typeof raw !== "object") throw errors.validation("filters must be an object or array");
  const filters: QueryFilter[] = [];
  for (const [field, value] of Object.entries(raw as JsonObject)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 2 && typeof value[0] === "string") {
      filters.push({ field, operator: value[0] as QueryFilter["operator"], value: value[1] ?? null });
      continue;
    }
    filters.push({ field, operator: "=", value });
  }
  // Frappe's array form carries the operator as user input. Run both forms through
  // the query package's parser before a compiler can place that operator in SQL.
  return parseQueryRequest({ report: "Report Filter Validation", filters }, "__filter_validation__").filters ?? [];
}

export function clientContextFilters(): Set<string> {
  // Derived from the one list rather than restated, so a dimension added there is
  // covered here without anyone remembering. A function because `CONTEXT_DIMENSIONS`
  // is declared further down the file and a top-level constant would read it too early.
  // `contextToReportFilters` renames the two date bounds on its way out, so they are not
  // dimension keys and have to be named.
  return new Set([...CONTEXT_DIMENSIONS.map((dimension) => dimension.key), "from_date", "to_date"]);
}

export function resolveContextDimensionValue(
  requested: JsonValue | undefined,
  permittedNames: string[],
  options: { required: boolean; locked: boolean; defaultValue?: string },
): string | undefined {
  const allowed = new Set(permittedNames);
  if (typeof requested === "string" && requested && allowed.has(requested)) return requested;
  if (options.locked && permittedNames.length === 1) return permittedNames[0];
  if (!options.required) return undefined;
  if (options.defaultValue && allowed.has(options.defaultValue)) return options.defaultValue;
  return permittedNames[0];
}

export const OVERVIEW_MAX_STATES = 6;
