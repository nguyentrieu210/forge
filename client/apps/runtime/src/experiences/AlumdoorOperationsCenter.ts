import { createElement, useLayoutEffect } from "react";
import { useMetaForge } from "@metaforge/views/provider";
import { AlumdoorSalesModeWorkspace } from "./AlumdoorSalesModeWorkspace.js";
import { AlumdoorSalesOrderOperationalQueue } from "./AlumdoorSalesOrderOperationalQueue.js";
import { installAlumdoorSalesPolicyBridge } from "./AlumdoorSalesPolicyBridge.js";

export function AlumdoorOperationsCenter() {
  const { adapter } = useMetaForge();
  const path = decodeURIComponent(window.location.pathname);
  const ordersRoute = path.endsWith("/x/alumdoor-operations:orders");

  useLayoutEffect(() => {
    if (ordersRoute) return undefined;
    return installAlumdoorSalesPolicyBridge(adapter);
  }, [adapter, ordersRoute]);

  const Component = ordersRoute
    ? AlumdoorSalesOrderOperationalQueue
    : AlumdoorSalesModeWorkspace;
  return createElement(Component);
}
