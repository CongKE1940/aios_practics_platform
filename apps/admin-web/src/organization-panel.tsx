import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";

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
import { ClearableFilterInput } from "@aios/ui-web";

import { downloadCsv, paginateItems, toggleSelectAll, toggleSelection } from "./list-page-utils";

export interface OrganizationApi {
  listSchools(): Promise<PageResult<School>>;
  createSchool(body: SchoolInput): Promise<School>;
  disableSchool(id: number): Promise<boolean>;
  updateSchool?(id: number, body: SchoolInput): Promise<School>;
  listGrades(): Promise<PageResult<Grade>>;
  createGrade(body: GradeInput): Promise<Grade>;
  disableGrade(id: number): Promise<boolean>;
  updateGrade?(id: number, body: GradeInput): Promise<Grade>;
  listClasses(): Promise<PageResult<ClassItem>>;
  createClass(body: ClassInput): Promise<ClassItem>;
  disableClass(id: number): Promise<boolean>;
  updateClass?(id: number, body: ClassInput): Promise<ClassItem>;
  listCourses(): Promise<PageResult<Course>>;
  createCourse(body: CourseInput): Promise<Course>;
  disableCourse(id: number): Promise<boolean>;
  updateCourse?(id: number, body: CourseInput): Promise<Course>;
}

export type OrganizationView = "schools" | "grades" | "classes" | "courses";

const pageSize = 8;

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

const viewMeta: Record<OrganizationView, { eyebrow: string; title: string; addLabel: string; exportName: string }> = {
  schools: { eyebrow: "组织管理", title: "学校与组织管理", addLabel: "新增学校", exportName: "schools.csv" },
  grades: { eyebrow: "组织管理", title: "年级管理", addLabel: "新增年级", exportName: "grades.csv" },
  classes: { eyebrow: "组织管理", title: "班级管理", addLabel: "新增班级", exportName: "classes.csv" },
  courses: { eyebrow: "课程管理", title: "课程管理", addLabel: "新增课程", exportName: "courses.csv" }
};

type ModalState =
  | { type: "create"; view: OrganizationView }
  | { type: "detail"; view: OrganizationView; item: School | Grade | ClassItem | Course }
  | { type: "edit"; view: OrganizationView; item: School | Grade | ClassItem | Course }
  | null;

