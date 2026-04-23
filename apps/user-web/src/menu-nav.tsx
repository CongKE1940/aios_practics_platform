import type { MenuItem } from "@aios/api-sdk";

interface MenuNavProps {
  menus: MenuItem[];
  selectedPath: string;
  onSelect(path: string): void;
}

export function MenuNav({ menus, selectedPath, onSelect }: MenuNavProps) {
  if (menus.length === 0) {
    return <p>当前账号暂无可用功能</p>;
  }

  return (
    <nav aria-label="学习菜单">
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
}

function MenuNode({ menu, selectedPath, onSelect }: MenuNodeProps) {
  const hasChildren = menu.children.length > 0;
  const hasPath = typeof menu.path === "string" && menu.path.length > 0;
  const nextSelectedPath = getFirstRenderablePath(menu);

  return (
    <li>
      {hasPath ? (
        <button
          type="button"
          aria-pressed={selectedPath === nextSelectedPath}
          onClick={() => onSelect(nextSelectedPath)}
        >
          {menu.name}
        </button>
      ) : (
        <span>{menu.name}</span>
      )}
      {hasChildren ? (
        <ul>
          {menu.children.map((child) => (
            <MenuNode key={child.id} menu={child} selectedPath={selectedPath} onSelect={onSelect} />
          ))}
        </ul>
      ) : null}
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
