export interface PermissionMenuItem {
  key: string;
  label: string;
  requiredPermissions?: readonly string[];
  children?: readonly PermissionMenuItem[];
}

export function canAccess(userPermissions: readonly string[], requiredPermissions?: readonly string[]): boolean {
  if (!requiredPermissions || requiredPermissions.length === 0) {
    return true;
  }

  const permissionSet = new Set(userPermissions);
  if (permissionSet.has("system:manage")) {
    return true;
  }
  if (permissionSet.has("tenant:manage") && !requiredPermissions.includes("system:manage")) {
    return true;
  }
  return requiredPermissions.every((permission) => permissionSet.has(permission));
}

export type RouteAccessDecision =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      reason: "PERMISSION_DENIED";
    };

export function resolveRouteAccess(
  userPermissions: readonly string[],
  requiredPermissions?: readonly string[]
): RouteAccessDecision {
  if (canAccess(userPermissions, requiredPermissions)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "PERMISSION_DENIED"
  };
}

export function filterMenuByPermissions(
  menus: readonly PermissionMenuItem[],
  userPermissions: readonly string[]
): PermissionMenuItem[] {
  return menus.flatMap((menu) => {
    if (!canAccess(userPermissions, menu.requiredPermissions)) {
      return [];
    }

    const children = menu.children
      ? filterMenuByPermissions(menu.children, userPermissions)
      : undefined;

    if (menu.children && (!children || children.length === 0)) {
      return [];
    }

    return [
      children
        ? {
            ...menu,
            children
          }
        : { ...menu }
    ];
  });
}
