import { createElement } from "react";
import { AlumdoorSalesModeWorkspace } from "./AlumdoorSalesModeWorkspace.js";
import { AlumdoorSalesOrderOperationalQueue } from "./AlumdoorSalesOrderOperationalQueue.js";

export function AlumdoorOperationsCenter() {
  const path = decodeURIComponent(window.location.pathname);
  const Component = path.endsWith("/x/alumdoor-operations:orders")
    ? AlumdoorSalesOrderOperationalQueue
    : AlumdoorSalesModeWorkspace;
  return createElement(Component);
}
