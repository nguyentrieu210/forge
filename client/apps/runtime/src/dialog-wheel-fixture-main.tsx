import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DialogDropdownWheelFixture } from "./DialogDropdownWheelFixture.js";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DialogDropdownWheelFixture />
  </StrictMode>,
);