export function OrganizationPanel({ api, view }: { api: OrganizationApi; view?: OrganizationView }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [schools, setSchools] = useState<School[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeView, setActiveView] = useState<OrganizationView>(view ?? "schools");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIDs, setSelectedIDs] = useState<number[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
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
    setPage(1);
    setSelectedIDs([]);
  }, [activeView, keyword]);

  const schoolNameMap = useMemo(() => new Map(schools.map((item) => [item.id, item.name])), [schools]);
  const gradeNameMap = useMemo(() => new Map(grades.map((item) => [item.id, item.name])), [grades]);

  const filteredItems = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    switch (activeView) {
      case "schools":
        return schools.filter((item) => matchesKeyword([item.name, item.code, item.status], normalized));
      case "grades":
        return grades.filter((item) =>
          matchesKeyword([item.name, item.code, item.school_year ?? "", schoolNameMap.get(item.school_id) ?? ""], normalized)
        );
      case "classes":
        return classes.filter((item) =>
          matchesKeyword(
            [item.name, item.code, schoolNameMap.get(item.school_id) ?? "", gradeNameMap.get(item.grade_id) ?? ""],
            normalized
          )
        );
      case "courses":
        return courses.filter((item) => matchesKeyword([item.name, item.code, item.description ?? ""], normalized));
    }
  }, [activeView, classes, courses, gradeNameMap, grades, keyword, schoolNameMap, schools]);

  const pagination = useMemo(() => paginateItems(filteredItems, page, pageSize), [filteredItems, page]);
  const currentPageIDs = useMemo(() => pagination.items.map((item) => item.id), [pagination.items]);
  const currentMeta = viewMeta[activeView];

  useEffect(() => {
    if (page !== pagination.page) {
      setPage(pagination.page);
    }
  }, [page, pagination.page]);

  async function handleBatchDelete() {
    const ids = [...selectedIDs];
    if (ids.length === 0) {
      return;
    }
    switch (activeView) {
      case "schools":
        await Promise.all(ids.map((id) => api.disableSchool(id)));
        break;
      case "grades":
        await Promise.all(ids.map((id) => api.disableGrade(id)));
        break;
      case "classes":
        await Promise.all(ids.map((id) => api.disableClass(id)));
        break;
      case "courses":
        await Promise.all(ids.map((id) => api.disableCourse(id)));
        break;
    }
    setSelectedIDs([]);
    await loadAll();
  }

  function handleExport() {
    const rows = filteredItems.map((item) => buildExportRow(activeView, item, schoolNameMap, gradeNameMap));
    downloadCsv(currentMeta.exportName, exportColumns[activeView], rows);
  }

  function openCreateModal() {
    resetForms();
    setModal({ type: "create", view: activeView });
  }

  function openEditModal(item: School | Grade | ClassItem | Course) {
    fillFormByItem(activeView, item);
    setModal({ type: "edit", view: activeView, item });
  }

  function closeModal() {
    setModal(null);
    resetForms();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    switch (activeView) {
      case "schools":
        if (modal?.type === "edit" && api.updateSchool) {
          await api.updateSchool((modal.item as School).id, schoolForm);
        } else {
          await api.createSchool(schoolForm);
        }
        break;
      case "grades": {
        const body: GradeInput = {
          school_id: Number(gradeForm.school_id),
          code: gradeForm.code,
          name: gradeForm.name,
          grade_level: Number(gradeForm.grade_level),
          school_year: gradeForm.school_year || undefined
        };
        if (modal?.type === "edit" && api.updateGrade) {
          await api.updateGrade((modal.item as Grade).id, body);
        } else {
          await api.createGrade(body);
        }
        break;
      }
      case "classes": {
        const body: ClassInput = {
          school_id: Number(classForm.school_id),
          grade_id: Number(classForm.grade_id),
          code: classForm.code,
          name: classForm.name,
          class_no: classForm.class_no ? Number(classForm.class_no) : undefined
        };
        if (modal?.type === "edit" && api.updateClass) {
          await api.updateClass((modal.item as ClassItem).id, body);
        } else {
          await api.createClass(body);
        }
        break;
      }
      case "courses": {
        const body: CourseInput = {
          code: courseForm.code,
          name: courseForm.name,
          start_at: normalizeDateTimeValue(courseForm.start_at),
          end_at: normalizeDateTimeValue(courseForm.end_at),
          description: courseForm.description || undefined
        };
        if (modal?.type === "edit" && api.updateCourse) {
          await api.updateCourse((modal.item as Course).id, body);
        } else {
          await api.createCourse(body);
        }
        break;
      }
    }
    closeModal();
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
        </div>
        {!view ? (
          <div className="ui-admin-page__tabs" role="tablist" aria-label="组织管理视图">
            {(["schools", "grades", "classes", "courses"] as OrganizationView[]).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={activeView === item}
                className={["ui-admin-tab", activeView === item ? "is-active" : ""].filter(Boolean).join(" ")}
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

      {!loading ? (
        <>
          <section className="ui-admin-filters ui-admin-card">
            <div className="ui-admin-filters__grid">
              <ClearableFilterInput
                id="organization_keyword"
                label={filterLabelMap[activeView]}
                placeholder={filterPlaceholderMap[activeView]}
                value={keyword}
                onChange={setKeyword}
              />
            </div>
          </section>

          <section className="ui-admin-actions-bar ui-admin-card">
            <div className="ui-admin-actions-bar__group">
              <button type="button" className="ui-button ui-button--primary" onClick={openCreateModal}>
                {currentMeta.addLabel}
              </button>
              <button
                type="button"
                className="ui-button ui-button--ghost"
                onClick={() => void handleBatchDelete()}
                disabled={selectedIDs.length === 0}
              >
                批量删除
              </button>
              <button type="button" className="ui-button ui-button--ghost" onClick={handleExport}>
                导出列表
              </button>
            </div>
            <div className="ui-admin-pagination__info">{`已选 ${selectedIDs.length} 项`}</div>
          </section>

          <section className="ui-admin-table-card">
            <div className="ui-admin-table-card__header">
              <div>
                <h3>{`${currentMeta.title}列表`}</h3>
              </div>
            </div>
            <table className="ui-admin-table">
              <thead>{renderTableHead(activeView, currentPageIDs, selectedIDs, setSelectedIDs)}</thead>
              <tbody>{renderTableBody(activeView, pagination.items, schoolNameMap, gradeNameMap, selectedIDs, setSelectedIDs, setModal, openEditModal)}</tbody>
            </table>
            <div className="ui-admin-table__footer">
              <div className="ui-admin-pagination__info">{`共 ${pagination.total} 条，当前第 ${pagination.page} / ${pagination.pageCount} 页`}</div>
              <div className="ui-admin-pagination">
                <button
                  type="button"
                  className="ui-button ui-button--ghost"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={pagination.page <= 1}
                >
                  上一页
                </button>
                <button
                  type="button"
                  className="ui-button ui-button--ghost"
                  onClick={() => setPage((current) => Math.min(pagination.pageCount, current + 1))}
                  disabled={pagination.page >= pagination.pageCount}
                >
                  下一页
                </button>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {modal ? renderModal(modal, closeModal, handleSubmit, schoolForm, setSchoolForm, gradeForm, setGradeForm, classForm, setClassForm, courseForm, setCourseForm, schools, grades, schoolNameMap, gradeNameMap) : null}
    </section>
  );

  function resetForms() {
    setSchoolForm(defaultSchoolForm);
    setGradeForm(defaultGradeForm);
    setClassForm(defaultClassForm);
    setCourseForm(defaultCourseForm);
  }

  function fillFormByItem(currentView: OrganizationView, item: School | Grade | ClassItem | Course) {
    resetForms();
    switch (currentView) {
      case "schools": {
        const school = item as School;
        setSchoolForm({ code: school.code, name: school.name });
        break;
      }
      case "grades": {
        const grade = item as Grade;
        setGradeForm({
          school_id: String(grade.school_id),
          code: grade.code,
          name: grade.name,
          grade_level: String(grade.grade_level),
          school_year: grade.school_year ?? ""
        });
        break;
      }
      case "classes": {
        const classItem = item as ClassItem;
        setClassForm({
          school_id: String(classItem.school_id),
          grade_id: String(classItem.grade_id),
          code: classItem.code,
          name: classItem.name,
          class_no: classItem.class_no ? String(classItem.class_no) : ""
        });
        break;
      }
      case "courses": {
        const course = item as Course;
        setCourseForm({
          code: course.code,
          name: course.name,
          start_at: toDateTimeLocal(course.start_at),
          end_at: toDateTimeLocal(course.end_at),
          description: course.description ?? ""
        });
        break;
      }
    }
  }
}

const filterLabelMap: Record<OrganizationView, string> = {
  schools: "搜索学校",
  grades: "搜索年级",
  classes: "搜索班级",
  courses: "搜索课程"
};

const filterPlaceholderMap: Record<OrganizationView, string> = {
  schools: "输入学校名称或编码",
  grades: "输入年级名称、编码或学校",
  classes: "输入班级名称、编码或年级",
  courses: "输入课程名称或编码"
};

const exportColumns: Record<OrganizationView, Array<{ key: string; title: string }>> = {
  schools: [
    { key: "name", title: "学校名称" },
    { key: "code", title: "学校编码" },
    { key: "status", title: "状态" }
  ],
  grades: [
    { key: "name", title: "年级名称" },
    { key: "code", title: "年级编码" },
    { key: "school_name", title: "所属学校" },
    { key: "grade_level", title: "年级序号" }
  ],
  classes: [
    { key: "name", title: "班级名称" },
    { key: "code", title: "班级编码" },
    { key: "school_name", title: "所属学校" },
    { key: "grade_name", title: "所属年级" }
  ],
  courses: [
    { key: "name", title: "课程名称" },
    { key: "code", title: "课程编码" },
    { key: "start_at", title: "开始时间" },
    { key: "end_at", title: "结束时间" }
  ]
};

function renderTableHead(
  view: OrganizationView,
  currentPageIDs: number[],
  selectedIDs: number[],
  setSelectedIDs: Dispatch<SetStateAction<number[]>>
) {
  const checkbox = (
    <th>
      <input
        type="checkbox"
        aria-label="全选当前页"
        className="ui-admin-table__checkbox"
        checked={currentPageIDs.length > 0 && currentPageIDs.every((id) => selectedIDs.includes(id))}
        onChange={() => setSelectedIDs((current) => toggleSelectAll(current, currentPageIDs))}
      />
    </th>
  );

  switch (view) {
    case "schools":
      return (
        <tr>
          {checkbox}
          <th>学校名称</th>
          <th>学校编码</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      );
    case "grades":
      return (
        <tr>
          {checkbox}
          <th>年级名称</th>
          <th>年级编码</th>
          <th>所属学校</th>
          <th>学年</th>
          <th>操作</th>
        </tr>
      );
    case "classes":
      return (
        <tr>
          {checkbox}
          <th>班级名称</th>
          <th>班级编码</th>
          <th>所属学校</th>
          <th>所属年级</th>
          <th>操作</th>
        </tr>
      );
    case "courses":
      return (
        <tr>
          {checkbox}
          <th>课程名称</th>
          <th>课程编码</th>
          <th>开始时间</th>
          <th>结束时间</th>
          <th>操作</th>
        </tr>
      );
  }
}

function renderTableBody(
  view: OrganizationView,
  items: Array<School | Grade | ClassItem | Course>,
  schoolNameMap: Map<number, string>,
  gradeNameMap: Map<number, string>,
  selectedIDs: number[],
  setSelectedIDs: Dispatch<SetStateAction<number[]>>,
  setModal: Dispatch<SetStateAction<ModalState>>,
  openEditModal: (item: School | Grade | ClassItem | Course) => void
) {
  return items.map((item) => (
    <tr key={item.id}>
      <td>
        <input
          type="checkbox"
          className="ui-admin-table__checkbox"
          aria-label={`选择-${item.id}`}
          checked={selectedIDs.includes(item.id)}
          onChange={() => setSelectedIDs((current) => toggleSelection(current, item.id))}
        />
      </td>
      {view === "schools" ? (
        <>
          <td>{(item as School).name}</td>
          <td>{(item as School).code}</td>
          <td>
            <span className={statusClassName((item as School).status)}>{formatStatusLabel((item as School).status)}</span>
          </td>
        </>
      ) : null}
      {view === "grades" ? (
        <>
          <td>{(item as Grade).name}</td>
          <td>{(item as Grade).code}</td>
          <td>{schoolNameMap.get((item as Grade).school_id) ?? "-"}</td>
          <td>{(item as Grade).school_year ?? "-"}</td>
        </>
      ) : null}
      {view === "classes" ? (
        <>
          <td>{(item as ClassItem).name}</td>
          <td>{(item as ClassItem).code}</td>
          <td>{schoolNameMap.get((item as ClassItem).school_id) ?? "-"}</td>
          <td>{gradeNameMap.get((item as ClassItem).grade_id) ?? "-"}</td>
        </>
      ) : null}
      {view === "courses" ? (
        <>
          <td>{(item as Course).name}</td>
          <td>{(item as Course).code}</td>
          <td>{(item as Course).start_at ?? "-"}</td>
          <td>{(item as Course).end_at ?? "-"}</td>
        </>
      ) : null}
      <td>
        <div className="ui-admin-table__actions">
          <button type="button" className="ui-admin-link" onClick={() => setModal({ type: "detail", view, item })}>
            详情
          </button>
          <button type="button" className="ui-admin-link" onClick={() => openEditModal(item)}>
            编辑
          </button>
        </div>
      </td>
    </tr>
  ));
}

function renderModal(
  modal: Exclude<ModalState, null>,
  closeModal: () => void,
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>,
  schoolForm: SchoolInput,
  setSchoolForm: Dispatch<SetStateAction<SchoolInput>>,
  gradeForm: typeof defaultGradeForm,
  setGradeForm: Dispatch<SetStateAction<typeof defaultGradeForm>>,
  classForm: typeof defaultClassForm,
  setClassForm: Dispatch<SetStateAction<typeof defaultClassForm>>,
  courseForm: typeof defaultCourseForm,
  setCourseForm: Dispatch<SetStateAction<typeof defaultCourseForm>>,
  schools: School[],
  grades: Grade[],
  schoolNameMap: Map<number, string>,
  gradeNameMap: Map<number, string>
) {
  if (modal.type === "detail") {
    const detailModal = modal;
    return (
      <div className="ui-admin-modal-backdrop">
        <section className="ui-admin-modal" aria-label="组织管理弹层">
            <div className="ui-admin-modal__header">
              <div>
                <h3>详情</h3>
              </div>
              <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                关闭
              </button>
            </div>
            <div className="ui-admin-modal__body">
              <dl className="ui-admin-meta-list">
                {detailModal.view === "schools" ? (
                  <>
                    <div>
                      <dt>学校名称</dt>
                      <dd>{(detailModal.item as School).name}</dd>
                    </div>
                    <div>
                      <dt>学校编码</dt>
                      <dd>{(detailModal.item as School).code}</dd>
                    </div>
                  </>
                ) : null}
                {detailModal.view === "grades" ? (
                  <>
                    <div>
                      <dt>年级名称</dt>
                      <dd>{(detailModal.item as Grade).name}</dd>
                    </div>
                    <div>
                      <dt>所属学校</dt>
                      <dd>{schoolNameMap.get((detailModal.item as Grade).school_id) ?? "-"}</dd>
                    </div>
                  </>
                ) : null}
                {detailModal.view === "classes" ? (
                  <>
                    <div>
                      <dt>班级名称</dt>
                      <dd>{(detailModal.item as ClassItem).name}</dd>
                    </div>
                    <div>
                      <dt>所属年级</dt>
                      <dd>{gradeNameMap.get((detailModal.item as ClassItem).grade_id) ?? "-"}</dd>
                    </div>
                  </>
                ) : null}
                {detailModal.view === "courses" ? (
                  <>
                    <div>
                      <dt>课程名称</dt>
                      <dd>{(detailModal.item as Course).name}</dd>
                    </div>
                    <div>
                      <dt>课程说明</dt>
                      <dd>{(detailModal.item as Course).description ?? "暂无课程说明"}</dd>
                    </div>
                  </>
                ) : null}
              </dl>
            </div>
            <div className="ui-admin-modal__footer">
              <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                关闭
              </button>
            </div>
        </section>
      </div>
    );
  }

  const formModal = modal;
  return (
    <div className="ui-admin-modal-backdrop">
      <section className="ui-admin-modal" aria-label="组织管理弹层">
            <div className="ui-admin-modal__header">
              <div>
                <h3>{formModal.view === "schools" ? "学校表单" : formModal.view === "grades" ? "年级表单" : formModal.view === "classes" ? "班级表单" : "课程表单"}</h3>
              </div>
              <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                关闭
              </button>
            </div>
            <form onSubmit={(event) => void handleSubmit(event)}>
              <div className="ui-admin-modal__body">
                {formModal.view === "schools" ? (
                  <div className="ui-admin-form__grid">
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
                  </div>
                ) : null}
                {formModal.view === "grades" ? (
                  <div className="ui-admin-form__grid">
                    <div className="ui-admin-form__field">
                      <label htmlFor="grade_school_id">所属学校</label>
                      <select
                        id="grade_school_id"
                        value={gradeForm.school_id}
                        onChange={(event) => setGradeForm((current) => ({ ...current, school_id: event.target.value }))}
                      >
                        <option value="">请选择学校</option>
                        {schools.map((school) => (
                          <option key={school.id} value={school.id}>
                            {school.name}
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
                  </div>
                ) : null}
                {formModal.view === "classes" ? (
                  <div className="ui-admin-form__grid">
                    <div className="ui-admin-form__field">
                      <label htmlFor="class_school_id">所属学校</label>
                      <select
                        id="class_school_id"
                        value={classForm.school_id}
                        onChange={(event) => setClassForm((current) => ({ ...current, school_id: event.target.value }))}
                      >
                        <option value="">请选择学校</option>
                        {schools.map((school) => (
                          <option key={school.id} value={school.id}>
                            {school.name}
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
                  </div>
                ) : null}
                {formModal.view === "courses" ? (
                  <div className="ui-admin-form__grid">
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
                  </div>
                ) : null}
              </div>
              <div className="ui-admin-modal__footer">
                <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                  取消
                </button>
                <button type="submit" className="ui-button ui-button--primary">
                  {formModal.type === "create"
                    ? formModal.view === "schools"
                      ? "新增学校"
                      : formModal.view === "grades"
                        ? "新增年级"
                        : formModal.view === "classes"
                          ? "新增班级"
                          : "新增课程"
                    : "保存修改"}
                </button>
              </div>
            </form>
      </section>
    </div>
  );
}

function buildExportRow(
  view: OrganizationView,
  item: School | Grade | ClassItem | Course,
  schoolNameMap: Map<number, string>,
  gradeNameMap: Map<number, string>
): Record<string, unknown> {
  switch (view) {
    case "schools":
      return { ...(item as School) };
    case "grades":
      return { ...(item as Grade), school_name: schoolNameMap.get((item as Grade).school_id) ?? "-" };
    case "classes":
      return {
        ...(item as ClassItem),
        school_name: schoolNameMap.get((item as ClassItem).school_id) ?? "-",
        grade_name: gradeNameMap.get((item as ClassItem).grade_id) ?? "-"
      };
    case "courses":
      return { ...(item as Course) };
  }
}

function matchesKeyword(values: string[], keyword: string): boolean {
  if (!keyword) {
    return true;
  }
  return values.some((value) => value.toLowerCase().includes(keyword));
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

function toDateTimeLocal(value?: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
