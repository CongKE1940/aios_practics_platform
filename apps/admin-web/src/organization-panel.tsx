import { useEffect, useMemo, useState, type FormEvent } from "react";

import type {
  ClassInput,
  ClassItem,
  Course,
  CourseInput,
  Grade,
  GradeInput,
  PageResult,
  School,
  SchoolInput
} from "@aios/api-sdk";

export interface OrganizationApi {
  listSchools(): Promise<PageResult<School>>;
  createSchool(body: SchoolInput): Promise<School>;
  disableSchool(id: number): Promise<boolean>;
  listGrades(): Promise<PageResult<Grade>>;
  createGrade(body: GradeInput): Promise<Grade>;
  disableGrade(id: number): Promise<boolean>;
  listClasses(): Promise<PageResult<ClassItem>>;
  createClass(body: ClassInput): Promise<ClassItem>;
  disableClass(id: number): Promise<boolean>;
  listCourses(): Promise<PageResult<Course>>;
  createCourse(body: CourseInput): Promise<Course>;
  disableCourse(id: number): Promise<boolean>;
}

export type OrganizationView = "schools" | "grades" | "classes" | "courses";

const defaultSchoolForm: SchoolInput = {
  code: "",
  name: ""
};

const defaultGradeForm = {
  school_id: "",
  code: "",
  name: "",
  grade_level: "",
  school_year: ""
};

const defaultClassForm = {
  school_id: "",
  grade_id: "",
  code: "",
  name: "",
  class_no: ""
};

const defaultCourseForm = {
  code: "",
  name: "",
  start_at: "",
  end_at: "",
  description: ""
};

const viewMeta: Record<OrganizationView, { eyebrow: string; title: string }> = {
  schools: {
    eyebrow: "组织管理",
    title: "学校与组织管理"
  },
  grades: {
    eyebrow: "组织管理",
    title: "年级管理"
  },
  classes: {
    eyebrow: "组织管理",
    title: "班级管理"
  },
  courses: {
    eyebrow: "课程管理",
    title: "课程管理"
  }
};

