import { useEffect, useMemo, useState } from "react";

import type { Course, MenuItem, PageResult } from "@aios/api-sdk";

export interface CourseOverviewApi {
  listCourses(query?: { status?: string; page?: number; page_size?: number }): Promise<PageResult<Course>>;
}

interface CourseOverviewPageProps {
  api: CourseOverviewApi;
  menus: MenuItem[];
  userType: string;
  onNavigate(path: string): void;
}

export function CourseOverviewPage({ api, menus, userType, onNavigate }: CourseOverviewPageProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [message, setMessage] = useState("正在加载课程...");

  const entryPaths = useMemo(() => {
    const flatMenus = flattenMenuItems(menus);
    return {
      practice: flatMenus.find((item) => item.path === "/app/practice")?.path,
      exams: flatMenus.find((item) => item.path === "/app/exams")?.path,
      classLearning: flatMenus.find((item) => item.path === "/app/class-learning")?.path,
      teacherBanks: flatMenus.find((item) => item.path === "/app/teacher-banks")?.path
    };
  }, [menus]);

  useEffect(() => {
    let active = true;
    void api
      .listCourses({ status: "active", page: 1, page_size: 12 })
      .then((result) => {
        if (!active) {
          return;
        }
        setCourses(result.items);
        setMessage(result.items.length > 0 ? "" : "暂无课程。");
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setCourses([]);
        setMessage("课程加载失败，请稍后重试。");
      });

    return () => {
      active = false;
    };
  }, [api]);

  return (
    <section aria-label="我的课程页" className="ui-user-page">
      <div className="ui-page-header">
        <div>
          <p className="ui-page-breadcrumb">学习中心 / 我的课程</p>
          <h2>我的课程</h2>
        </div>
      </div>

      <section className="ui-user-card">
        <p className="ui-user-card__eyebrow">课程总览</p>
        <div className="ui-inline-actions">
          {entryPaths.practice ? (
            <button type="button" className="ui-button" onClick={() => onNavigate(entryPaths.practice!)}>
              进入练题
            </button>
          ) : null}
          {entryPaths.exams ? (
            <button type="button" className="ui-button ui-button--ghost" onClick={() => onNavigate(entryPaths.exams!)}>
              {userType === "teacher" ? "进入考试管理" : "进入考试"}
            </button>
          ) : null}
          {userType === "teacher" && entryPaths.teacherBanks ? (
            <button
              type="button"
              className="ui-button ui-button--ghost"
              onClick={() => onNavigate(entryPaths.teacherBanks!)}
            >
              进入老师题库
            </button>
          ) : null}
          {userType === "teacher" && entryPaths.classLearning ? (
            <button
              type="button"
              className="ui-button ui-button--ghost"
              onClick={() => onNavigate(entryPaths.classLearning!)}
            >
              查看班级学习
            </button>
          ) : null}
        </div>
      </section>

      {message ? <p>{message}</p> : null}

      {courses.length > 0 ? (
        <div className="ui-user-grid ui-user-grid--courses">
          {courses.map((course) => (
            <article key={course.id} className="ui-user-card">
              <p className="ui-user-card__eyebrow">课程</p>
              <h3>{course.name}</h3>
              <p>{course.description ?? "当前课程暂无简介。"}</p>
              <dl className="ui-user-kv">
                <div>
                  <dt>课程编码</dt>
                  <dd>{course.code}</dd>
                </div>
                <div>
                  <dt>起止时间</dt>
                  <dd>{formatCoursePeriod(course)}</dd>
                </div>
              </dl>
              <div className="ui-inline-actions">
                {entryPaths.practice ? (
                  <button type="button" className="ui-button" onClick={() => onNavigate(entryPaths.practice!)}>
                    进入练题
                  </button>
                ) : null}
                {entryPaths.exams ? (
                  <button type="button" className="ui-button ui-button--ghost" onClick={() => onNavigate(entryPaths.exams!)}>
                    {userType === "teacher" ? "进入考试管理" : "进入考试"}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
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

function formatCoursePeriod(course: Course): string {
  if (!course.start_at && !course.end_at) {
    return "-";
  }
  return `${course.start_at ?? "-"} 至 ${course.end_at ?? "-"}`;
}
