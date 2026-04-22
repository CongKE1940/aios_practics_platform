import type { ButtonHTMLAttributes, ReactNode } from "react";

import { canAccess } from "@aios/shared-utils";

export interface PermissionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  permissions: readonly string[];
  requiredPermissions?: readonly string[];
  fallback?: ReactNode;
}

export function PermissionButton({
  permissions,
  requiredPermissions,
  fallback = null,
  children,
  type = "button",
  ...buttonProps
}: PermissionButtonProps) {
  if (!canAccess(permissions, requiredPermissions)) {
    return <>{fallback}</>;
  }

  return (
    <button type={type} {...buttonProps}>
      {children}
    </button>
  );
}
