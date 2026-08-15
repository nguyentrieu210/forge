import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CapabilityProfileAdmin } from "./CapabilityProfileAdmin.js";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Runtime root element is missing");

if (window.location.pathname === "/app-factory/capabilities") {
  createRoot(root).render(<StrictMode><CapabilityProfileAdmin /></StrictMode>);
} else if (window.location.pathname === "/erp/setup") {
  void import("./ERPSetupStandalone.js").then(({ ERPSetupStandalone }) => {
    createRoot(root).render(<StrictMode><ERPSetupStandalone /></StrictMode>);
  });
} else {
  void import("./main-base.js");
}
