import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CapabilityProfileAdmin } from "./CapabilityProfileAdmin.js";
import "./styles.css";

if (window.location.pathname === "/app-factory/capabilities") {
  const root = document.getElementById("root");
  if (!root) throw new Error("Runtime root element is missing");
  createRoot(root).render(<StrictMode><CapabilityProfileAdmin /></StrictMode>);
} else {
  void import("./main-base.js");
}
