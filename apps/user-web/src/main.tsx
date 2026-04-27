import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@aios/ui-web/src/ui-shell.css";
import "@aios/ui-web/src/aios-redesign.css";
import "@aios/ui-web/src/navigation-redesign.css";

import { UserApp } from "./app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <UserApp />
  </StrictMode>
);
