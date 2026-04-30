import { useEffect, useState } from "react";

import type { MenuItem } from "@aios/api-sdk";
import { EmptyState, NavigationItemIcon } from "@aios/ui-web";

interface MenuNavProps {
  menus: MenuItem[];
  selectedPath: string;
  onSelect(path: string): void;
}

export function MenuNav({ menus, selectedPath, onSelect }: MenuNavProps) {
  if (menus.length === 0) {
    return <EmptyState title="当前账号暂无可用功能" description="请联系管理员分配课程或权限。" />;
  }

  return (
    <nav aria-label="学习菜单" className="ui-nav-tree">
      <div className="ui-nav-tree__title">
        <strong>学习导航</strong>
      </div>
      <ul>
        {menus.map((menu) => (
          <MenuNode key={menu.id} menu={menu} selectedPath={selectedPath} onSelect={onSelect} />
        ))}
      </ul>
    </nav>
  );
}

interface MenuNodeProps {
  menu: MenuItem;
  selectedPath: string;
  onSelect(path: string): void;
  depth?: number;
}

function MenuNode({ menu, selectedPath, onSelect, depth = 0 }: MenuNodeProps) {
  const hasChildren = menu.children.length > 0;
  const hasPath = typeof menu.path === "string" && menu.path.length > 0;
  const nextSelectedPath = getFirstRenderablePath(menu);
  const isActive = hasPath && selectedPath === menu.path;
  const isTrailActive = menuContainsPath(menu, selectedPath);
  const [open, setOpen] = useState(isTrailActive || depth === 0);

  useEffect(() => {
    if (isTrailActive) {
      setOpen(true);
    }
  }, [isTrailActive]);

  if (hasChildren) {
    return (
      <li>
        <button
          type="button"
          className={[
            "ui-nav-tree__group-trigger",
            isActive || isTrailActive ? "is-open" : "",
            isActive ? "is-active" : "",
            depth > 0 ? "is-child" : ""
          ]
            .filter(Boolean)
            .join(" ")}
          aria-expanded={open}
          aria-pressed={isActive}
          onClick={() => {
            setOpen((current) => !current);
            if (!open && nextSelectedPath && !isTrailActive) {
              onSelect(nextSelectedPath);
            }
          }}
        >
          <NavigationItemIcon name={menu.name} path={menu.path ?? ""} />
          <span>{menu.name}</span>
          <span aria-hidden="true" className="ui-nav-tree__caret">
            {open ? "⌄" : "›"}
          </span>
        </button>
        <ul className="ui-nav-tree__children" hidden={!open}>
          {menu.children.map((child) => (
            <MenuNode key={child.id} menu={child} selectedPath={selectedPath} onSelect={onSelect} depth={depth + 1} />
          ))}
        </ul>
      </li>
    );
  }

  return (
    <li>
      {hasPath ? (
        <button
          type="button"
          className={["ui-nav-tree__item", selectedPath === nextSelectedPath ? "is-active" : "", depth > 0 ? "is-child" : ""]
            .filter(Boolean)
            .join(" ")}
          aria-pressed={selectedPath === nextSelectedPath}
          onClick={() => onSelect(nextSelectedPath)}
        >
          <NavigationItemIcon name={menu.name} path={menu.path ?? ""} />
          <span>{menu.name}</span>
        </button>
      ) : (
        <span className="ui-nav-tree__group">{menu.name}</span>
      )}
    </li>
  );
}

function getFirstRenderablePath(menu: MenuItem): string {
  if (menu.children.length > 0) {
    for (const child of menu.children) {
      const childPath = getFirstRenderablePath(child);
      if (childPath) {
        return childPath;
      }
    }
  }

  return typeof menu.path === "string" ? menu.path : "";
}

function menuContainsPath(menu: MenuItem, targetPath: string): boolean {
  if (menu.path === targetPath) {
    return true;
  }

  return menu.children.some((child) => menuContainsPath(child, targetPath));
}
