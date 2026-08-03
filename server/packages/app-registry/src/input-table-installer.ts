import {
  AppInstaller as PlatformAwareAppInstaller,
} from "./platform-aware-installer.js";
import type {
  InstalledAppRecord,
  InstallResult,
} from "./installer.js";
import {
  decorateActionInputTables,
  lowerActionInputTablesForInstall,
  type AppActionWithInputTables,
} from "./action-input-table-compat.js";

export type InstalledAppRecordWithInputTables = Omit<InstalledAppRecord, "actions"> & {
  actions: AppActionWithInputTables[];
};

/**
 * AppInstaller exported by the package barrel while the input-table contract transitions
 * from compatibility transport to native manifest storage.
 *
 * Install lowers new metadata to the shape the proven core installer already validates and
 * commits transactionally. List decorates the stored action again so callers can consume the
 * first-class contract. Removing this class later should be a mechanical migration once the
 * canonical manifest parser stores `input_tables` natively.
 */
export class AppInstaller extends PlatformAwareAppInstaller {
  override async install(
    tenantId: string,
    packageValue: unknown,
    actor: string,
    now: string,
  ): Promise<InstallResult> {
    return super.install(
      tenantId,
      lowerActionInputTablesForInstall(packageValue),
      actor,
      now,
    );
  }

  override async list(tenantId: string): Promise<InstalledAppRecordWithInputTables[]> {
    const installed = await super.list(tenantId);
    return installed.map((record) => ({
      ...record,
      actions: decorateActionInputTables(record.actions),
    }));
  }
}
