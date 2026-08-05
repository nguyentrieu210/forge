import { createElement } from "react";
import { AlumdoorOperationsCenter as AlumdoorSalesComposer } from "./AlumdoorSalesComposer.js";
import { AlumdoorSalesOrderQueue } from "./AlumdoorSalesOrderQueue.js";

export function AlumdoorOperationsCenter() {
  const path = decodeURIComponent(window.location.pathname);
  const Component = path.endsWith("/x/alumdoor-operations:orders")
    ? AlumdoorSalesOrderQueue
    : AlumdoorSalesComposer;
  return createElement(Component);
}
