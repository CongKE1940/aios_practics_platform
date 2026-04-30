import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type {
  Course,
  CourseListQuery,
  PageResult,
  QuestionBank,
  QuestionBankInput,
  QuestionBankListQuery,
  QuestionBankVisibilityInput
} from "@aios/api-sdk";
import {
  ClearableFilterInput,
  ClearableFilterSelect,
  FixedActionList,
  ToastNotice,
  type FixedActionListColumn,
  type FixedActionListRowId
} from "@aios/ui-web";

import { downloadCsv } from "./list-page-utils";

export interface QuestionBankPanelApi {
  listQuestionBanks(query?: QuestionBankListQuery): Promise<PageResult<QuestionBank>>;
  createQuestionBank(body: QuestionBankInput): Promise<QuestionBank>;
  updateQuestionBank?(id: number, body: QuestionBankInput): Promise<QuestionBank>;
  publishQuestionBank(id: number): Promise<QuestionBank>;
  assignQuestionBankVisibility(id: number, body: QuestionBankVisibilityInput): Promise<boolean>;
  listCourses?(query?: CourseListQuery): Promise<PageResult<Course>>;
}

const defaultPageSize = 10;

const defaultForm = {
  name: "",
  course_id: "",
  description: ""
};

const defaultVisibilityForm = {
  target_type: "class",
  target_id: "",
  permission_type: "practice"
};

type ModalState =
  | { type: "create" }
  | { type: "detail"; item: QuestionBank }
  | { type: "edit"; item: QuestionBank }
  | null;

