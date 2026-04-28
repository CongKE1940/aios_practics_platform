import { useEffect, useState } from "react";

import type { LoginResponse, MenuItem } from "@aios/api-sdk";
import { NavigationItemIcon } from "@aios/ui-web";

interface AdminMenuTreeProps {
  menus: MenuItem[];
  selectedPath: string;
  onSelect(path: string): void;
}

export function AdminMenuTree({ menus, selectedPath, onSelect }: AdminMenuTreeProps) {
  return (
    <nav aria-label="管理菜单" className="ui-nav-tree">
      <div className="ui-nav-tree__title">
        <strong>管理导航</strong>
      </div>
      <ul>
        <li>
          <button
            type="button"
            className={["ui-nav-tree__item", selectedPath === "" ? "is-active" : ""].filter(Boolean).join(" ")}
            aria-pressed={selectedPath === ""}
            onClick={() => onSelect("")}
          >
            <NavigationItemIcon name="工作台" path="/admin/workbench" />
            <span>工作台</span>
          </button>
        </li>
        {menus.map((menu) => (
          <AdminMenuNode key={menu.id} menu={menu} selectedPath={selectedPath} onSelect={onSelect} />
        ))}
      </ul>
    </nav>
  );
}

interface AdminMenuNodeProps {
  menu: MenuItem;
  selectedPath: string;
  onSelect(path: string): void;
  depth?: number;
}

