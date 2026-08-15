import { DurableObject } from "cloudflare:workers";
import type { JsonObject, MutationCommand, MutationReceipt } from "../../../packages/contracts/src/index.js";
import { createO2CControllerRegistry } from "../../../packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../../../packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../../../packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../../../packages/clouderp-erpnext/src/index.js";
import {
  APP_FACTORY_APPROVAL_PROCESS_DOCTYPE,
  AppFactoryApprovalRuntime,
  registerAppFactoryControllers,
} from "../../../packages/app-registry/src/index.js";
import {
  D1RolloutPurchaseAllocationDomainStore,
  DocumentKernel,
  MutationSerialExecutor,
} from "../../../packages/document-kernel/src/index.js";
import { errors } from "../../../packages/core/src/index.js";
import { D1DocumentAccessStore, D1MetadataStore, GenericMetadataController, MetadataPermissionService } from "../../../packages/frappe-model/src/index.js";
import { registerIntegrationHubControllers } from "../../../packages/integration-hub/src/registry.js";
import { D1OrganizationSecurityGuard } from "../../../packages/organization-security/src/index.js";
import type { TenantEnv } from "./env.js";
import {
  commitAlumDoorAttendanceScan,
  type AlumDoorAttendanceScanInput,
} from "./attendance-scan-coordinator.js";
import {
  reviewAlumDoorAttendanceCorrection,
  submitAlumDoorAttendanceCorrection,
  type AlumDoorAttendanceCorrectionInput,
  type AlumDoorAttendanceCorrectionSubmitInput,
} from "./attendance-correction-coordinator.js";
import {
  approveAlumDoorPayroll,
  type AlumDoorPayrollApprovalInput,
} from "./payroll-coordinator.js";
import { isInventoryCoordinatedCommand, resolveInventoryCoordinatorKey } from "./inventory-coordinator.js";
import { PurchaseCommandSerialExecutor } from "./purchase-command-retry.js";

interface AggregateStub extends DurableObjectStub {
  mutate<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt>;
  mutateInventory<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt>;
  mutatePurchase<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt>;
  commitAlumDoorAttendanceScan(input: AlumDoorAttendanceScanInput): Promise<JsonObject>;
  submitAlumDoorAttendanceCorrection(input: AlumDoorAttendanceCorrectionSubmitInput): Promise<JsonObject>;
  reviewAlumDoorAttendanceCorrection(input: AlumDoorAttendanceCorrectionInput): Promise<JsonObject>;
  approveAlumDoorPayroll(input: AlumDoorPayrollApprovalInput): Promise<JsonObject>;
}

const PURCHASE_ALLOCATION_DOCTYPES = new Set(["Purchase Order", "Purchase Receipt"]);
const INVENTORY_EXECUTORS = new WeakMap<object, MutationSerialExecutor>();
const PURCHASE_EXECUTORS = new WeakMap<object, PurchaseCommandSerialExecutor>();
const APP_FACTORY_APPROVAL_EXECUTORS = new WeakMap<object, MutationSerialExecutor>();
const ATTENDANCE_EXECUTORS = new WeakMap<object, MutationSerialExecutor>();
const ATTENDANCE_CORRECTION_EXECUTORS = new WeakMap<object, MutationSerialExecutor>();
const PAYROLL_EXECUTORS = new WeakMap<object, MutationSerialExecutor>();

/** One Durable Object class serves the keyed business coordinators in the existing AGGREGATES namespace. */
export class AggregateCoordinator extends DurableObject<TenantEnv> {
  constructor(ctx: DurableObjectState, env: TenantEnv) { super(ctx, env); }

  async mutate<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt> {
    if (command.aggregate.doctype === APP_FACTORY_APPROVAL_PROCESS_DOCTYPE) {
      let executor = APP_FACTORY_APPROVAL_EXECUTORS.get(this);
      if (!executor) { executor = new MutationSerialExecutor(); APP_FACTORY_APPROVAL_EXECUTORS.set(this, executor); }
      return executor.execute(() => this.appFactoryApprovalRuntime().execute(command as MutationCommand<JsonObject>, new Date().toISOString()));
    }
    const { kernel, store } = this.commandServices();
    const inventoryKey = await resolveInventoryCoordinatorKey(command as MutationCommand<JsonObject>, store);
    if (inventoryKey) return (this.env.AGGREGATES.getByName(inventoryKey) as AggregateStub).mutateInventory(command);
    if (!PURCHASE_ALLOCATION_DOCTYPES.has(command.aggregate.doctype) || !["submit", "cancel"].includes(command.action)) return kernel.execute(command);
    let company = textField(command.document, "company");
    let supplier = textField(command.document, "supplier");
    if (!company || !supplier) {
      const existing = await store.getDocument<JsonObject>(command.tenant_id, command.aggregate.doctype, command.aggregate.name);
      company ||= textField(existing?.data, "company"); supplier ||= textField(existing?.data, "supplier");
    }
    if (!company || !supplier) throw errors.validation("Purchase allocation commands require company and supplier");
    return (this.env.AGGREGATES.getByName(`purchase:${command.tenant_id}:${encodeURIComponent(company)}:${encodeURIComponent(supplier)}`) as AggregateStub).mutatePurchase(command);
  }

  async mutateInventory<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt> {
    if (!isInventoryCoordinatedCommand(command as MutationCommand<JsonObject>)) throw errors.validation("mutateInventory accepts only coordinated inventory commands");
    let executor = INVENTORY_EXECUTORS.get(this);
    if (!executor) { executor = new MutationSerialExecutor(); INVENTORY_EXECUTORS.set(this, executor); }
    return executor.execute(() => this.commandServices().kernel.execute(command));
  }

