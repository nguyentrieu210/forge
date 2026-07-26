import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyBrand, type BrandMode } from "@metaforge/shell";
import { App } from "./App.js";
import { LiveApp } from "./LiveApp.js";

// Áp brand (data-brand) + theme trước render để không nháy màu. Default = Blue (design default).
const savedBrand = (localStorage.getItem("metaforge-brand") as BrandMode | null) ?? "blue";
applyBrand(savedBrand === "blue" || savedBrand === "warm" || savedBrand === "zinc" ? savedBrand : "blue");

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");

// VITE_LIVE=1 → chạy thật với Frappe (metaforge.localhost); mặc định = mock App.
const Root = import.meta.env.VITE_LIVE ? LiveApp : App;

createRoot(el).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