function AdminMenuNode({ menu, selectedPath, onSelect, depth = 0 }: AdminMenuNodeProps) {
  const hasChildren = menu.children.length > 0;
  const hasPath = typeof menu.path === "string" && menu.path.length > 0;
  const isExactSelected = hasPath && selectedPath === menu.path;
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
            isTrailActive ? "is-open" : "",
            isExactSelected ? "is-active" : "",
            depth > 0 ? "is-child" : ""
          ]
            .filter(Boolean)
            .join(" ")}
          aria-expanded={open}
          aria-pressed={isExactSelected}
          onClick={() => setOpen((current) => !current)}
        >
          <NavigationItemIcon name={menu.name} path={menu.path ?? ""} />
          <span>{menu.name}</span>
          <span aria-hidden="true" className="ui-nav-tree__caret">
            {open ? "⌄" : "›"}
          </span>
        </button>
        <ul className="ui-nav-tree__children" hidden={!open}>
          {menu.children.map((child) => (
            <AdminMenuNode
              key={child.id}
              menu={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </ul>
      </li>
    );
  }

  if (!hasPath) {
    return (
      <li>
        <span className="ui-nav-tree__group">{menu.name}</span>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        className={["ui-nav-tree__item", isExactSelected ? "is-active" : "", depth > 0 ? "is-child" : ""]
          .filter(Boolean)
          .join(" ")}
        aria-pressed={isExactSelected}
        onClick={() => onSelect(menu.path ?? "")}
      >
        <NavigationItemIcon name={menu.name} path={menu.path ?? ""} />
        <span>{menu.name}</span>
      </button>
    </li>
  );
}

export function normalizeAdminNavigationMenus(menus: MenuItem[], permissions: string[] = []): MenuItem[] {
  const items = flattenMenuItems(menus);
  const entriesByPath = new Map<string, MenuItem>();

  for (const item of items) {
    if (item.path && !entriesByPath.has(item.path)) {
      entriesByPath.set(item.path, item);
    }
  }

  const menu = (path: string, fallbackName: string, fallbackId: number): MenuItem => {
    const existing = entriesByPath.get(path);
    return {
      id: existing?.id ?? fallbackId,
      name: fallbackName,
      path,
      children: []
    };
  };

  const result: MenuItem[] = [];

  result.push({
    id: 10_000,
    name: "组织管理",
    path: "",
    children: [
      menu("/admin/org/schools", "学校管理", 10_001),
      menu("/admin/org/grades", "年级管理", 10_002),
      menu("/admin/org/classes", "班级管理", 10_003)
    ]
  });

  const fixedPaths = new Set([
    "/admin/org",
    "/admin/org/schools",
    "/admin/org/grades",
    "/admin/org/classes",
    "/admin/users",
    "/admin/roles",
    "/admin/dictionaries",
    "/admin/analytics",
    "/admin/history"
  ]);

  const topLevelPaths = [
    ["/admin/courses", "课程管理", 20_001],
    ["/admin/question-banks", "题库管理", 20_002],
    ["/admin/questions", "题目管理", 20_003],
    ["/admin/questions/editor", "题目编辑器", 20_004],
    ["/admin/imports", "导入中心", 20_005],
    ["/admin/exams", "考试管理", 20_006],
    ["/admin/exams/assembly", "随机组卷", 20_007],
    ["/admin/challenges", "质疑处理", 20_008],
    ["/admin/notices", "公告通知", 20_009]
  ] as const;

  for (const [path, name, id] of topLevelPaths) {
    const exists = entriesByPath.has(path);
    const permissionFallback =
      (path.startsWith("/admin/exams") && permissions.includes("exam:manage")) ||
      (path === "/admin/challenges" && permissions.includes("question:manage"));
    if (exists || permissionFallback) {
      result.push(menu(path, name, id));
      fixedPaths.add(path);
    }
  }

  result.push({
    id: 30_000,
    name: "系统管理",
    path: "",
    children: [
      menu("/admin/users", "用户管理", 30_001),
      menu("/admin/roles", "角色权限", 30_002),
      menu("/admin/dictionaries", "字典管理", 30_003),
      menu("/admin/analytics", "数据看板", 30_004),
      menu("/admin/history", "快照历史", 30_005)
    ]
  });

  for (const original of menus) {
    if (original.path && fixedPaths.has(original.path)) {
      continue;
    }
    if (original.children.some((child) => child.path && fixedPaths.has(child.path))) {
      continue;
    }
    if (original.name === "系统管理" || original.name === "组织管理") {
      continue;
    }
    result.push(original);
  }

  return result;
}

export function resolveAdminNavigationBreadcrumb(selectedPath: string, menus: MenuItem[]): string[] {
  if (selectedPath === "") {
    return ["工作台"];
  }

  const labels = findMenuTrail(menus, selectedPath);
  if (labels.length > 0) {
    return labels;
  }

  return [resolveAdminPageTitle(selectedPath)];
}

export function resolveAdminPageTitle(selectedPath: string): string {
  switch (selectedPath) {
    case "/admin/org":
    case "/admin/org/schools":
      return "学校管理";
    case "/admin/org/grades":
      return "年级管理";
    case "/admin/org/classes":
      return "班级管理";
    case "/admin/courses":
      return "课程管理";
    case "/admin/users":
      return "用户管理";
    case "/admin/roles":
      return "角色权限";
    case "/admin/dictionaries":
      return "字典管理";
    case "/admin/notices":
      return "公告通知";
    case "/admin/question-banks":
      return "题库管理";
    case "/admin/questions":
      return "题目管理";
    case "/admin/questions/editor":
      return "题目编辑器";
    case "/admin/imports":
      return "导入中心";
    case "/admin/exams":
      return "考试管理";
    case "/admin/exams/assembly":
      return "随机组卷";
    case "/admin/challenges":
      return "质疑处理";
    case "/admin/analytics":
      return "数据看板";
    case "/admin/history":
      return "快照历史";
    default:
      return "当前视图";
  }
}

export function getAdminUserTypeLabel(userType: LoginResponse["user"]["user_type"]): string {
  switch (userType) {
    case "sys_admin":
      return "平台管理员";
    case "school_admin":
      return "学校管理员";
    case "teacher":
      return "教师";
    case "student":
      return "学生";
    default:
      return userType;
  }
}

function flattenMenuItems(menus: MenuItem[]): MenuItem[] {
  const items: MenuItem[] = [];

  for (const menu of menus) {
    items.push(menu);
    if (menu.children.length > 0) {
      items.push(...flattenMenuItems(menu.children));
    }
  }

  return items;
}

function menuContainsPath(menu: MenuItem, targetPath: string): boolean {
  if (menu.path === targetPath) {
    return true;
  }

  return menu.children.some((child) => menuContainsPath(child, targetPath));
}

function findMenuTrail(menus: MenuItem[], selectedPath: string, trail: string[] = []): string[] {
  for (const menu of menus) {
    const nextTrail = [...trail, menu.name];
    if (menu.path === selectedPath) {
      return nextTrail;
    }
    if (menu.children.length > 0) {
      const childTrail = findMenuTrail(menu.children, selectedPath, nextTrail);
      if (childTrail.length > 0) {
        return childTrail;
      }
    }
  }
  return [];
}
