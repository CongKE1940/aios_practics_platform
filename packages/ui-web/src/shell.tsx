import { useState, type MouseEvent, type ReactNode } from "react";

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
const SIDEBAR_COLLAPSE_CLICK_SELECTOR = ".ui-nav-tree__item, .ui-sidebar-user__menu [role='menuitem']";

export function AppShell({ brand, sidebar, header, children, sidebarCollapsed = false }: AppShellProps) {
  const [sidebarPeeking, setSidebarPeeking] = useState(false);
  const shellClassName = [
    "ui-shell",
    sidebarCollapsed ? "is-sidebar-collapsed" : "",
    sidebarCollapsed && sidebarPeeking ? "is-sidebar-peeking" : ""
  ]
    .filter(Boolean)
    .join(" ");

  function handleSidebarMouseOver(event: MouseEvent<HTMLElement>) {
    if (!sidebarCollapsed || sidebarPeeking) {
      return;
    }

    if ((event.target as Element).closest(SIDEBAR_EXPAND_TARGET_SELECTOR)) {
      setSidebarPeeking(true);
    }
  }

  function handleSidebarMouseLeave() {
    setSidebarPeeking(false);
  }

  function handleSidebarClick(event: MouseEvent<HTMLElement>) {
    if (!sidebarCollapsed) {
      return;
    }

    if ((event.target as Element).closest(SIDEBAR_COLLAPSE_CLICK_SELECTOR)) {
      setSidebarPeeking(false);
      if (event.target instanceof HTMLElement) {
        event.target.blur();
      }
    }
  }

  return (
    <div className={shellClassName}>
      <aside
        className="ui-shell__sidebar"
        onMouseOver={handleSidebarMouseOver}
        onMouseLeave={handleSidebarMouseLeave}
        onClick={handleSidebarClick}
      >
        <div className="ui-shell__brand">{brand}</div>
        <div className="ui-shell__nav">{sidebar}</div>
      </aside>
      <div className="ui-shell__main">
        <header className="ui-shell__header">{header}</header>
        <div className="ui-shell__content">{children}</div>
      </div>
    </div>
  );
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
