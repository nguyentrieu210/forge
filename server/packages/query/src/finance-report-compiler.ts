import { errors } from "../../core/src/index.js";
import type { CompiledQuery, QueryRequest } from "./index.js";
import { FinanceStockControlQueryCompiler } from "./finance-stock-control.js";

/**
 * Public finance report compiler used by Query Worker.
 *
 * The legacy tenant-worker already owns the user-facing `Daily Detailed Ledger`
 * snapshot/freeze API. Keep that report identity out of the generic Query Worker
 * so two different report routes never return different semantics under one name.
 */
export class FinanceReportCompiler extends FinanceStockControlQueryCompiler {
  override compile(request: QueryRequest, forceSynchronous = false): CompiledQuery {
    if (request.report === "Finance Daily Detailed Ledger") {
      return super.compile({ ...request, report: "Daily Detailed Ledger" }, forceSynchronous);
    }
    if (request.report === "Daily Detailed Ledger") {
      throw errors.validation(
        "Daily Detailed Ledger is served by the tenant-worker snapshot API; use Finance Daily Detailed Ledger for the GL book projection",
      );
    }
    return super.compile(request, forceSynchronous);
  }
}