export function OrganizationPanel({
  api,
  view
}: {
  api: OrganizationApi;
  view?: OrganizationView;
}) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [schools, setSchools] = useState<School[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeView, setActiveView] = useState<OrganizationView>(view ?? "schools");
  const [selectedSchoolID, setSelectedSchoolID] = useState<number | null>(null);
  const [selectedGradeID, setSelectedGradeID] = useState<number | null>(null);
  const [selectedClassID, setSelectedClassID] = useState<number | null>(null);
  const [selectedCourseID, setSelectedCourseID] = useState<number | null>(null);
  const [schoolKeyword, setSchoolKeyword] = useState("");
  const [gradeKeyword, setGradeKeyword] = useState("");
  const [classKeyword, setClassKeyword] = useState("");
  const [courseKeyword, setCourseKeyword] = useState("");
  const [schoolForm, setSchoolForm] = useState(defaultSchoolForm);
  const [gradeForm, setGradeForm] = useState(defaultGradeForm);
  const [classForm, setClassForm] = useState(defaultClassForm);
  const [courseForm, setCourseForm] = useState(defaultCourseForm);

  useEffect(() => {
    if (view) {
      setActiveView(view);
    }
  }, [view]);

  async function loadAll() {
    setLoading(true);
    setErrorMessage("");
    try {
      const [schoolResult, gradeResult, classResult, courseResult] = await Promise.all([
        api.listSchools(),
        api.listGrades(),
        api.listClasses(),
        api.listCourses()
      ]);
      setSchools(schoolResult.items);
      setGrades(gradeResult.items);
      setClasses(classResult.items);
      setCourses(courseResult.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载组织数据失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [api]);

  useEffect(() => {
    if (!selectedSchoolID && schools.length > 0) {
      setSelectedSchoolID(schools[0].id);
    }
  }, [schools, selectedSchoolID]);

  useEffect(() => {
    if (!selectedGradeID && grades.length > 0) {
      setSelectedGradeID(grades[0].id);
    }
  }, [grades, selectedGradeID]);

  useEffect(() => {
    if (!selectedClassID && classes.length > 0) {
      setSelectedClassID(classes[0].id);
    }
  }, [classes, selectedClassID]);

  useEffect(() => {
    if (!selectedCourseID && courses.length > 0) {
      setSelectedCourseID(courses[0].id);
    }
  }, [courses, selectedCourseID]);

  const currentView = view ?? activeView;
  const showTabs = !view;
  const currentMeta = viewMeta[currentView];

  const schoolOptions = useMemo(
    () =>
      schools.map((school) => ({
        value: school.id,
        label: school.name
      })),
    [schools]
  );

  const filteredSchools = useMemo(
    () => schools.filter((school) => includesKeyword([school.name, school.code], schoolKeyword)),
    [schoolKeyword, schools]
  );

  const filteredGrades = useMemo(
    () =>
      grades.filter((grade) => {
        const schoolName = schools.find((school) => school.id === grade.school_id)?.name ?? "";
        return includesKeyword([grade.name, grade.code, schoolName, grade.school_year ?? ""], gradeKeyword);
      }),
    [gradeKeyword, grades, schools]
  );

  const filteredClasses = useMemo(
    () =>
      classes.filter((classItem) => {
        const gradeName = grades.find((grade) => grade.id === classItem.grade_id)?.name ?? "";
        const schoolName = schools.find((school) => school.id === classItem.school_id)?.name ?? "";
        return includesKeyword([classItem.name, classItem.code, gradeName, schoolName], classKeyword);
      }),
    [classKeyword, classes, grades, schools]
  );

  const filteredCourses = useMemo(
    () => courses.filter((course) => includesKeyword([course.name, course.code, course.description ?? ""], courseKeyword)),
    [courseKeyword, courses]
  );

  const selectedSchool = useMemo(
    () => schools.find((school) => school.id === selectedSchoolID) ?? filteredSchools[0] ?? null,
    [filteredSchools, schools, selectedSchoolID]
  );

  const selectedGrade = useMemo(
    () => grades.find((grade) => grade.id === selectedGradeID) ?? filteredGrades[0] ?? null,
    [filteredGrades, grades, selectedGradeID]
  );

  const selectedClass = useMemo(
    () => classes.find((classItem) => classItem.id === selectedClassID) ?? filteredClasses[0] ?? null,
    [classes, filteredClasses, selectedClassID]
  );

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseID) ?? filteredCourses[0] ?? null,
    [courses, filteredCourses, selectedCourseID]
  );

  const selectedSchoolGrades = useMemo(
    () => grades.filter((grade) => grade.school_id === selectedSchool?.id),
    [grades, selectedSchool?.id]
  );

  const selectedSchoolClasses = useMemo(
    () => classes.filter((classItem) => classItem.school_id === selectedSchool?.id),
    [classes, selectedSchool?.id]
  );

  const selectedGradeClasses = useMemo(
    () => classes.filter((classItem) => classItem.grade_id === selectedGrade?.id),
    [classes, selectedGrade?.id]
  );

  async function handleSchoolSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.createSchool(schoolForm);
    setSchoolForm(defaultSchoolForm);
    await loadAll();
  }

  async function handleGradeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.createGrade({
      school_id: Number(gradeForm.school_id),
      code: gradeForm.code,
      name: gradeForm.name,
      grade_level: Number(gradeForm.grade_level),
      school_year: gradeForm.school_year || undefined
    });
    setGradeForm(defaultGradeForm);
    await loadAll();
  }

  async function handleClassSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.createClass({
      school_id: Number(classForm.school_id),
      grade_id: Number(classForm.grade_id),
      code: classForm.code,
      name: classForm.name,
      class_no: classForm.class_no ? Number(classForm.class_no) : undefined
    });
    setClassForm(defaultClassForm);
    await loadAll();
  }

  async function handleCourseSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.createCourse({
      code: courseForm.code,
      name: courseForm.name,
      start_at: normalizeDateTimeValue(courseForm.start_at),
      end_at: normalizeDateTimeValue(courseForm.end_at),
      description: courseForm.description || undefined
    });
    setCourseForm(defaultCourseForm);
    await loadAll();
  }

  async function handleDisableSchool(id: number) {
    await api.disableSchool(id);
    await loadAll();
  }

  async function handleDisableGrade(id: number) {
    await api.disableGrade(id);
    await loadAll();
  }

  async function handleDisableClass(id: number) {
    await api.disableClass(id);
    await loadAll();
  }

  async function handleDisableCourse(id: number) {
    await api.disableCourse(id);
    await loadAll();
  }

  return (
    <section aria-label="组织管理面板" className="ui-admin-page">
      <section className="ui-admin-page__hero">
        <div className="ui-admin-page__header">
          <div>
            <span className="ui-admin-page__eyebrow">{currentMeta.eyebrow}</span>
            <h2>{currentMeta.title}</h2>
          </div>
          <div className="ui-admin-toolbar">
            <button type="button" className="ui-button ui-button--ghost" onClick={() => void loadAll()}>
              刷新数据
            </button>
          </div>
        </div>
        {showTabs ? (
          <div className="ui-admin-page__tabs" role="tablist" aria-label="组织管理视图">
            {(["schools", "grades", "classes", "courses"] as OrganizationView[]).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={currentView === item}
                className={["ui-admin-tab", currentView === item ? "is-active" : ""].filter(Boolean).join(" ")}
                onClick={() => setActiveView(item)}
              >
                {viewMeta[item].title}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {errorMessage ? <div className="ui-status ui-status--danger">{errorMessage}</div> : null}
      {loading ? <div className="ui-status ui-status--info">加载中...</div> : null}

      {!loading && currentView === "schools" ? (
        <div className="ui-admin-layout">
          <div className="ui-admin-main">
            <section className="ui-admin-filters ui-admin-card">
              <div className="ui-admin-filters__grid ui-admin-filters__grid--compact">
                <div className="ui-admin-form__field">
                  <label htmlFor="school_filter_keyword">搜索学校</label>
                  <input
                    id="school_filter_keyword"
                    placeholder="输入学校名称或编码"
                    value={schoolKeyword}
                    onChange={(event) => setSchoolKeyword(event.target.value)}
                  />
                </div>
              </div>
              <div className="ui-admin-filters__actions">
                <button type="button" className="ui-button ui-button--ghost" onClick={() => setSchoolKeyword("")}>
                  重置
                </button>
              </div>
            </section>

            <section className="ui-admin-table-card">
              <div className="ui-admin-table-card__header">
                <div>
                  <h3>学校列表</h3>
                </div>
              </div>
              <table className="ui-admin-table">
                <thead>
                  <tr>
                    <th>组织名称</th>
                    <th>组织编码</th>
                    <th>年级数</th>
                    <th>班级数</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSchools.map((school) => (
                    <tr key={school.id}>
                      <td>{school.name}</td>
                      <td>{school.code}</td>
                      <td>{grades.filter((grade) => grade.school_id === school.id).length}</td>
                      <td>{classes.filter((classItem) => classItem.school_id === school.id).length}</td>
                      <td>
                        <span className={statusClassName(school.status)}>{formatStatusLabel(school.status)}</span>
                      </td>
                      <td>
                        <div className="ui-admin-table__actions">
                          <button type="button" className="ui-admin-link" onClick={() => setSelectedSchoolID(school.id)}>
                            查看
                          </button>
                          <button type="button" className="ui-admin-link" onClick={() => void handleDisableSchool(school.id)}>
                            禁用学校
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <aside className="ui-admin-side-card">
            <div className="ui-admin-side-card__header">
              <div>
                <h3>组织详情</h3>
              </div>
            </div>
            {selectedSchool ? (
              <>
                <dl className="ui-admin-meta-list">
                  <div>
                    <dt>学校名称</dt>
                    <dd>{selectedSchool.name}</dd>
                  </div>
                  <div>
                    <dt>学校编码</dt>
                    <dd>{selectedSchool.code}</dd>
                  </div>
                  <div>
                    <dt>状态</dt>
                    <dd>
                      <span className={statusClassName(selectedSchool.status)}>{formatStatusLabel(selectedSchool.status)}</span>
                    </dd>
                  </div>
                </dl>
                <div className="ui-admin-kpis">
                  <div className="ui-admin-kpi">
                    <span>年级数</span>
                    <strong>{selectedSchoolGrades.length}</strong>
                  </div>
                  <div className="ui-admin-kpi">
                    <span>班级数</span>
                    <strong>{selectedSchoolClasses.length}</strong>
                  </div>
                  <div className="ui-admin-kpi">
                    <span>课程数</span>
                    <strong>{courses.length}</strong>
                  </div>
                </div>
              </>
            ) : (
              <div className="ui-admin-empty-inline">暂无学校数据</div>
            )}

            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>新增学校</h3>
                </div>
              </div>
              <form className="ui-admin-form__grid" onSubmit={(event) => void handleSchoolSubmit(event)}>
                <div className="ui-admin-form__field">
                  <label htmlFor="school_code">学校编码</label>
                  <input
                    id="school_code"
                    value={schoolForm.code}
                    onChange={(event) => setSchoolForm((current) => ({ ...current, code: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="school_name">学校名称</label>
                  <input
                    id="school_name"
                    value={schoolForm.name}
                    onChange={(event) => setSchoolForm((current) => ({ ...current, name: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__actions" style={{ gridColumn: "1 / -1" }}>
                  <button type="submit" className="ui-button ui-button--primary">
                    新增学校
                  </button>
                </div>
              </form>
            </section>
          </aside>
        </div>
      ) : null}

      {!loading && currentView === "grades" ? (
        <div className="ui-admin-layout">
          <div className="ui-admin-main">
            <section className="ui-admin-filters ui-admin-card">
              <div className="ui-admin-filters__grid ui-admin-filters__grid--compact">
                <div className="ui-admin-form__field">
                  <label htmlFor="grade_filter_keyword">搜索年级</label>
                  <input
                    id="grade_filter_keyword"
                    placeholder="输入年级名称、编码或学年"
                    value={gradeKeyword}
                    onChange={(event) => setGradeKeyword(event.target.value)}
                  />
                </div>
              </div>
              <div className="ui-admin-filters__actions">
                <button type="button" className="ui-button ui-button--ghost" onClick={() => setGradeKeyword("")}>
                  重置
                </button>
              </div>
            </section>

            <section className="ui-admin-table-card">
              <div className="ui-admin-table-card__header">
                <div>
                  <h3>年级列表</h3>
                </div>
              </div>
              <table className="ui-admin-table">
                <thead>
                  <tr>
                    <th>年级名称</th>
                    <th>年级编码</th>
                    <th>所属学校</th>
                    <th>年级序号</th>
                    <th>学年</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGrades.map((grade) => (
                    <tr key={grade.id}>
                      <td>{grade.name}</td>
                      <td>{grade.code}</td>
                      <td>{schools.find((school) => school.id === grade.school_id)?.name ?? "-"}</td>
                      <td>{grade.grade_level}</td>
                      <td>{grade.school_year ?? "-"}</td>
                      <td>
                        <span className={statusClassName(grade.status)}>{formatStatusLabel(grade.status)}</span>
                      </td>
                      <td>
                        <div className="ui-admin-table__actions">
                          <button type="button" className="ui-admin-link" onClick={() => setSelectedGradeID(grade.id)}>
                            查看
                          </button>
                          <button type="button" className="ui-admin-link" onClick={() => void handleDisableGrade(grade.id)}>
                            禁用年级
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <aside className="ui-admin-side-card">
            <div className="ui-admin-side-card__header">
              <div>
                <h3>年级详情</h3>
              </div>
            </div>
            {selectedGrade ? (
              <>
                <dl className="ui-admin-meta-list">
                  <div>
                    <dt>年级名称</dt>
                    <dd>{selectedGrade.name}</dd>
                  </div>
                  <div>
                    <dt>所属学校</dt>
                    <dd>{schools.find((school) => school.id === selectedGrade.school_id)?.name ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>学年</dt>
                    <dd>{selectedGrade.school_year ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>班级数</dt>
                    <dd>{selectedGradeClasses.length}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <div className="ui-admin-empty-inline">暂无年级数据</div>
            )}

            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>新增年级</h3>
                </div>
              </div>
              <form className="ui-admin-form__grid" onSubmit={(event) => void handleGradeSubmit(event)}>
                <div className="ui-admin-form__field">
                  <label htmlFor="grade_school_id">所属学校</label>
                  <select
                    id="grade_school_id"
                    value={gradeForm.school_id}
                    onChange={(event) => setGradeForm((current) => ({ ...current, school_id: event.target.value }))}
                  >
                    <option value="">请选择学校</option>
                    {schoolOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="grade_code">年级编码</label>
                  <input
                    id="grade_code"
                    value={gradeForm.code}
                    onChange={(event) => setGradeForm((current) => ({ ...current, code: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="grade_name">年级名称</label>
                  <input
                    id="grade_name"
                    value={gradeForm.name}
                    onChange={(event) => setGradeForm((current) => ({ ...current, name: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="grade_level">年级序号</label>
                  <input
                    id="grade_level"
                    type="number"
                    value={gradeForm.grade_level}
                    onChange={(event) => setGradeForm((current) => ({ ...current, grade_level: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="school_year">学年</label>
                  <input
                    id="school_year"
                    value={gradeForm.school_year}
                    onChange={(event) => setGradeForm((current) => ({ ...current, school_year: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__actions" style={{ gridColumn: "1 / -1" }}>
                  <button type="submit" className="ui-button ui-button--primary">
                    新增年级
                  </button>
                </div>
              </form>
            </section>
          </aside>
        </div>
      ) : null}

      {!loading && currentView === "classes" ? (
        <div className="ui-admin-layout--wide ui-admin-layout">
          <aside className="ui-admin-tree-card">
            <div className="ui-admin-tree-card__header">
              <div>
                <h3>层级结构</h3>
              </div>
            </div>
            <div className="ui-admin-form__field" style={{ marginBottom: 14 }}>
              <label htmlFor="class_filter_keyword">搜索学校/年级/班级</label>
              <input
                id="class_filter_keyword"
                placeholder="输入学校、年级或班级名称"
                value={classKeyword}
                onChange={(event) => setClassKeyword(event.target.value)}
              />
            </div>
            <div className="ui-admin-tree">
              {schools.map((school) => {
                const schoolGrades = grades.filter((grade) => grade.school_id === school.id);
                return (
                  <div key={school.id} className="ui-admin-tree__group">
                    <div className="ui-admin-tree__title">
                      <span>{school.name}</span>
                      <button type="button" className="ui-admin-link" onClick={() => setSelectedSchoolID(school.id)}>
                        查看学校
                      </button>
                    </div>
                    <div className="ui-admin-tree__children">
                      {schoolGrades.map((grade) => (
                        <div key={grade.id} className="ui-admin-tree__group">
                          <div className="ui-admin-tree__title">
                            <span>{grade.name}</span>
                            <button type="button" className="ui-admin-link" onClick={() => setSelectedGradeID(grade.id)}>
                              查看年级
                            </button>
                          </div>
                          <div className="ui-admin-tree__children">
                            {filteredClasses
                              .filter((classItem) => classItem.grade_id === grade.id)
                              .map((classItem) => (
                                <div
                                  key={classItem.id}
                                  className={["ui-admin-tree__leaf", selectedClass?.id === classItem.id ? "is-active" : ""]
                                    .filter(Boolean)
                                    .join(" ")}
                                >
                                  <strong>{classItem.name}</strong>
                                  <span className="ui-admin-subtle">{classItem.code}</span>
                                  <button type="button" className="ui-admin-link" onClick={() => setSelectedClassID(classItem.id)}>
                                    查看
                                  </button>
                                </div>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          <div className="ui-admin-main">
            <section className="ui-admin-table-card">
              <div className="ui-admin-table-card__header">
                <div>
                  <h3>班级列表</h3>
                </div>
              </div>
              <table className="ui-admin-table">
                <thead>
                  <tr>
                    <th>班级名称</th>
                    <th>班级编码</th>
                    <th>所属学校</th>
                    <th>所属年级</th>
                    <th>班号</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClasses.map((classItem) => {
                    const grade = grades.find((item) => item.id === classItem.grade_id);
                    const school = schools.find((item) => item.id === classItem.school_id);
                    return (
                      <tr key={classItem.id}>
                        <td>{classItem.name}</td>
                        <td>{classItem.code}</td>
                        <td>{school?.name ?? "-"}</td>
                        <td>{grade?.name ?? "-"}</td>
                        <td>{classItem.class_no ?? "-"}</td>
                        <td>
                          <span className={statusClassName(classItem.status)}>{formatStatusLabel(classItem.status)}</span>
                        </td>
                        <td>
                          <div className="ui-admin-table__actions">
                            <button type="button" className="ui-admin-link" onClick={() => setSelectedClassID(classItem.id)}>
                              查看
                            </button>
                            <button type="button" className="ui-admin-link" onClick={() => void handleDisableClass(classItem.id)}>
                              禁用班级
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>新增班级</h3>
                </div>
              </div>
              <form className="ui-admin-form__grid" onSubmit={(event) => void handleClassSubmit(event)}>
                <div className="ui-admin-form__field">
                  <label htmlFor="class_school_id">所属学校</label>
                  <select
                    id="class_school_id"
                    value={classForm.school_id}
                    onChange={(event) => setClassForm((current) => ({ ...current, school_id: event.target.value }))}
                  >
                    <option value="">请选择学校</option>
                    {schoolOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="class_grade_id">所属年级</label>
                  <select
                    id="class_grade_id"
                    value={classForm.grade_id}
                    onChange={(event) => setClassForm((current) => ({ ...current, grade_id: event.target.value }))}
                  >
                    <option value="">请选择年级</option>
                    {grades
                      .filter((grade) => !classForm.school_id || String(grade.school_id) === classForm.school_id)
                      .map((grade) => (
                        <option key={grade.id} value={grade.id}>
                          {grade.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="class_code">班级编码</label>
                  <input
                    id="class_code"
                    value={classForm.code}
                    onChange={(event) => setClassForm((current) => ({ ...current, code: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="class_name">班级名称</label>
                  <input
                    id="class_name"
                    value={classForm.name}
                    onChange={(event) => setClassForm((current) => ({ ...current, name: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="class_no">班号</label>
                  <input
                    id="class_no"
                    type="number"
                    value={classForm.class_no}
                    onChange={(event) => setClassForm((current) => ({ ...current, class_no: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__actions" style={{ gridColumn: "1 / -1" }}>
                  <button type="submit" className="ui-button ui-button--primary">
                    新增班级
                  </button>
                </div>
              </form>
            </section>

            {selectedClass ? (
              <section className="ui-admin-side-card">
                <div className="ui-admin-side-card__header">
                  <div>
                    <h3>班级详情</h3>
                  </div>
                </div>
                <dl className="ui-admin-meta-list">
                  <div>
                    <dt>班级名称</dt>
                    <dd>{selectedClass.name}</dd>
                  </div>
                  <div>
                    <dt>班级编码</dt>
                    <dd>{selectedClass.code}</dd>
                  </div>
                  <div>
                    <dt>所属年级</dt>
                    <dd>{grades.find((grade) => grade.id === selectedClass.grade_id)?.name ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>所属学校</dt>
                    <dd>{schools.find((school) => school.id === selectedClass.school_id)?.name ?? "-"}</dd>
                  </div>
                </dl>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}

      {!loading && currentView === "courses" ? (
        <div className="ui-admin-layout">
          <div className="ui-admin-main">
            <section className="ui-admin-filters ui-admin-card">
              <div className="ui-admin-filters__grid ui-admin-filters__grid--compact">
                <div className="ui-admin-form__field">
                  <label htmlFor="course_filter_keyword">搜索课程</label>
                  <input
                    id="course_filter_keyword"
                    placeholder="输入课程名称或编码"
                    value={courseKeyword}
                    onChange={(event) => setCourseKeyword(event.target.value)}
                  />
                </div>
              </div>
              <div className="ui-admin-filters__actions">
                <button type="button" className="ui-button ui-button--ghost" onClick={() => setCourseKeyword("")}>
                  重置
                </button>
              </div>
            </section>

            <section className="ui-admin-table-card">
              <div className="ui-admin-table-card__header">
                <div>
                  <h3>课程列表</h3>
                </div>
              </div>
              <table className="ui-admin-table">
                <thead>
                  <tr>
                    <th>课程名称</th>
                    <th>课程编码</th>
                    <th>开始时间</th>
                    <th>结束时间</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCourses.map((course) => (
                    <tr key={course.id}>
                      <td>{course.name}</td>
                      <td>{course.code}</td>
                      <td>{course.start_at ?? "-"}</td>
                      <td>{course.end_at ?? "-"}</td>
                      <td>
                        <span className={statusClassName(course.status)}>{formatStatusLabel(course.status)}</span>
                      </td>
                      <td>
                        <div className="ui-admin-table__actions">
                          <button type="button" className="ui-admin-link" onClick={() => setSelectedCourseID(course.id)}>
                            查看
                          </button>
                          <button type="button" className="ui-admin-link" onClick={() => void handleDisableCourse(course.id)}>
                            禁用课程
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <aside className="ui-admin-side-card">
            <div className="ui-admin-side-card__header">
              <div>
                <h3>课程详情</h3>
              </div>
            </div>
            {selectedCourse ? (
              <dl className="ui-admin-meta-list">
                <div>
                  <dt>课程名称</dt>
                  <dd>{selectedCourse.name}</dd>
                </div>
                <div>
                  <dt>课程编码</dt>
                  <dd>{selectedCourse.code}</dd>
                </div>
                <div>
                  <dt>开始时间</dt>
                  <dd>{selectedCourse.start_at ?? "-"}</dd>
                </div>
                <div>
                  <dt>结束时间</dt>
                  <dd>{selectedCourse.end_at ?? "-"}</dd>
                </div>
                <div>
                  <dt>课程说明</dt>
                  <dd>{selectedCourse.description ?? "暂无课程说明"}</dd>
                </div>
              </dl>
            ) : (
              <div className="ui-admin-empty-inline">暂无课程数据</div>
            )}

            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>新增课程</h3>
                </div>
              </div>
              <form className="ui-admin-form__grid" onSubmit={(event) => void handleCourseSubmit(event)}>
                <div className="ui-admin-form__field">
                  <label htmlFor="course_code">课程编码</label>
                  <input
                    id="course_code"
                    value={courseForm.code}
                    onChange={(event) => setCourseForm((current) => ({ ...current, code: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="course_name">课程名称</label>
                  <input
                    id="course_name"
                    value={courseForm.name}
                    onChange={(event) => setCourseForm((current) => ({ ...current, name: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="course_start_at">开始时间</label>
                  <input
                    id="course_start_at"
                    type="datetime-local"
                    value={courseForm.start_at}
                    onChange={(event) => setCourseForm((current) => ({ ...current, start_at: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="course_end_at">结束时间</label>
                  <input
                    id="course_end_at"
                    type="datetime-local"
                    value={courseForm.end_at}
                    onChange={(event) => setCourseForm((current) => ({ ...current, end_at: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="course_description">课程说明</label>
                  <textarea
                    id="course_description"
                    value={courseForm.description}
                    onChange={(event) => setCourseForm((current) => ({ ...current, description: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__actions" style={{ gridColumn: "1 / -1" }}>
                  <button type="submit" className="ui-button ui-button--primary">
                    新增课程
                  </button>
                </div>
              </form>
            </section>
          </aside>
        </div>
      ) : null}
    </section>
  );
}

function includesKeyword(values: string[], keyword: string): boolean {
  if (!keyword.trim()) {
    return true;
  }
  const normalized = keyword.trim().toLowerCase();
  return values.some((value) => value.toLowerCase().includes(normalized));
}

function formatStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "启用中";
    case "published":
      return "已发布";
    case "disabled":
      return "已停用";
    case "draft":
      return "草稿";
    default:
      return status;
  }
}

function statusClassName(status: string): string {
  switch (status) {
    case "active":
    case "published":
      return "ui-admin-status ui-admin-status--active";
    case "disabled":
      return "ui-admin-status ui-admin-status--disabled";
    case "draft":
      return "ui-admin-status ui-admin-status--draft";
    default:
      return "ui-admin-status ui-admin-status--disabled";
  }
}

function normalizeDateTimeValue(value: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toISOString();
}
