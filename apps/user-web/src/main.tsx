import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@aios/ui-web/src/ui-shell.css";
import "@aios/ui-web/src/learning-ops-theme.css";

import { UserApp } from "./app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <UserApp />
  </StrictMode>
);
