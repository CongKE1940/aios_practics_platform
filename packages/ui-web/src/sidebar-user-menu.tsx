import { useId, useState } from "react";

const DEFAULT_AVATAR_DATA_URI =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nODAnIGhlaWdodD0nODAnIHZpZXdCb3g9JzAgMCA4MCA4MCcgZmlsbD0nbm9uZScgeG1sbnM9J2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJz48cmVjdCB3aWR0aD0nODAnIGhlaWdodD0nODAnIHJ4PScyNCcgZmlsbD0nI2RCQUZFRScvPjxjaXJjbGUgY3g9JzQwJyBjeT0nMzAnIHI9JzE0JyBmaWxsPScjMjU2M0VCJyBmaWxsLW9wYWNpdHk9Jy44NScvPjxwYXRoIGQ9J00xOCA2NS41QzIwLjkgNTIuMyAzMC41IDQ3IDQwIDQ3YzkuNSAwIDE5LjEgNS4zIDIyIDE4LjUnIGZpbGw9JyMyNTYzRUInIGZpbGwtb3BhY2l0eT0nLjg1Jy8+PHBhdGggZD0nTTYxIDIzYzMuNSA0LjcgNS41IDEwLjUgNS41IDE3IDAgMTAuMS01LjIgMTktMTMgMjQuMScgc3Ryb2tlPScjMzhCREY4JyBzdHJva2Utd2lkdGg9JzQuNScgc3Ryb2tlLWxpbmVjYXA9J3JvdW5kJyBzdHJva2Utb3BhY2l0eT0nLjY1Jy8+PC9zdmc+";

export interface SidebarUserMenuProps {
  displayName: string;
  userTypeLabel: string;
  onProfile?: () => void;
  onLogout: () => void;
}

export function SidebarUserMenu({ displayName, userTypeLabel, onProfile, onLogout }: SidebarUserMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  return (
    <section className="ui-sidebar-user" aria-label="当前用户">
      <button
        type="button"
        className="ui-sidebar-user__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="ui-sidebar-user__avatar" aria-hidden="true">
          <img className="ui-sidebar-user__avatar-image" src={DEFAULT_AVATAR_DATA_URI} alt="" />
        </span>
        <span className="ui-sidebar-user__copy">
          <strong>{displayName}</strong>
          <small>{userTypeLabel}</small>
        </span>
        <span className="ui-sidebar-user__caret" aria-hidden="true">
          {open ? "⌃" : "⌄"}
        </span>
      </button>

      {open ? (
        <div id={menuId} className="ui-sidebar-user__menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onProfile?.();
              setOpen(false);
            }}
          >
            个人信息
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            退出登录
          </button>
        </div>
      ) : null}
    </section>
  );
}
