import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@aios/ui-web/src/ui-shell.css";
import "@aios/ui-web/src/aios-redesign.css";
import "@aios/ui-web/src/navigation-redesign.css";
import "@aios/ui-web/src/blue-navigation-theme.css";
import "@aios/ui-web/src/sidebar-interaction-fix.css";
import "@aios/ui-web/src/sidebar-state-stabilizer.css";
import "@aios/ui-web/src/user-fixed-shell-layout.css";
import "@aios/ui-web/src/fixed-shell-final-overrides.css";
import "@aios/ui-web/src/fixed-data-region-overrides.css";

import { UserApp } from "./app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <UserApp />
  </StrictMode>
);
