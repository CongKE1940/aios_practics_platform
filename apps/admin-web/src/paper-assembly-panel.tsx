import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type {
  ExamFixedQuestion,
  ExamPaper,
  ExamPaperDetail,
  ExamPaperInput,
  ExamPaperListQuery,
  ExamPaperRule,
  PageResult
} from "@aios/api-sdk";
import {
  ClearableFilterInput,
  ClearableFilterSelect,
  FixedActionList,
  ToastNotice,
  type FixedActionListColumn,
  type FixedActionListRowId
} from "@aios/ui-web";

export interface PaperManagementApi {
  listExamPapers(query?: ExamPaperListQuery): Promise<PageResult<ExamPaper>>;
  createExamPaper(body: ExamPaperInput): Promise<ExamPaperDetail>;
  getExamPaper(id: number): Promise<ExamPaperDetail>;
  updateExamPaper(id: number, body: ExamPaperInput): Promise<ExamPaperDetail>;
  publishExamPaper(id: number): Promise<ExamPaperDetail>;
}

interface PaperManagementPanelProps {
  api: PaperManagementApi;
}

const defaultPageSize = 10;

const defaultForm = {
  paper_name: "",
  paper_type: "fixed",
  fixed_questions_text: "",
  paper_rules_text: "single_choice:2:10:"
};

type FormState = typeof defaultForm;
type ModalState = { type: "create" } | { type: "edit"; item: ExamPaper } | { type: "detail"; item: ExamPaper } | null;

const columns: Array<FixedActionListColumn<ExamPaper>> = [
  {
    key: "paper_name",
    title: "试卷名称",
    render: (item) => item.paper_name
  },
  {
    key: "paper_type",
    title: "试卷类型",
    width: 130,
    render: (item) => formatPaperType(item.paper_type)
  },
  {
    key: "status",
    title: "状态",
    width: 110,
    render: (item) => <span className={statusClassName(item.status)}>{formatStatus(item.status)}</span>
  },
  {
    key: "question_count",
    title: "题量",
    width: 90,
    render: (item) => `${item.question_count ?? 0} 题`
  },
  {
    key: "total_score",
    title: "总分",
    width: 90,
    render: (item) => `${formatScore(item.total_score)} 分`
  },
  {
    key: "updated_at",
    title: "更新时间",
    width: 170,
    render: (item) => formatDateTime(item.updated_at ?? item.created_at)
  }
];

