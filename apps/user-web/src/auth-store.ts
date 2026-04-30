import type { UserSessionState, UserSessionStore } from "./auth-types";

const USER_SESSION_STORAGE_KEY = "aios.user.session";

export function createBrowserSessionStore(): UserSessionStore {
  return {
    load() {
      if (typeof window === "undefined" || !window.localStorage) {
        return null;
      }

      const raw = window.localStorage.getItem(USER_SESSION_STORAGE_KEY);
      if (!raw) {
        return null;
      }

      try {
        const parsed = JSON.parse(raw);
        if (!isUserSessionState(parsed)) {
          window.localStorage.removeItem(USER_SESSION_STORAGE_KEY);
          return null;
        }

        return parsed;
      } catch {
        window.localStorage.removeItem(USER_SESSION_STORAGE_KEY);
        return null;
      }
    },
    save(session) {
      if (typeof window === "undefined" || !window.localStorage) {
        return;
      }

      window.localStorage.setItem(USER_SESSION_STORAGE_KEY, JSON.stringify(session));
    },
    clear() {
      if (typeof window === "undefined" || !window.localStorage) {
        return;
      }

      window.localStorage.removeItem(USER_SESSION_STORAGE_KEY);
    }
  };
}

function isUserSessionState(value: unknown): value is UserSessionState {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.accessToken === "string" &&
    typeof value.refreshToken === "string" &&
    typeof value.expiresIn === "number" &&
    Array.isArray(value.menus) &&
    value.menus.every((menu) => isMenuItem(menu)) &&
    isUserInfo(value.user)
  );
}

function isMenuItem(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "number" &&
    typeof value.name === "string" &&
    typeof value.path === "string" &&
    Array.isArray(value.children) &&
    value.children.every((child) => isMenuItem(child))
  );
}

function isUserInfo(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const permissions = value.permissions;

  return (
    typeof value.id === "number" &&
    typeof value.tenant_id === "number" &&
    typeof value.display_name === "string" &&
    typeof value.user_type === "string" &&
    Array.isArray(value.roles) &&
    value.roles.every((role) => typeof role === "string") &&
    (permissions === undefined ||
      (Array.isArray(permissions) && permissions.every((permission) => typeof permission === "string")))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