export function QuestionBankPanel({ api }: { api: QuestionBankPanelApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [items, setItems] = useState<QuestionBank[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [courseID, setCourseID] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [selectedIDs, setSelectedIDs] = useState<FixedActionListRowId[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState(defaultForm);
  const [visibilityForm, setVisibilityForm] = useState(defaultVisibilityForm);
  const didLoadRef = useRef(false);

  const courseNameMap = useMemo(() => new Map(courses.map((course) => [course.id, course.name])), [courses]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const columns = useMemo<Array<FixedActionListColumn<QuestionBank>>>(
    () => [
      {
        key: "name",
        title: "题库名称",
        render: (item) => item.name
      },
      {
        key: "course_id",
        title: "绑定课程",
        render: (item) => (item.course_id ? courseNameMap.get(item.course_id) ?? `课程-${item.course_id}` : "-")
      },
      {
        key: "source_type",
        title: "来源",
        width: 120,
        render: (item) => formatSourceType(item.source_type)
      },
      {
        key: "status",
        title: "状态",
        width: 120,
        render: (item) => <span className={statusClassName(item.status)}>{formatStatusLabel(item.status)}</span>
      },
      {
        key: "description",
        title: "说明",
        render: (item) => item.description || "-"
      },
      {
        key: "updated_at",
        title: "更新时间",
        width: 160,
        render: (item) => formatDateTime(item.updated_at)
      }
    ],
    [courseNameMap]
  );

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadPage(buildQuestionBankQuery("", "", "", 1, defaultPageSize));
  }, [api]);

  async function loadPage(query: QuestionBankListQuery = buildQuestionBankQuery(keyword, courseID, status, page, pageSize)) {
    setLoading(true);
    setErrorMessage("");
    try {
      const [courseResult, bankResult] = await Promise.all([
        api.listCourses ? api.listCourses({ page: 1, page_size: 100 }) : Promise.resolve<PageResult<Course>>({ items: [], page: 1, page_size: 100, total: 0 }),
        api.listQuestionBanks(query)
      ]);
      setCourses(courseResult.items);
      setItems(bankResult.items);
      setTotal(bankResult.total);
      setPage(bankResult.page || query.page || 1);
      setPageSize(bankResult.page_size || query.page_size || defaultPageSize);
    } catch (error) {
      setItems([]);
      setTotal(0);
      setPage(query.page || 1);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "题库数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedIDs([]);
    await loadPage(buildQuestionBankQuery(keyword, courseID, status, 1, pageSize));
  }

  async function handleReset() {
    setKeyword("");
    setCourseID("");
    setStatus("");
    setSelectedIDs([]);
    await loadPage(buildQuestionBankQuery("", "", "", 1, defaultPageSize));
  }

  async function handlePageChange(nextPage: number) {
    setSelectedIDs([]);
    await loadPage(buildQuestionBankQuery(keyword, courseID, status, nextPage, pageSize));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body: QuestionBankInput = {
      name: form.name,
      course_id: form.course_id ? Number(form.course_id) : undefined,
      description: form.description || undefined
    };

    if (modal?.type === "edit" && api.updateQuestionBank) {
      await api.updateQuestionBank(modal.item.id, body);
    } else {
      await api.createQuestionBank(body);
    }

    closeModal();
    await loadPage();
  }

  async function handlePublish(item: QuestionBank) {
    await api.publishQuestionBank(item.id);
    await loadPage();
  }

  async function handleAssignVisibility(id: number) {
    const targetID = Number(visibilityForm.target_id);
    if (!Number.isFinite(targetID) || targetID <= 0) {
      setErrorMessage("请输入有效的下发目标 ID。 ");
      return;
    }

    await api.assignQuestionBankVisibility(id, {
      grants: [
        {
          grant_type: visibilityForm.target_type,
          target_type: visibilityForm.target_type,
          target_id: targetID,
          permission_type: visibilityForm.permission_type,
          inherit_to_children: false
        }
      ]
    });
    setVisibilityForm(defaultVisibilityForm);
    await loadPage();
  }

  function handleExport() {
    downloadCsv(
      "question_banks.csv",
      [
        { key: "name", title: "题库名称" },
        { key: "course_name", title: "所属课程" },
        { key: "source_type", title: "来源" },
        { key: "status", title: "状态" },
        { key: "description", title: "说明" },
        { key: "updated_at_label", title: "更新时间" }
      ],
      items.map((item) => ({
        ...item,
        course_name: item.course_id ? courseNameMap.get(item.course_id) ?? `课程-${item.course_id}` : "",
        updated_at_label: formatDateTime(item.updated_at),
        description: item.description ?? ""
      }))
    );
  }

  function openCreateModal() {
    setForm(defaultForm);
    setModal({ type: "create" });
  }

  function openEditModal(item: QuestionBank) {
    setForm({
      name: item.name,
      course_id: item.course_id ? String(item.course_id) : "",
      description: item.description ?? ""
    });
    setModal({ type: "edit", item });
  }

  function closeModal() {
    setModal(null);
    setForm(defaultForm);
    setVisibilityForm(defaultVisibilityForm);
  }

  return (
    <section aria-label="题库管理面板" className="ui-admin-page" style={pageStyle}>
      {errorMessage ? (
        <ToastNotice tone="danger" title="题库数据加载失败" description={errorMessage} onClose={() => setErrorMessage("")} />
      ) : null}

      <section className="ui-admin-card" aria-label="题库数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <ClearableFilterInput id="question_bank_keyword" label="关键字" placeholder="输入题库名称或说明" value={keyword} onChange={setKeyword} />
          <ClearableFilterSelect id="question_bank_course_id" label="绑定课程" placeholder="请选择绑定课程" value={courseID} onChange={setCourseID}>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
          </ClearableFilterSelect>
          <ClearableFilterSelect id="question_bank_status" label="状态" placeholder="请选择状态" value={status} onChange={setStatus}>
              <option value="draft">草稿</option>
              <option value="active">已发布</option>
          </ClearableFilterSelect>
          <div className="ui-admin-actions-bar__group" style={queryActionsStyle}>
            <button type="submit" className="ui-button ui-button--primary" disabled={loading}>
              {loading ? "查询中" : "查询"}
            </button>
            <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleReset()} disabled={loading}>
              重置
            </button>
          </div>
        </form>

        <FixedActionList
          rows={items}
          columns={columns}
          getRowId={(item) => item.id}
          selectedRowIds={selectedIDs}
          onSelectionChange={setSelectedIDs}
          onCreate={openCreateModal}
          onExport={handleExport}
          onDetail={(item) => setModal({ type: "detail", item })}
          onEdit={openEditModal}
          currentPage={page}
          pageCount={pageCount}
          total={total}
          onPageChange={(nextPage) => void handlePageChange(nextPage)}
          minHeight="100%"
          emptyText={loading ? "数据加载中..." : "暂无题库数据"}
          ariaLabel="题库列表"
          createLabel="新增"
          deleteLabel="删除"
          exportLabel="导出"
          rowCheckboxLabel={(item) => `选择题库-${item.name}`}
        />
      </section>

      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="题库管理弹层">
            {modal.type === "detail" ? (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>题库详情</h3>
                    <p>{modal.item.name}</p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <div className="ui-admin-modal__body">
                  <dl className="ui-admin-meta-list">
                    <div>
                      <dt>题库名称</dt>
                      <dd>{modal.item.name}</dd>
                    </div>
                    <div>
                      <dt>绑定课程</dt>
                      <dd>{modal.item.course_id ? courseNameMap.get(modal.item.course_id) ?? `课程-${modal.item.course_id}` : "-"}</dd>
                    </div>
                    <div>
                      <dt>来源</dt>
                      <dd>{formatSourceType(modal.item.source_type)}</dd>
                    </div>
                    <div>
                      <dt>状态</dt>
                      <dd>{formatStatusLabel(modal.item.status)}</dd>
                    </div>
                    <div>
                      <dt>说明</dt>
                      <dd>{modal.item.description ?? "暂无说明"}</dd>
                    </div>
                  </dl>
                  <div className="ui-admin-form__grid">
                    <div className="ui-admin-form__field">
                      <label htmlFor="visibility_target_type">下发目标类型</label>
                      <select
                        id="visibility_target_type"
                        value={visibilityForm.target_type}
                        onChange={(event) => setVisibilityForm((current) => ({ ...current, target_type: event.target.value }))}
                      >
                        <option value="school">学校</option>
                        <option value="grade">年级</option>
                        <option value="class">班级</option>
                        <option value="user">用户</option>
                      </select>
                    </div>
                    <div className="ui-admin-form__field">
                      <label htmlFor="visibility_target_id">下发目标ID</label>
                      <input
                        id="visibility_target_id"
                        inputMode="numeric"
                        value={visibilityForm.target_id}
                        onChange={(event) => setVisibilityForm((current) => ({ ...current, target_id: event.target.value }))}
                      />
                    </div>
                    <div className="ui-admin-form__field">
                      <label htmlFor="visibility_permission_type">下发用途</label>
                      <select
                        id="visibility_permission_type"
                        value={visibilityForm.permission_type}
                        onChange={(event) => setVisibilityForm((current) => ({ ...current, permission_type: event.target.value }))}
                      >
                        <option value="view">查看</option>
                        <option value="practice">练题</option>
                        <option value="exam">考试</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="ui-admin-modal__footer">
                  <div className="ui-admin-actions-bar__group">
                    <button type="button" className="ui-button ui-button--ghost" onClick={() => void handlePublish(modal.item)}>
                      发布题库
                    </button>
                    <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleAssignVisibility(modal.item.id)}>
                      下发题库
                    </button>
                    <button type="button" className="ui-button ui-button--primary" onClick={() => openEditModal(modal.item)}>
                      编辑
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>{modal.type === "create" ? "新增题库" : "编辑题库"}</h3>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <form onSubmit={(event) => void handleSubmit(event)}>
                  <div className="ui-admin-modal__body">
                    <div className="ui-admin-form__grid">
                      <div className="ui-admin-form__field">
                        <label htmlFor="question_bank_name">题库名称</label>
                        <input
                          id="question_bank_name"
                          value={form.name}
                          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="question_bank_form_course_id">绑定课程</label>
                        <select
                          id="question_bank_form_course_id"
                          value={form.course_id}
                          onChange={(event) => setForm((current) => ({ ...current, course_id: event.target.value }))}
                        >
                          <option value="">不绑定课程</option>
                          {courses.map((course) => (
                            <option key={course.id} value={course.id}>
                              {course.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                        <label htmlFor="question_bank_description">题库说明</label>
                        <textarea
                          id="question_bank_description"
                          value={form.description}
                          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="ui-admin-modal__footer">
                    <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                      取消
                    </button>
                    <button type="submit" className="ui-button ui-button--primary">
                      {modal.type === "create" ? "新增题库" : "保存修改"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function buildQuestionBankQuery(
  keyword: string,
  courseID: string,
  status: string,
  page: number,
  pageSize: number
): QuestionBankListQuery {
  return {
    keyword: keyword.trim() || undefined,
    course_id: courseID ? Number(courseID) : undefined,
    status: status || undefined,
    page,
    page_size: pageSize
  };
}

function normalizeErrorMessage(message: string): string {
  if (/404|not found/i.test(message)) {
    return "题库列表接口暂不可用，请检查后端 /api/v1/question-banks 服务是否已启动。";
  }
  if (/请求参数错误|invalid/i.test(message)) {
    return "题库请求参数错误，请检查课程或下发目标。";
  }
  return message || "题库数据加载失败";
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

function statusClassName(status: string): string {
  if (["active", "published", "enabled"].includes(status)) {
    return "ui-admin-status ui-admin-status--active";
  }
  if (["disabled", "inactive"].includes(status)) {
    return "ui-admin-status ui-admin-status--disabled";
  }
  return "ui-admin-status ui-admin-status--draft";
}

function formatStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "已发布";
    case "draft":
      return "草稿";
    case "disabled":
      return "禁用";
    default:
      return status;
  }
}

function formatSourceType(sourceType: string): string {
  switch (sourceType) {
    case "manual":
      return "手动创建";
    case "import":
      return "导入";
    default:
      return sourceType || "-";
  }
}

const pageStyle: CSSProperties = {
  minHeight: "100%",
  gap: 0
};

const dataRegionStyle: CSSProperties = {
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  gap: 14,
  minHeight: "100%",
  padding: 22
};

const filterFormStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 320px) minmax(220px, 300px) minmax(180px, 240px) auto",
  alignItems: "end",
  gap: 14,
  margin: 0
};

const queryActionsStyle: CSSProperties = {
  alignItems: "center",
  paddingBottom: 1,
  whiteSpace: "nowrap"
};