export function PaperManagementPanel({ api }: PaperManagementPanelProps) {
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [items, setItems] = useState<ExamPaper[]>([]);
  const [selectedIDs, setSelectedIDs] = useState<FixedActionListRowId[]>([]);
  const [detail, setDetail] = useState<ExamPaperDetail | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);
  const didLoadRef = useRef(false);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentSummary = useMemo(() => summarizeForm(form), [form]);

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadPage(buildQuery("", "", 1, defaultPageSize));
  }, [api]);

  async function loadPage(query: ExamPaperListQuery = buildQuery(keyword, status, page, pageSize)) {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await api.listExamPapers(query);
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page || query.page || 1);
      setPageSize(result.page_size || query.page_size || defaultPageSize);
    } catch (error) {
      setItems([]);
      setTotal(0);
      setPage(query.page || 1);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "试卷数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedIDs([]);
    await loadPage(buildQuery(keyword, status, 1, pageSize));
  }

  async function handleReset() {
    setKeyword("");
    setStatus("");
    setSelectedIDs([]);
    await loadPage(buildQuery("", "", 1, defaultPageSize));
  }

  async function openDetailModal(item: ExamPaper) {
    setModal({ type: "detail", item });
    setDetailLoading(true);
    setErrorMessage("");
    try {
      setDetail(await api.getExamPaper(item.id));
    } catch (error) {
      setDetail(null);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "试卷详情加载失败");
    } finally {
      setDetailLoading(false);
    }
  }

  async function openEditModal(item: ExamPaper) {
    setModal({ type: "edit", item });
    setDetailLoading(true);
    try {
      const data = await api.getExamPaper(item.id);
      setDetail(data);
      setForm(buildFormFromDetail(data));
    } catch (error) {
      setDetail(null);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "试卷详情加载失败");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = buildPayload(form);
    if (typeof payload === "string") {
      setErrorMessage(payload);
      return;
    }
    if (modal?.type === "edit") {
      await api.updateExamPaper(modal.item.id, payload);
    } else {
      await api.createExamPaper(payload);
    }
    closeModal();
    await loadPage();
  }

  async function handlePublish(item: ExamPaper) {
    await api.publishExamPaper(item.id);
    await loadPage();
    if (detail?.id === item.id) {
      setDetail(await api.getExamPaper(item.id));
    }
  }

  function closeModal() {
    setModal(null);
    setDetail(null);
    setForm(defaultForm);
  }

  return (
    <section aria-label="试卷管理面板" className="ui-admin-page" style={pageStyle}>
      {errorMessage ? <ToastNotice tone="danger" title="试卷数据加载失败" description={errorMessage} onClose={() => setErrorMessage("")} /> : null}

      <section className="ui-admin-card" aria-label="试卷数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <ClearableFilterInput id="paper_keyword" label="关键字" placeholder="输入试卷名称" value={keyword} onChange={setKeyword} />
          <ClearableFilterSelect id="paper_status" label="状态" placeholder="请选择状态" value={status} onChange={setStatus}>
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
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
          onCreate={() => setModal({ type: "create" })}
          onDetail={(item) => void openDetailModal(item)}
          onEdit={(item) => void openEditModal(item)}
          currentPage={page}
          pageCount={pageCount}
          total={total}
          onPageChange={(nextPage) => void loadPage(buildQuery(keyword, status, nextPage, pageSize))}
          minHeight="100%"
          emptyText={loading ? "数据加载中..." : "暂无试卷数据"}
          ariaLabel="试卷列表"
          createLabel="新增"
          deleteLabel="删除"
          exportLabel="导出"
          rowCheckboxLabel={(item) => `选择试卷-${item.paper_name}`}
        />
      </section>

      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="试卷管理弹层">
            {modal.type === "detail" ? (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>试卷详情</h3>
                    <p>{detail?.paper_name ?? modal.item.paper_name}</p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <div className="ui-admin-modal__body">
                  {detailLoading ? <div className="ui-admin-empty-inline">试卷详情加载中...</div> : null}
                  {!detailLoading && detail ? (
                    <>
                      <dl className="ui-admin-meta-list">
                        <div>
                          <dt>试卷类型</dt>
                          <dd>{formatPaperType(detail.paper_type)}</dd>
                        </div>
                        <div>
                          <dt>状态</dt>
                          <dd>{formatStatus(detail.status)}</dd>
                        </div>
                        <div>
                          <dt>题量</dt>
                          <dd>{detail.question_count} 题</dd>
                        </div>
                        <div>
                          <dt>总分</dt>
                          <dd>{formatScore(detail.total_score)} 分</dd>
                        </div>
                      </dl>
                      <div className="ui-admin-mini-list">
                        <article className="ui-admin-mini-item">
                          <strong>题目清单</strong>
                          <p>{formatQuestions(detail.questions)}</p>
                        </article>
                        <article className="ui-admin-mini-item">
                          <strong>抽题规则</strong>
                          <p>{formatRules(detail.paper_rules)}</p>
                        </article>
                      </div>
                    </>
                  ) : null}
                </div>
                <div className="ui-admin-modal__footer">
                  <div className="ui-admin-actions-bar__group">
                    {detail?.status === "draft" ? (
                      <button type="button" className="ui-button ui-button--ghost" onClick={() => void handlePublish(detail)}>
                        发布试卷
                      </button>
                    ) : null}
                    {detail?.status === "draft" ? (
                      <button type="button" className="ui-button ui-button--primary" onClick={() => void openEditModal(detail)}>
                        编辑
                      </button>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>{modal.type === "create" ? "新增试卷" : "编辑试卷"}</h3>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <form onSubmit={(event) => void handleSubmit(event)}>
                  <div className="ui-admin-modal__body">
                    {detailLoading ? <div className="ui-admin-empty-inline">试卷草稿加载中...</div> : null}
                    <div className="ui-admin-form__grid ui-admin-form__grid--wide">
                      <div className="ui-admin-form__field">
                        <label htmlFor="paper_name">试卷名称</label>
                        <input id="paper_name" value={form.paper_name} onChange={(event) => setForm((current) => ({ ...current, paper_name: event.target.value }))} />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="paper_type">试卷类型</label>
                        <select id="paper_type" value={form.paper_type} onChange={(event) => setForm((current) => ({ ...current, paper_type: event.target.value }))}>
                          <option value="fixed">固定试卷</option>
                          <option value="random_rule">随机规则试卷</option>
                        </select>
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="paper_summary">试卷摘要</label>
                        <input id="paper_summary" value={`${currentSummary.questionCount} 题 / ${formatScore(currentSummary.totalScore)} 分`} readOnly />
                      </div>
                      {form.paper_type === "fixed" ? (
                        <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                          <label htmlFor="paper_fixed_questions">固定题目</label>
                          <textarea
                            id="paper_fixed_questions"
                            placeholder="每行一个：question_id:question_version_id:score:display_order"
                            value={form.fixed_questions_text}
                            onChange={(event) => setForm((current) => ({ ...current, fixed_questions_text: event.target.value }))}
                          />
                        </div>
                      ) : (
                        <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                          <label htmlFor="paper_rules">抽题规则</label>
                          <textarea
                            id="paper_rules"
                            placeholder="每行一个：question_type:score_per_question:question_count:bank_id|bank_id"
                            value={form.paper_rules_text}
                            onChange={(event) => setForm((current) => ({ ...current, paper_rules_text: event.target.value }))}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="ui-admin-modal__footer">
                    <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                      取消
                    </button>
                    <button type="submit" className="ui-button ui-button--primary" disabled={detailLoading}>
                      {modal.type === "create" ? "新增试卷" : "保存修改"}
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

export function PaperAssemblyPanel({ api }: PaperManagementPanelProps) {
  return <PaperManagementPanel api={api} />;
}

function buildQuery(keyword: string, status: string, page: number, pageSize: number): ExamPaperListQuery {
  return {
    keyword: keyword.trim() || undefined,
    status: status || undefined,
    page,
    page_size: pageSize
  };
}

function buildPayload(form: FormState): ExamPaperInput | string {
  const paperName = form.paper_name.trim();
  if (!paperName) {
    return "请填写试卷名称。";
  }
  if (form.paper_type === "fixed") {
    const fixedQuestions = parseFixedQuestions(form.fixed_questions_text);
    if (fixedQuestions.length === 0) {
      return "请填写固定题目。";
    }
    return { paper_name: paperName, paper_type: "fixed", fixed_questions: fixedQuestions, paper_rules: [] };
  }
  const paperRules = parsePaperRules(form.paper_rules_text);
  if (paperRules.length === 0) {
    return "请填写抽题规则。";
  }
  return { paper_name: paperName, paper_type: "random_rule", fixed_questions: [], paper_rules: paperRules };
}

function buildFormFromDetail(detail: ExamPaperDetail): FormState {
  return {
    paper_name: detail.paper_name,
    paper_type: detail.paper_type,
    fixed_questions_text: detail.questions
      .slice()
      .sort((left, right) => left.display_order - right.display_order)
      .map((item) => `${item.question_id}:${item.question_version_id}:${formatScore(item.score)}:${item.display_order}`)
      .join("\n"),
    paper_rules_text: detail.paper_rules.map((item) => [item.question_type, formatScore(item.score_per_question), item.question_count, item.bank_ids?.join("|") ?? ""].join(":")).join("\n")
  };
}

function summarizeForm(form: FormState): { questionCount: number; totalScore: number } {
  if (form.paper_type === "fixed") {
    const questions = parseFixedQuestions(form.fixed_questions_text);
    return {
      questionCount: questions.length,
      totalScore: questions.reduce((sum, item) => sum + item.score, 0)
    };
  }
  const rules = parsePaperRules(form.paper_rules_text);
  return {
    questionCount: rules.reduce((sum, item) => sum + item.question_count, 0),
    totalScore: rules.reduce((sum, item) => sum + item.question_count * item.score_per_question, 0)
  };
}

function parseFixedQuestions(value: string): ExamFixedQuestion[] {
  return value
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [questionID, questionVersionID, score, displayOrder] = line.split(":").map((part) => part.trim());
      return {
        question_id: Number(questionID),
        question_version_id: Number(questionVersionID),
        score: Number(score),
        display_order: Number(displayOrder)
      };
    })
    .filter((item) => item.question_id > 0 && item.question_version_id > 0 && item.score > 0 && item.display_order > 0);
}

function parsePaperRules(value: string): ExamPaperRule[] {
  return value
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [questionType, scorePerQuestion, questionCount, bankIDText] = line.split(":").map((part) => part.trim());
      const bankIDs = bankIDText
        ? bankIDText
            .split("|")
            .map((item) => Number(item.trim()))
            .filter((item) => Number.isFinite(item) && item > 0)
        : [];
      return {
        question_type: questionType,
        score_per_question: Number(scorePerQuestion),
        question_count: Number(questionCount),
        bank_ids: bankIDs
      };
    })
    .filter((item) => item.question_type && item.score_per_question > 0 && item.question_count > 0);
}

function formatQuestions(items: ExamFixedQuestion[]): string {
  if (!items || items.length === 0) {
    return "暂无题目";
  }
  return items
    .slice()
    .sort((left, right) => left.display_order - right.display_order)
    .map((item) => `第 ${item.display_order} 题：题目 ${item.question_id} / ${formatScore(item.score)} 分`)
    .join("；");
}

function formatRules(items: ExamPaperRule[]): string {
  if (!items || items.length === 0) {
    return "暂无抽题规则";
  }
  return items.map((item, index) => `规则 ${index + 1}：${item.question_type} × ${item.question_count}，每题 ${formatScore(item.score_per_question)} 分`).join("；");
}

function formatPaperType(value: string): string {
  switch (value) {
    case "random_rule":
      return "随机规则试卷";
    case "fixed":
      return "固定试卷";
    default:
      return value || "-";
  }
}

function formatStatus(value: string): string {
  switch (value) {
    case "draft":
      return "草稿";
    case "published":
      return "已发布";
    default:
      return value || "-";
  }
}

function statusClassName(value: string): string {
  if (value === "published") {
    return "ui-admin-status ui-admin-status--active";
  }
  return "ui-admin-status ui-admin-status--pending";
}

function formatScore(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "0";
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
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

function normalizeErrorMessage(message: string): string {
  if (/404|not found/i.test(message)) {
    return "试卷接口暂不可用，请检查后端 /api/v1/exam-papers 服务是否已启动。";
  }
  if (/请求参数错误|invalid/i.test(message)) {
    return "试卷请求参数错误，请检查题目清单或抽题规则。";
  }
  return message || "试卷数据加载失败";
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
  gridTemplateColumns: "minmax(220px, 320px) minmax(160px, 220px) auto",
  alignItems: "end",
  gap: 14,
  margin: 0
};

const queryActionsStyle: CSSProperties = {
  alignItems: "center",
  paddingBottom: 1,
  whiteSpace: "nowrap"
};
