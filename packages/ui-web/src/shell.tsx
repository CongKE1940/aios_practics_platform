import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

export interface AppShellProps {
  brand: ReactNode;
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
  sidebarCollapsed?: boolean;
}

export interface PageSectionProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export interface StatusNoticeProps {
  tone: "info" | "success" | "warning" | "danger";
  title: string;
  description?: string;
}

export interface EmptyStateProps {
  title: string;
  description?: string;
}

const SIDEBAR_EXPAND_TARGET_SELECTOR = ".ui-nav-tree__item, .ui-nav-tree__group-trigger, .ui-sidebar-user__trigger";
const THEME_STORAGE_KEY = "aios.ui.theme";

export function AppShell({ brand, sidebar, header, children, sidebarCollapsed = false }: AppShellProps) {
  const [sidebarPeeking, setSidebarPeeking] = useState(false);
  const [darkMode, setDarkMode] = useState(() => readInitialDarkMode());
  const shellClassName = [
    "ui-shell",
    sidebarCollapsed ? "is-sidebar-collapsed" : "",
    sidebarCollapsed && sidebarPeeking ? "is-sidebar-peeking" : ""
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const theme = darkMode ? "dark" : "light";
    document.documentElement.dataset.uiTheme = theme;
    document.body.dataset.uiTheme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore unavailable storage in restricted environments.
    }
  }, [darkMode]);

  function handleSidebarMouseEnter(event: MouseEvent<HTMLElement>) {
    if (!sidebarCollapsed) {
      return;
    }

    if ((event.target as Element).closest(SIDEBAR_EXPAND_TARGET_SELECTOR)) {
      setSidebarPeeking(true);
    }
  }

  function handleSidebarMouseMove(event: MouseEvent<HTMLElement>) {
    if (!sidebarCollapsed || sidebarPeeking) {
      return;
    }

    if ((event.target as Element).closest(SIDEBAR_EXPAND_TARGET_SELECTOR)) {
      setSidebarPeeking(true);
    }
  }

  function handleSidebarMouseLeave() {
    setSidebarPeeking(false);
    blurActiveSidebarElement();
  }

  return (
    <div className={shellClassName}>
      <aside
        className="ui-shell__sidebar"
        onMouseEnter={handleSidebarMouseEnter}
        onMouseMove={handleSidebarMouseMove}
        onMouseLeave={handleSidebarMouseLeave}
      >
        <div className="ui-shell__brand">{brand}</div>
        <div className="ui-shell__nav">{sidebar}</div>
      </aside>
      <div className="ui-shell__main">
        <header className="ui-shell__header">
          <div className="ui-shell__header-content">{header}</div>
          <div className="ui-shell__tools" aria-label="页面工具">
            <button
              type="button"
              className="ui-theme-toggle"
              role="switch"
              aria-label="暗夜模式"
              aria-checked={darkMode}
              title={darkMode ? "切换到日间模式" : "切换到暗夜模式"}
              onClick={() => setDarkMode((current) => !current)}
            >
              <span className="ui-theme-toggle__track" aria-hidden="true">
                <span className="ui-theme-toggle__thumb" />
              </span>
            </button>
          </div>
        </header>
        <div className="ui-shell__content">{children}</div>
      </div>
    </div>
  );
}

function readInitialDarkMode(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === "dark") {
      return true;
    }
    if (savedTheme === "light") {
      return false;
    }
  } catch {
    return false;
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function blurActiveSidebarElement() {
  if (typeof document === "undefined") {
    return;
  }

  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && activeElement.closest(".ui-shell__sidebar")) {
    activeElement.blur();
  }
}

export function PageSection({ title, description, actions, children }: PageSectionProps) {
  return (
    <section className="ui-page-section">
      <div className="ui-page-section__header">
        <div className="ui-page-section__copy">
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="ui-page-section__actions">{actions}</div> : null}
      </div>
      <div className="ui-surface ui-page-section__body">{children}</div>
    </section>
  );
}

export function StatusNotice({ tone, title, description }: StatusNoticeProps) {
  return (
    <div className={`ui-status ui-status--${tone}`} role="status">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="ui-empty-state">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}
