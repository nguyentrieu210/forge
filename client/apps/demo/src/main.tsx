import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyBrand, isBrandMode } from "@metaforge/shell";
import { App } from "./App.js";
import { DialogDropdownWheelFixture } from "./DialogDropdownWheelFixture.js";
import { LiveApp } from "./LiveApp.js";

// Áp brand (data-brand) + theme trước render để không nháy màu. Default = Blue (design default).
const savedBrand = localStorage.getItem("metaforge-brand");
applyBrand(isBrandMode(savedBrand) ? savedBrand : "blue");

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");

const useDialogWheelFixture = new URLSearchParams(window.location.search).has("dialog-wheel-fixture");
// Fixture chỉ tồn tại để browser QA tái hiện đúng tổ hợp Dialog + Link dropdown của bảng child lớn.
const Root = useDialogWheelFixture
  ? DialogDropdownWheelFixture
  : import.meta.env.VITE_LIVE
    ? LiveApp
    : App;

createRoot(el).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
