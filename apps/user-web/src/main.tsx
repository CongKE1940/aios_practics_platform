import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@aios/ui-web/src/aios-core.css";

import { UserApp } from "./app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <UserApp />
  </StrictMode>
);
