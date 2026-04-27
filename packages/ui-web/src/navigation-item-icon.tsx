interface NavigationItemIconProps {
  name: string;
  path?: string;
}

export function NavigationItemIcon({ name, path }: NavigationItemIconProps) {
  return (
    <span className="ui-nav-tree__icon" aria-hidden="true">
      <svg className="ui-nav-tree__svg" viewBox="0 0 24 24" fill="none" focusable="false">
        {renderIcon(resolveIconKey(name, path))}
      </svg>
    </span>
  );
}

type IconKey =
  | "analytics"
  | "bell"
  | "book"
  | "building"
  | "clipboard"
  | "clock"
  | "database"
  | "grid"
  | "help"
  | "layers"
  | "pencil"
  | "random"
  | "settings"
  | "shield"
  | "upload"
  | "users";

function resolveIconKey(name: string, path = ""): IconKey {
  if (path.includes("analytics") || name.includes("看板") || name.includes("数据")) {
    return "analytics";
  }
  if (path.includes("notices") || path.includes("notifications") || name.includes("公告") || name.includes("通知")) {
    return "bell";
  }
  if (path.includes("courses") || name.includes("课程")) {
    return "book";
  }
  if (path.includes("schools") || name.includes("学校")) {
    return "building";
  }
  if (path.includes("exams") || name.includes("考试")) {
    return "clipboard";
  }
  if (path.includes("history") || name.includes("历史") || name.includes("快照")) {
    return "clock";
  }
  if (path.includes("question-banks") || path.includes("teacher-banks") || name.includes("题库")) {
    return "database";
  }
  if (path.includes("workbench") || name.includes("工作台")) {
    return "grid";
  }
  if (path.includes("questions") || name.includes("题目") || name.includes("疑惑") || name.includes("错题")) {
    return "help";
  }
  if (path.includes("grades") || name.includes("年级") || name.includes("班级") || name.includes("组织")) {
    return "layers";
  }
  if (path.includes("practice") || name.includes("练题") || name.includes("熟题")) {
    return "pencil";
  }
  if (path.includes("assembly") || path.includes("random") || name.includes("随机")) {
    return "random";
  }
  if (path.includes("roles") || name.includes("角色") || name.includes("权限")) {
    return "shield";
  }
  if (path.includes("imports") || name.includes("导入")) {
    return "upload";
  }
  if (path.includes("users") || name.includes("用户") || name.includes("学生") || name.includes("教师")) {
    return "users";
  }
  if (path.includes("system") || name.includes("系统")) {
    return "settings";
  }
  if (path.includes("challenge") || name.includes("质疑") || name.includes("互动")) {
    return "help";
  }
  return "grid";
}

function renderIcon(key: IconKey) {
  switch (key) {
    case "analytics":
      return (
        <>
          <path d="M5 19V5" />
          <path d="M5 19h14" />
          <path d="M8.5 15.5v-4" />
          <path d="M12 15.5V8" />
          <path d="M15.5 15.5v-6" />
        </>
      );
    case "bell":
      return (
        <>
          <path d="M7.5 10.5a4.5 4.5 0 0 1 9 0c0 3 1.2 4.4 2 5H5.5c.8-.6 2-2 2-5Z" />
          <path d="M10 18a2.2 2.2 0 0 0 4 0" />
        </>
      );
    case "book":
      return (
        <>
          <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4H19v14H7.5A2.5 2.5 0 0 0 5 20V6.5Z" />
          <path d="M5 16.5A2.5 2.5 0 0 1 7.5 14H19" />
        </>
      );
    case "building":
      return (
        <>
          <path d="M5 20V7l7-3 7 3v13" />
          <path d="M9 20v-6h6v6" />
          <path d="M9 9h.01" />
          <path d="M12 9h.01" />
          <path d="M15 9h.01" />
        </>
      );
    case "clipboard":
      return (
        <>
          <path d="M9 5h6l1 2h2v13H6V7h2l1-2Z" />
          <path d="M9 11h6" />
          <path d="M9 15h4" />
        </>
      );
    case "clock":
      return (
        <>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 8v4l3 2" />
        </>
      );
    case "database":
      return (
        <>
          <ellipse cx="12" cy="6" rx="6.5" ry="3" />
          <path d="M5.5 6v6c0 1.7 2.9 3 6.5 3s6.5-1.3 6.5-3V6" />
          <path d="M5.5 12v6c0 1.7 2.9 3 6.5 3s6.5-1.3 6.5-3v-6" />
        </>
      );
    case "grid":
      return (
        <>
          <rect x="5" y="5" width="5" height="5" rx="1.2" />
          <rect x="14" y="5" width="5" height="5" rx="1.2" />
          <rect x="5" y="14" width="5" height="5" rx="1.2" />
          <rect x="14" y="14" width="5" height="5" rx="1.2" />
        </>
      );
    case "help":
      return (
        <>
          <circle cx="12" cy="12" r="7" />
          <path d="M9.8 9.4a2.3 2.3 0 0 1 4.4 1c0 1.8-2.2 2-2.2 3.6" />
          <path d="M12 17h.01" />
        </>
      );
    case "layers":
      return (
        <>
          <path d="m12 4 8 4-8 4-8-4 8-4Z" />
          <path d="m4 12 8 4 8-4" />
          <path d="m4 16 8 4 8-4" />
        </>
      );
    case "pencil":
      return (
        <>
          <path d="m5 17-.5 2.5L7 19l9.5-9.5-2-2L5 17Z" />
          <path d="m14.5 7.5 2-2 2 2-2 2" />
        </>
      );
    case "random":
      return (
        <>
          <path d="M5 7h3.5c3 0 4.2 10 7.5 10H19" />
          <path d="M16 14l3 3-3 3" />
          <path d="M5 17h3.5c1.3 0 2.2-1 3-2.4" />
          <path d="M16 4l3 3-3 3" />
        </>
      );
    case "settings":
      return (
        <>
          <circle cx="12" cy="12" r="2.7" />
          <path d="M12 4v2" />
          <path d="M12 18v2" />
          <path d="m6.3 6.3 1.4 1.4" />
          <path d="m16.3 16.3 1.4 1.4" />
          <path d="M4 12h2" />
          <path d="M18 12h2" />
          <path d="m6.3 17.7 1.4-1.4" />
          <path d="m16.3 7.7 1.4-1.4" />
        </>
      );
    case "shield":
      return (
        <>
          <path d="M12 4 18 6.5v5.2c0 3.8-2.4 6.8-6 8.3-3.6-1.5-6-4.5-6-8.3V6.5L12 4Z" />
          <path d="m9.5 12 1.7 1.7 3.5-4" />
        </>
      );
    case "upload":
      return (
        <>
          <path d="M12 16V5" />
          <path d="m8 9 4-4 4 4" />
          <path d="M5 18h14" />
        </>
      );
    case "users":
      return (
        <>
          <circle cx="9" cy="9" r="3" />
          <path d="M4.5 18c.8-2.8 2.3-4 4.5-4s3.7 1.2 4.5 4" />
          <path d="M15 11a2.5 2.5 0 0 0 0-5" />
          <path d="M16 14c1.8.3 3 1.5 3.5 4" />
        </>
      );
    default:
      return null;
  }
}
