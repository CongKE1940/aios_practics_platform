import { useId, useState } from "react";

export interface SidebarUserMenuProps {
  displayName: string;
  userTypeLabel: string;
  onProfile?: () => void;
  onLogout: () => void;
}

export function SidebarUserMenu({ displayName, userTypeLabel, onProfile, onLogout }: SidebarUserMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const avatarText = displayName.trim().slice(0, 1) || "用";

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
          {avatarText}
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
