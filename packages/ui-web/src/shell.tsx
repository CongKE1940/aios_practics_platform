import type { ReactNode } from "react";

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

export function AppShell({ brand, sidebar, header, children, sidebarCollapsed = false }: AppShellProps) {
  return (
    <div className={["ui-shell", sidebarCollapsed ? "is-sidebar-collapsed" : ""].filter(Boolean).join(" ")}>
      <aside className="ui-shell__sidebar">
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