  async mutatePurchase<T extends JsonObject>(command: MutationCommand<T>): Promise<MutationReceipt> {
    if (!PURCHASE_ALLOCATION_DOCTYPES.has(command.aggregate.doctype) || !["submit", "cancel"].includes(command.action)) throw errors.validation("mutatePurchase accepts only submitted purchase allocation commands");
    let executor = PURCHASE_EXECUTORS.get(this);
    if (!executor) { executor = new PurchaseCommandSerialExecutor(); PURCHASE_EXECUTORS.set(this, executor); }
    return executor.execute(() => this.commandServices().kernel.execute(command));
  }

  async commitAlumDoorAttendanceScan(input: AlumDoorAttendanceScanInput): Promise<JsonObject> {
    return this.withAttendanceExecutor(() => {
      const { kernel, store } = this.commandServices();
      return this.commitRateLimitedAttendanceScan(input, kernel, store);
    });
  }

  private async commitRateLimitedAttendanceScan(
    input: AlumDoorAttendanceScanInput,
    kernel: DocumentKernel,
    store: D1RolloutPurchaseAllocationDomainStore,
  ): Promise<JsonObject> {
    const registration = Boolean(input.employeeCode && input.newCredentialHash);
    if (registration) {
      const key = "attendance-registration-attempts";
      const now = Date.now();
      const storage = (this.ctx as unknown as { storage: {
        get<T>(key: string): Promise<T | undefined>;
        put(key: string, value: unknown): Promise<void>;
        delete(key: string): Promise<boolean>;
      } }).storage;
      const recent = ((await storage.get<number[]>(key)) ?? []).filter((at: number) => now - at < 15 * 60_000);
      if (recent.length >= 5) throw errors.rateLimited("Đã thử đăng ký thiết bị quá nhiều lần. Vui lòng chờ 15 phút hoặc liên hệ quản lý.");
      await storage.put(key, [...recent, now]);
    }
    const result = await commitAlumDoorAttendanceScan(input, { kernel, store });
    if (registration && result.device_registered === true) {
      const storage = (this.ctx as unknown as { storage: { delete(key: string): Promise<boolean> } }).storage;
      await storage.delete("attendance-registration-attempts");
    }
    return result;
  }

  async submitAlumDoorAttendanceCorrection(input: AlumDoorAttendanceCorrectionSubmitInput): Promise<JsonObject> {
    return this.withCorrectionExecutor(() => {
      const { kernel, store } = this.commandServices();
      return submitAlumDoorAttendanceCorrection(input, { kernel, store });
    });
  }

  async reviewAlumDoorAttendanceCorrection(input: AlumDoorAttendanceCorrectionInput): Promise<JsonObject> {
    return this.withCorrectionExecutor(() => {
      const { kernel, store } = this.commandServices();
      return reviewAlumDoorAttendanceCorrection(input, { kernel, store });
    });
  }

  async approveAlumDoorPayroll(input: AlumDoorPayrollApprovalInput): Promise<JsonObject> {
    let executor = PAYROLL_EXECUTORS.get(this);
    if (!executor) { executor = new MutationSerialExecutor(); PAYROLL_EXECUTORS.set(this, executor); }
    return executor.execute(() => {
      const { kernel, store } = this.commandServices();
      return approveAlumDoorPayroll(input, { kernel, store });
    });
  }

  private withAttendanceExecutor<T>(operation: () => Promise<T>): Promise<T> {
    let executor = ATTENDANCE_EXECUTORS.get(this);
    if (!executor) { executor = new MutationSerialExecutor(); ATTENDANCE_EXECUTORS.set(this, executor); }
    return executor.execute(operation);
  }

  private withCorrectionExecutor<T>(operation: () => Promise<T>): Promise<T> {
    let executor = ATTENDANCE_CORRECTION_EXECUTORS.get(this);
    if (!executor) { executor = new MutationSerialExecutor(); ATTENDANCE_CORRECTION_EXECUTORS.set(this, executor); }
    return executor.execute(operation);
  }

  private commandServices(): { kernel: DocumentKernel; store: D1RolloutPurchaseAllocationDomainStore } {
    const metadata = new D1MetadataStore(this.env.DB);
    const registry = registerIntegrationHubControllers(registerAppFactoryControllers(registerErpNextCoreControllers(registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry()))), metadata)).setFallback(new GenericMetadataController(metadata));
    const store = new D1RolloutPurchaseAllocationDomainStore(this.env.DB);
    return { store, kernel: new DocumentKernel(registry, store, new MetadataPermissionService(metadata, undefined, new D1DocumentAccessStore(this.env.DB))) };
  }

  private appFactoryApprovalRuntime(): AppFactoryApprovalRuntime {
    const metadata = new D1MetadataStore(this.env.DB); const access = new D1DocumentAccessStore(this.env.DB); const reader = new D1RolloutPurchaseAllocationDomainStore(this.env.DB);
    return new AppFactoryApprovalRuntime(this.env.DB, reader, new MetadataPermissionService(metadata, undefined, access), new D1OrganizationSecurityGuard(this.env.DB, metadata));
  }
}

function textField(value: JsonObject | undefined, field: string): string { const candidate = value?.[field]; return typeof candidate === "string" ? candidate.trim() : ""; }
