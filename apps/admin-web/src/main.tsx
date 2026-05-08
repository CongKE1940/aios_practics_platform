import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@aios/ui-web/src/aios-core.css";

import { AdminApp } from "./app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>
);
