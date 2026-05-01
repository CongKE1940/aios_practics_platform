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

export function normalizeAdminNavigationMenus(menus: MenuItem[]): MenuItem[] {
  return menus.map((menu) => ({
    ...menu,
    children: normalizeAdminNavigationMenus(menu.children ?? [])
  }));
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
  if (selectedPath.startsWith("/admin/dictionaries/")) {
    return "字典项管理";
  }

  switch (selectedPath) {
    case "/admin/workbench":
      return "工作台";
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
    case "/admin/exam-papers":
      return "试卷管理";
    case "/admin/exams/assembly":
      return "试卷组卷";
    case "/admin/challenges":
      return "质疑处理";
    case "/admin/analytics":
      return "数据看板";
    case "/admin/history":
      return "快照历史";
    case "/admin/profile":
      return "个人信息";
    case "/admin/system/config":
      return "系统配置";
    case "/admin/tenant/roles":
      return "租户角色配置";
    default:
      return "当前视图";
  }
}

export function getAdminUserTypeLabel(userType: LoginResponse["user"]["user_type"]): string {
  switch (userType) {
    case "sys_admin":
      return "平台管理员";
    case "tenant_admin":
      return "租户管理员";
    case "school_admin":
      return "学校/组织管理员";
    case "teacher":
      return "教师";
    case "student":
      return "学生";
    default:
      return userType;
  }
}

function menuContainsPath(menu: MenuItem, targetPath: string): boolean {
  if (menu.path === targetPath) {
    return true;
  }
  if (menu.path === "/admin/dictionaries" && targetPath.startsWith("/admin/dictionaries/")) {
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
