import { createElement } from "react";
import { AlumdoorOperationsCenter as AlumdoorSalesComposer } from "./AlumdoorSalesComposer.js";
import { AlumdoorSalesOrderOperationalQueue } from "./AlumdoorSalesOrderOperationalQueue.js";

export function AlumdoorOperationsCenter() {
  const path = decodeURIComponent(window.location.pathname);
  const Component = path.endsWith("/x/alumdoor-operations:orders")
    ? AlumdoorSalesOrderOperationalQueue
    : AlumdoorSalesComposer;
  return createElement(Component);
}
