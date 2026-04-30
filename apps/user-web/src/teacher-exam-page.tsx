import { useEffect, useState, type FormEvent } from "react";

import type {
  Exam,
  ExamAttemptQuestionReviewInput,
  ExamAttemptQuestionReviewResult,
  ExamAttemptReviewResult,
  ExamDetail,
  ExamFixedQuestion,
  ExamInput,
  ExamOverviewResult,
  ExamPaperRule,
  ExamTarget,
  PageResult
} from "@aios/api-sdk";
import { ClearableFilterInput, ClearableFilterSelect } from "@aios/ui-web";

export interface TeacherExamApi {
  listExams(query?: { page?: number; page_size?: number; status?: string; keyword?: string }): Promise<PageResult<Exam>>;
  createExam(body: ExamInput): Promise<ExamDetail>;
  getExam(id: number): Promise<ExamDetail>;
  updateExam(id: number, body: ExamInput): Promise<ExamDetail>;
  publishExam(id: number): Promise<ExamDetail>;
  getExamOverview(query: {
    exam_id: number;
    attempt_status?: string;
    review_status?: string;
    keyword?: string;
    page?: number;
    page_size?: number;
  }): Promise<ExamOverviewResult>;
  exportExamOverviewCsv(query: {
    exam_id: number;
    attempt_status?: string;
    review_status?: string;
    keyword?: string;
    page?: number;
    page_size?: number;
  }): Promise<string>;
  getExamAttemptReview(query: { attempt_id: number }): Promise<ExamAttemptReviewResult>;
  reviewExamAttemptQuestion(body: ExamAttemptQuestionReviewInput): Promise<ExamAttemptQuestionReviewResult>;
}

interface TeacherExamPageProps {
  api: TeacherExamApi;
}

const defaultForm = {
  name: "",
  examMode: "fixed",
  startTime: "",
  endTime: "",
  durationMinutes: "60",
  targetsText: "",
  fixedQuestionsText: "",
  paperRulesText: ""
};

const defaultOverviewFilter = {
  attemptStatus: "",
  reviewStatus: "",
  keyword: ""
};

export function TeacherExamPage({ api }: TeacherExamPageProps) {
  const [form, setForm] = useState(defaultForm);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [selectedExamDetail, setSelectedExamDetail] = useState<ExamDetail | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedExamOverview, setSelectedExamOverview] = useState<ExamOverviewResult | null>(null);
  const [selectedAttemptReview, setSelectedAttemptReview] = useState<ExamAttemptReviewResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [attemptReviewLoading, setAttemptReviewLoading] = useState(false);
  const [attemptReviewSaving, setAttemptReviewSaving] = useState(false);
  const [overviewPage, setOverviewPage] = useState(1);
  const [overviewFilter, setOverviewFilter] = useState(defaultOverviewFilter);
  const [reviewQuestionIndex, setReviewQuestionIndex] = useState(0);
  const [reviewPendingOnly, setReviewPendingOnly] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingExamId, setEditingExamId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [message, setMessage] = useState("正在加载考试...");

  useEffect(() => {
    void loadExams();
  }, [api]);

  useEffect(() => {
    if (!selectedAttemptReview) {
      return;
    }
    const visibleQuestions = reviewPendingOnly
      ? pendingReviewQuestions(selectedAttemptReview.questions)
      : selectedAttemptReview.questions;
    if (reviewQuestionIndex >= visibleQuestions.length) {
      setReviewQuestionIndex(Math.max(0, visibleQuestions.length - 1));
    }
  }, [selectedAttemptReview, reviewPendingOnly, reviewQuestionIndex]);

  async function loadExams(successMessage?: string) {
    setLoading(true);
    try {
      const data = await api.listExams({ page: 1, page_size: 20 });
      setExams(data.items ?? []);
      setMessage(successMessage ?? (data.items.length > 0 ? "" : "暂无考试。"));
    } catch {
      setExams([]);
      setMessage("考试列表加载失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = buildExamPayload(form);
    if (typeof payload === "string") {
      setMessage(payload);
      return;
    }

    setSaving(true);
    setMessage(formMode === "edit" ? "正在更新考试草稿..." : "正在保存考试草稿...");
    try {
      if (formMode === "edit" && editingExamId) {
        const updated = await api.updateExam(editingExamId, payload);
        setSelectedExamId(updated.id);
        setSelectedExamDetail(updated);
        setSelectedAttemptReview(null);
        await loadExamOverview(updated.id, 1);
        closeEditModal();
        await loadExams(`草稿已更新：${updated.name}`);
      } else {
        const created = await api.createExam(payload);
        setSelectedExamId(created.id);
        setSelectedExamDetail(created);
        setSelectedAttemptReview(null);
        await loadExamOverview(created.id, 1);
        setForm(defaultForm);
        setFormMode("create");
        setEditingExamId(null);
        await loadExams(`草稿已保存：${created.name}`);
      }
    } catch {
      setMessage(formMode === "edit" ? "考试草稿更新失败，请稍后重试。" : "考试草稿保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function handleView(id: number) {
    setDetailLoading(true);
    setSelectedExamId(id);
    setOverviewPage(1);
    setReviewQuestionIndex(0);
    setReviewPendingOnly(false);
    setSelectedAttemptReview(null);
    setMessage("正在加载考试详情...");
    try {
      const detail = await api.getExam(id);
      setSelectedExamDetail(detail);
      await loadExamOverview(id, 1);
      setDetailModalOpen(true);
      setMessage("");
    } catch {
      setSelectedExamDetail(null);
      setSelectedExamOverview(null);
      setDetailModalOpen(false);
      setMessage("考试详情加载失败，请稍后重试。");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleEdit(id: number) {
    setDetailLoading(true);
    setSelectedExamId(id);
    setOverviewPage(1);
    setReviewQuestionIndex(0);
    setReviewPendingOnly(false);
    setSelectedAttemptReview(null);
    setMessage("正在载入草稿...");
    try {
      const detail = await api.getExam(id);
      setSelectedExamDetail(detail);
      await loadExamOverview(id, 1);
      setForm(buildFormFromDetail(detail));
      setFormMode("edit");
      setEditingExamId(id);
      setDetailModalOpen(false);
      setEditModalOpen(true);
      setMessage("");
    } catch {
      setMessage("考试草稿加载失败，请稍后重试。");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handlePublish(id: number) {
    setPublishingId(id);
    setMessage("正在发布考试...");
    try {
      const published = await api.publishExam(id);
      if (selectedExamId === id) {
        setSelectedExamDetail(published);
        setSelectedAttemptReview(null);
        setReviewPendingOnly(false);
        await loadExamOverview(id, 1);
      }
      await loadExams(`考试已发布：${published.name}`);
    } catch {
      setMessage("考试发布失败，请稍后重试。");
    } finally {
      setPublishingId(null);
    }
  }

  function closeEditModal() {
    setEditModalOpen(false);
    setForm(defaultForm);
    setFormMode("create");
    setEditingExamId(null);
  }

  async function loadExamOverview(id: number, page = 1) {
    setOverviewLoading(true);
    try {
      const result = await api.getExamOverview(buildOverviewQuery(id, overviewFilter, page));
      setSelectedExamOverview(result);
      setOverviewPage(result.students.page ?? page);
    } catch {
      setMessage("考试统计加载失败，请稍后重试。");
    } finally {
      setOverviewLoading(false);
    }
  }

  async function handleOverviewPageChange(nextPage: number) {
    if (!selectedExamId || nextPage <= 0 || overviewLoading) {
      return;
    }
    await loadExamOverview(selectedExamId, nextPage);
  }

  async function handleOverviewSearch() {
    if (!selectedExamId || overviewLoading) {
      return;
    }
    await loadExamOverview(selectedExamId, 1);
  }

  async function handleOverviewReset() {
    if (!selectedExamId || overviewLoading) {
      setOverviewFilter(defaultOverviewFilter);
      return;
    }
    const resetFilter = { ...defaultOverviewFilter };
    setOverviewFilter(resetFilter);
    setOverviewLoading(true);
    try {
      const result = await api.getExamOverview(buildOverviewQuery(selectedExamId, resetFilter, 1));
      setSelectedExamOverview(result);
      setOverviewPage(result.students.page ?? 1);
    } catch {
      setSelectedExamOverview(null);
      setMessage("考试统计加载失败，请稍后重试。");
    } finally {
      setOverviewLoading(false);
    }
  }

  async function handleOverviewExport() {
    if (!selectedExamId) {
      return;
    }
    try {
      const csv = await api.exportExamOverviewCsv(buildOverviewQuery(selectedExamId, overviewFilter, 1));
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `exam-overview-${selectedExamId}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setMessage("成绩明细已导出。");
    } catch {
      setMessage("成绩导出失败，请稍后重试。");
    }
  }

  async function handleLoadAttemptReview(attemptId: number) {
    setAttemptReviewLoading(true);
    try {
      const result = await api.getExamAttemptReview({ attempt_id: attemptId });
      setReviewQuestionIndex(firstPendingReviewQuestionIndex(result.questions));
      setSelectedAttemptReview(result);
      setReviewPendingOnly(false);
      setMessage("");
    } catch {
      setMessage("答卷加载失败，请稍后重试。");
    } finally {
      setAttemptReviewLoading(false);
    }
  }

  async function handleReviewQuestion(input: { display_order: number; score: number; review_comment?: string }) {
    if (!selectedAttemptReview) {
      return;
    }
    setAttemptReviewSaving(true);
    try {
      const result = await api.reviewExamAttemptQuestion({
        attempt_id: selectedAttemptReview.summary.attempt_id,
        display_order: input.display_order,
        score: input.score,
        review_comment: input.review_comment
      });
      setSelectedAttemptReview((current) => {
        if (!current) {
          return current;
        }
        return {
          summary: result.summary,
          questions: current.questions.map((question) =>
            question.display_order === result.question.display_order ? result.question : question
          )
        };
      });
      if (selectedExamId) {
        await loadExamOverview(selectedExamId, overviewPage);
      }
    } finally {
      setAttemptReviewSaving(false);
    }
  }

  const attemptReviewStats = selectedAttemptReview ? buildAttemptReviewStats(selectedAttemptReview.questions) : null;
  const visibleAttemptReviewQuestions = selectedAttemptReview
    ? reviewPendingOnly
      ? pendingReviewQuestions(selectedAttemptReview.questions)
      : selectedAttemptReview.questions
    : [];
  const currentAttemptReviewQuestion =
    visibleAttemptReviewQuestions[reviewQuestionIndex] ?? visibleAttemptReviewQuestions[0] ?? null;

  function renderExamDraftForm(options?: { modal?: boolean }) {
    return (
      <form onSubmit={(event) => void handleSubmit(event)}>
        <div className={options?.modal ? "ui-admin-modal__body ui-admin-form__grid ui-admin-form__grid--wide" : "ui-admin-form__grid ui-admin-form__grid--wide"}>
          <div className="ui-admin-form__field">
            <label htmlFor="teacher_exam_name">考试名称</label>
            <input
              id="teacher_exam_name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </div>

          <div className="ui-admin-form__field">
            <label htmlFor="teacher_exam_mode">组卷方式</label>
            <select
              id="teacher_exam_mode"
              value={form.examMode}
              onChange={(event) => setForm((current) => ({ ...current, examMode: event.target.value }))}
            >
              <option value="fixed">固定试卷</option>
              <option value="random_assembly">随机组卷</option>
            </select>
          </div>

          <div className="ui-admin-form__field">
            <label htmlFor="teacher_exam_start_time">开始时间</label>
            <input
              id="teacher_exam_start_time"
              type="datetime-local"
              value={form.startTime}
              onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))}
            />
          </div>

          <div className="ui-admin-form__field">
            <label htmlFor="teacher_exam_end_time">结束时间</label>
            <input
              id="teacher_exam_end_time"
              type="datetime-local"
              value={form.endTime}
              onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))}
            />
          </div>

          <div className="ui-admin-form__field">
            <label htmlFor="teacher_exam_duration">考试时长</label>
            <input
              id="teacher_exam_duration"
              inputMode="numeric"
              value={form.durationMinutes}
              onChange={(event) => setForm((current) => ({ ...current, durationMinutes: event.target.value }))}
            />
          </div>

          <div className="ui-admin-form__field">
            <label htmlFor="teacher_exam_targets">发布范围</label>
            <textarea
              id="teacher_exam_targets"
              value={form.targetsText}
              onChange={(event) => setForm((current) => ({ ...current, targetsText: event.target.value }))}
            />
          </div>

          {form.examMode === "fixed" ? (
            <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="teacher_exam_fixed_questions">固定题目</label>
              <textarea
                id="teacher_exam_fixed_questions"
                value={form.fixedQuestionsText}
                onChange={(event) => setForm((current) => ({ ...current, fixedQuestionsText: event.target.value }))}
              />
            </div>
          ) : (
            <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="teacher_exam_paper_rules">抽题规则</label>
              <textarea
                id="teacher_exam_paper_rules"
                value={form.paperRulesText}
                onChange={(event) => setForm((current) => ({ ...current, paperRulesText: event.target.value }))}
              />
            </div>
          )}
        </div>

        <div className={options?.modal ? "ui-admin-modal__footer" : "ui-admin-form__actions"} style={options?.modal ? undefined : { marginTop: 16 }}>
          {options?.modal ? (
            <button type="button" className="ui-button ui-button--ghost" onClick={closeEditModal}>
              取消
            </button>
          ) : null}
          <button type="submit" className="ui-button ui-button--primary" disabled={saving}>
            {saving ? "保存中..." : formMode === "edit" ? "更新草稿" : "保存草稿"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <section aria-label="考试管理页">
      <h2>考试管理</h2>

      {!editModalOpen ? (
        <section className="ui-admin-card" aria-label="考试草稿编辑区">
          <div className="ui-admin-card__header">
            <div>
              <h3>创建考试草稿</h3>
            </div>
          </div>
          {renderExamDraftForm()}
        </section>
      ) : null}

      {message ? <p>{message}</p> : null}
      {loading ? <p>正在刷新...</p> : null}

      <section aria-label="考试列表">
        <h3>考试列表</h3>
        {exams.length > 0 ? (
          <ul>
            {exams.map((exam) => (
              <li key={exam.id}>
                <p>{exam.name}</p>
                <p>
                  {formatMode(exam.exam_mode)} / {formatStatus(exam.status)}
                </p>
                <p>
                  {formatTime(exam.start_time)} 至 {formatTime(exam.end_time)}
                </p>
                <p>时长：{exam.duration_minutes ?? "-"} 分钟</p>
                <button type="button" onClick={() => void handleView(exam.id)}>
                  查看详情
                </button>
                {exam.status === "draft" ? (
                  <button type="button" onClick={() => void handleEdit(exam.id)}>
                    编辑草稿
                  </button>
                ) : null}
                {exam.status === "draft" ? (
                  <button type="button" disabled={publishingId === exam.id} onClick={() => void handlePublish(exam.id)}>
                    {publishingId === exam.id ? "发布中..." : "发布"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-label="考试统计区">
        <h3>考试统计与答卷</h3>
        {detailLoading ? <p>正在加载详情...</p> : null}
        {!detailLoading && selectedExamDetail ? (
          <>
            <p>考试名称：{selectedExamDetail.name}</p>
            <p>发布范围：{formatTargets(selectedExamDetail.targets)}</p>
            <p>
              时间：{formatTime(selectedExamDetail.start_time)} 至 {formatTime(selectedExamDetail.end_time)}
            </p>
            <p>时长：{selectedExamDetail.duration_minutes} 分钟</p>
            <section aria-label="试卷预览">
              <h4>试卷预览</h4>
              {selectedExamDetail.exam_mode === "fixed" ? (
                selectedExamDetail.fixed_questions && selectedExamDetail.fixed_questions.length > 0 ? (
                  <ul>
                    {selectedExamDetail.fixed_questions
                      .slice()
                      .sort((left, right) => left.display_order - right.display_order)
                      .map((item) => (
                        <li key={`${item.question_id}-${item.display_order}`}>
                          <p>第 {item.display_order} 题</p>
                          <p>
                            题目 {item.question_id} / 版本 {item.question_version_id} / {formatScore(item.score)} 分
                          </p>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p>暂无固定题目。</p>
                )
              ) : selectedExamDetail.paper_rules && selectedExamDetail.paper_rules.length > 0 ? (
                <ul>
                  {selectedExamDetail.paper_rules.map((rule, index) => (
                    <li key={`${rule.question_type}-${index}`}>
                      <p>规则 {index + 1}</p>
                      <p>题型：{rule.question_type}</p>
                      <p>题量：{rule.question_count}</p>
                      <p>单题分值：{formatScore(rule.score_per_question)}</p>
                      <p>题库范围：{rule.bank_ids?.join(", ") || "-"}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>暂无组卷规则。</p>
              )}
            </section>
            <section aria-label="考试统计">
              <h4>考试统计</h4>
              {overviewLoading ? <p>正在加载考试统计...</p> : null}
              {!overviewLoading && selectedExamOverview ? (
                <>
                  <p>应参加人数：{selectedExamOverview.summary.student_count}</p>
                  <p>已参与：{selectedExamOverview.summary.participated_student_count}</p>
                  <p>已交卷：{selectedExamOverview.summary.submitted_count}</p>
                  <p>作答中：{selectedExamOverview.summary.in_progress_count}</p>
                  <p>未开始：{selectedExamOverview.summary.absent_count}</p>
                  <p>平均分：{formatScore(selectedExamOverview.summary.average_score)}</p>
                  <p>最高分：{formatScore(selectedExamOverview.summary.highest_score)}</p>
                  <p>最低分：{formatScore(selectedExamOverview.summary.lowest_score)}</p>
                  <section aria-label="成绩列表">
                    <h5>成绩列表</h5>
                    <div>
                      <ClearableFilterSelect
                        id="teacher_exam_attempt_status_filter"
                        label="作答状态筛选"
                        placeholder="请选择作答状态"
                        value={overviewFilter.attemptStatus}
                        onChange={(value) => setOverviewFilter((current) => ({ ...current, attemptStatus: value }))}
                      >
                        <option value="not_started">未开始</option>
                        <option value="in_progress">作答中</option>
                        <option value="submitted">已交卷</option>
                      </ClearableFilterSelect>
                      <ClearableFilterSelect
                        id="teacher_exam_review_status_filter"
                        label="批阅状态筛选"
                        placeholder="请选择批阅状态"
                        value={overviewFilter.reviewStatus}
                        onChange={(value) => setOverviewFilter((current) => ({ ...current, reviewStatus: value }))}
                      >
                        <option value="pending">待批阅</option>
                        <option value="reviewed">已批阅</option>
                      </ClearableFilterSelect>
                      <ClearableFilterInput
                        id="teacher_exam_keyword_filter"
                        label="学生搜索"
                        value={overviewFilter.keyword}
                        onChange={(value) => setOverviewFilter((current) => ({ ...current, keyword: value }))}
                      />
                      <button type="button" onClick={() => void handleOverviewSearch()}>
                        查询成绩
                      </button>
                      <button type="button" onClick={() => void handleOverviewReset()}>
                        重置筛选
                      </button>
                      <button type="button" onClick={() => void handleOverviewExport()}>
                        导出 CSV
                      </button>
                    </div>
                    {selectedExamOverview.students.items.length > 0 ? (
                      <>
                        <ul>
                          {selectedExamOverview.students.items.map((student) => (
                            <li key={student.student_user_id}>
                              <p>{student.student_name}</p>
                              <p>学号：{student.student_no ?? "-"}</p>
                              <p>班级：{student.class_name ?? "-"}</p>
                              <p>状态：{formatAttemptStatus(student.attempt_status)}</p>
                              <p>批阅：{formatReviewStatus(student.review_status)}</p>
                              <p>得分：{formatNullableScore(student.final_score)}</p>
                              <p>客观题：{formatNullableScore(student.objective_score)}</p>
                              <p>主观题：{formatNullableScore(student.subjective_score)}</p>
                              <p>交卷时间：{formatTime(student.submit_at)}</p>
                              {student.attempt_id ? <AttemptReviewButton attemptId={student.attempt_id} onOpen={handleLoadAttemptReview} /> : null}
                            </li>
                          ))}
                        </ul>
                        <p>
                          第 {selectedExamOverview.students.page} /{" "}
                          {Math.max(
                            1,
                            Math.ceil(selectedExamOverview.students.total / Math.max(1, selectedExamOverview.students.page_size))
                          )}{" "}
                          页
                        </p>
                        <button
                          type="button"
                          disabled={selectedExamOverview.students.page <= 1 || overviewLoading}
                          onClick={() => void handleOverviewPageChange(overviewPage - 1)}
                        >
                          上一页
                        </button>
                        <button
                          type="button"
                          disabled={
                            overviewLoading ||
                            selectedExamOverview.students.page * selectedExamOverview.students.page_size >=
                              selectedExamOverview.students.total
                          }
                          onClick={() => void handleOverviewPageChange(overviewPage + 1)}
                        >
                          下一页
                        </button>
                      </>
                    ) : (
                      <p>暂无学生成绩。</p>
                    )}
                  </section>
                </>
              ) : !overviewLoading ? (
                <p>考试统计暂不可用。</p>
              ) : null}
            </section>
            <section aria-label="学生答卷区">
              <h4>学生答卷</h4>
              {attemptReviewLoading ? <p>正在加载答卷...</p> : null}
              {!attemptReviewLoading && selectedAttemptReview ? (
                <>
                  <p>学生：{selectedAttemptReview.summary.student_name}</p>
                  <p>学号：{selectedAttemptReview.summary.student_no ?? "-"}</p>
                  <p>班级：{selectedAttemptReview.summary.class_name ?? "-"}</p>
                  <p>状态：{formatAttemptStatus(selectedAttemptReview.summary.attempt_status)}</p>
                  <p>总分：{formatScore(selectedAttemptReview.summary.final_score)}</p>
                  <p>客观题：{formatScore(selectedAttemptReview.summary.objective_score)}</p>
                  <p>主观题：{formatScore(selectedAttemptReview.summary.subjective_score)}</p>
                  {selectedAttemptReview.questions.length > 0 ? (
                    <>
                      {attemptReviewStats ? (
                        <section aria-label="批阅工作台">
                          <p>
                            主观题进度：{attemptReviewStats.reviewed} / {attemptReviewStats.total} 已批阅，
                            {attemptReviewStats.pending} 题待批阅
                          </p>
                          <label>
                            <input
                              type="checkbox"
                              checked={reviewPendingOnly}
                              onChange={(event) => {
                                setReviewPendingOnly(event.target.checked);
                                setReviewQuestionIndex(0);
                              }}
                            />
                            只看待批阅
                          </label>
                          <button
                            type="button"
                            disabled={reviewQuestionIndex <= 0}
                            onClick={() => setReviewQuestionIndex((current) => Math.max(0, current - 1))}
                          >
                            上一题
                          </button>
                          <button
                            type="button"
                            disabled={reviewQuestionIndex >= visibleAttemptReviewQuestions.length - 1}
                            onClick={() =>
                              setReviewQuestionIndex((current) =>
                                Math.min(visibleAttemptReviewQuestions.length - 1, current + 1)
                              )
                            }
                          >
                            下一题
                          </button>
                        </section>
                      ) : null}
                      {visibleAttemptReviewQuestions.length > 1 ? (
                        <nav aria-label="答卷题号导航">
                          {visibleAttemptReviewQuestions.map((question, index) => (
                            <button
                              key={question.display_order}
                              type="button"
                              aria-pressed={index === reviewQuestionIndex}
                              onClick={() => setReviewQuestionIndex(index)}
                            >
                              第 {question.display_order} 题
                            </button>
                          ))}
                        </nav>
                      ) : null}
                      {currentAttemptReviewQuestion ? (
                        <AttemptReviewQuestionDetail
                          attemptReviewSaving={attemptReviewSaving}
                          question={currentAttemptReviewQuestion}
                          onReview={handleReviewQuestion}
                        />
                      ) : (
                        <p>当前筛选下暂无待批阅题目。</p>
                      )}
                    </>
                  ) : (
                    <p>当前答卷暂无题目。</p>
                  )}
                </>
              ) : !attemptReviewLoading ? (
                <p>请在成绩列表中选择一名学生查看答卷。</p>
              ) : null}
            </section>
          </>
        ) : (
          !detailLoading ? <p>请选择一场考试查看详情。</p> : null
        )}
      </section>

      {editModalOpen ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="考试编辑弹层">
            <div className="ui-admin-modal__header">
              <div>
                <h3>编辑考试</h3>
                <p>{selectedExamDetail?.name ?? "考试草稿"}</p>
              </div>
              <button type="button" className="ui-button ui-button--ghost" onClick={closeEditModal}>
                关闭
              </button>
            </div>
            {renderExamDraftForm({ modal: true })}
          </section>
        </div>
      ) : null}

      {detailModalOpen && selectedExamDetail ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="考试详情弹层">
            <div className="ui-admin-modal__header">
              <div>
                <h3>考试详情</h3>
                <p>{selectedExamDetail.name}</p>
              </div>
              <button type="button" className="ui-button ui-button--ghost" onClick={() => setDetailModalOpen(false)}>
                关闭
              </button>
            </div>
            <div className="ui-admin-modal__body">
              <dl className="ui-admin-meta-list">
                <div>
                  <dt>考试名称</dt>
                  <dd>{selectedExamDetail.name}</dd>
                </div>
                <div>
                  <dt>组卷方式</dt>
                  <dd>{formatMode(selectedExamDetail.exam_mode)}</dd>
                </div>
                <div>
                  <dt>考试状态</dt>
                  <dd>{formatStatus(selectedExamDetail.status)}</dd>
                </div>
                <div>
                  <dt>考试时长</dt>
                  <dd>{selectedExamDetail.duration_minutes} 分钟</dd>
                </div>
                <div>
                  <dt>考试时间</dt>
                  <dd>{formatTime(selectedExamDetail.start_time)} 至 {formatTime(selectedExamDetail.end_time)}</dd>
                </div>
                <div>
                  <dt>发布范围</dt>
                  <dd>{formatTargets(selectedExamDetail.targets)}</dd>
                </div>
              </dl>
            </div>
            <div className="ui-admin-modal__footer">
              <button type="button" className="ui-button ui-button--primary" onClick={() => setDetailModalOpen(false)}>
                查看下方统计
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function buildFormFromDetail(detail: ExamDetail): typeof defaultForm {
  return {
    name: detail.name,
    examMode: detail.exam_mode,
    startTime: detail.start_time ? toLocalDateTime(detail.start_time) : "",
    endTime: detail.end_time ? toLocalDateTime(detail.end_time) : "",
    durationMinutes: String(detail.duration_minutes),
    targetsText: detail.targets.map((item) => `${item.target_type}:${item.target_id}`).join("\n"),
    fixedQuestionsText: (detail.fixed_questions ?? [])
      .slice()
      .sort((left, right) => left.display_order - right.display_order)
      .map((item) => `${item.question_id}:${item.question_version_id}:${formatScore(item.score)}:${item.display_order}`)
      .join("\n"),
    paperRulesText: (detail.paper_rules ?? [])
      .map((item) =>
        [item.question_type, formatScore(item.score_per_question), item.question_count, item.bank_ids?.join("|") ?? ""].join(
          ":"
        )
      )
      .join("\n")
  };
}

function buildExamPayload(form: typeof defaultForm): ExamInput | string {
  const name = form.name.trim();
  const durationMinutes = parsePositiveNumber(form.durationMinutes);
  const targets = parseTargets(form.targetsText);

  if (!name) {
    return "请填写考试名称。";
  }
  if (!form.startTime || !form.endTime) {
    return "请填写考试开始和结束时间。";
  }
  if (!durationMinutes) {
    return "请填写有效的考试时长。";
  }
  if (targets.length === 0) {
    return "请填写发布范围。";
  }

  if (form.examMode === "fixed") {
    const fixedQuestions = parseFixedQuestions(form.fixedQuestionsText);
    if (fixedQuestions.length === 0) {
      return "请填写固定题目。";
    }

    return {
      name,
      exam_mode: form.examMode,
      start_time: toApiDateTime(form.startTime),
      end_time: toApiDateTime(form.endTime),
      duration_minutes: durationMinutes,
      targets,
      fixed_questions: fixedQuestions
    };
  }

  const paperRules = parsePaperRules(form.paperRulesText);
  if (paperRules.length === 0) {
    return "请填写抽题规则。";
  }

  return {
    name,
    exam_mode: form.examMode,
    start_time: toApiDateTime(form.startTime),
    end_time: toApiDateTime(form.endTime),
    duration_minutes: durationMinutes,
    targets,
    paper_rules: paperRules
  };
}

function AttemptReviewQuestionDetail({
  question,
  onReview,
  attemptReviewSaving
}: {
  question: ExamAttemptReviewResult["questions"][number];
  onReview(input: { display_order: number; score: number; review_comment?: string }): Promise<void>;
  attemptReviewSaving: boolean;
}) {
  const [scoreText, setScoreText] = useState(String(question.answer_score));
  const [reviewComment, setReviewComment] = useState(question.review_comment ?? "");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setScoreText(String(question.answer_score));
    setReviewComment(question.review_comment ?? "");
    setMessage("");
  }, [question]);

  async function handleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const score = Number(scoreText);
    if (!Number.isFinite(score) || score < 0 || score > question.score) {
      setMessage("请输入有效分数。");
      return;
    }
    try {
      await onReview({
        display_order: question.display_order,
        score,
        review_comment: reviewComment
      });
      setMessage("批阅已保存。");
    } catch {
      setMessage("批阅保存失败，请重试。");
    }
  }

  return (
    <section aria-label="答卷按题查看">
      <p>
        第 {question.display_order} 题（{question.question_type}）
      </p>
      <p>题干：{extractStem(question.content)}</p>
      {questionOptions(question.content, question.question_type).length > 0 ? (
        <ul>
          {questionOptions(question.content, question.question_type).map((option) => (
            <li key={option.key}>
              <p>
                {option.key}. {option.text}
                {isOptionSelected(question.student_answer, option.key) ? " / 学生已选" : ""}
                {isOptionCorrect(question.correct_answer, option.key) ? " / 正确答案" : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      <p>学生答案：{formatAnswerText(question.student_answer)}</p>
      <p>正确答案：{formatAnswerText(question.correct_answer)}</p>
      <p>结果：{formatReviewResult(question)}</p>
      <p>
        得分：{formatScore(question.answer_score)} / {formatScore(question.score)}
      </p>
      {isSubjectiveQuestion(question.question_type) ? (
        <form onSubmit={(event) => void handleReviewSubmit(event)}>
          <label htmlFor={`exam_review_score_${question.display_order}`}>主观题得分</label>
          <input
            id={`exam_review_score_${question.display_order}`}
            inputMode="decimal"
            value={scoreText}
            onChange={(event) => setScoreText(event.target.value)}
          />
          <label htmlFor={`exam_review_comment_${question.display_order}`}>批阅评语</label>
          <textarea
            id={`exam_review_comment_${question.display_order}`}
            value={reviewComment}
            onChange={(event) => setReviewComment(event.target.value)}
          />
          <button type="submit" disabled={attemptReviewSaving}>
            {attemptReviewSaving ? "保存中..." : "保存批阅"}
          </button>
          {message ? <p>{message}</p> : null}
        </form>
      ) : null}
    </section>
  );
}

function AttemptReviewButton({ attemptId, onOpen }: { attemptId: number; onOpen(attemptId: number): Promise<void> }) {
  return (
    <button type="button" onClick={() => void onOpen(attemptId)}>
      查看答卷
    </button>
  );
}

function parseTargets(value: string): ExamTarget[] {
  return splitInline(value)
    .map((item) => item.split(":"))
    .map(([targetType, targetId]) => ({
      target_type: targetType?.trim() ?? "",
      target_id: Number(targetId)
    }))
    .filter((item) => item.target_type.length > 0 && Number.isFinite(item.target_id) && item.target_id > 0);
}

function parseFixedQuestions(value: string): ExamFixedQuestion[] {
  return splitLines(value)
    .map((item) => item.split(":"))
    .map(([questionId, questionVersionId, score, displayOrder]) => ({
      question_id: Number(questionId),
      question_version_id: Number(questionVersionId),
      score: Number(score),
      display_order: Number(displayOrder)
    }))
    .filter(
      (item) =>
        item.question_id > 0 &&
        item.question_version_id > 0 &&
        item.score > 0 &&
        item.display_order > 0 &&
        Number.isFinite(item.question_id) &&
        Number.isFinite(item.question_version_id) &&
        Number.isFinite(item.score) &&
        Number.isFinite(item.display_order)
    );
}

function parsePaperRules(value: string): ExamPaperRule[] {
  return splitLines(value)
    .map((item) => item.split(":"))
    .map(([questionType, scorePerQuestion, questionCount, bankIds]) => ({
      question_type: questionType?.trim() ?? "",
      score_per_question: Number(scorePerQuestion),
      question_count: Number(questionCount),
      bank_ids: parseNumberList(bankIds)
    }))
    .filter(
      (item) =>
        item.question_type.length > 0 &&
        item.score_per_question > 0 &&
        item.question_count > 0 &&
        Number.isFinite(item.score_per_question) &&
        Number.isFinite(item.question_count)
    );
}

function parseNumberList(value?: string): number[] | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const numbers = value
    .split("|")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
  return numbers.length > 0 ? numbers : undefined;
}

function splitInline(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitLines(value: string): string[] {
  return value
    .split(/[\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function toApiDateTime(value: string): string {
  return value.length === 16 ? `${value}:00+08:00` : value;
}

function formatMode(value: string): string {
  if (value === "fixed") {
    return "固定试卷";
  }
  if (value === "random_assembly") {
    return "随机组卷";
  }
  return value;
}

function formatStatus(value: string): string {
  if (value === "draft") {
    return "草稿";
  }
  if (value === "published") {
    return "已发布";
  }
  if (value === "closed") {
    return "已结束";
  }
  return value;
}

function formatTime(value?: string | null): string {
  return value ?? "-";
}

function formatTargets(targets: ExamTarget[]): string {
  if (targets.length === 0) {
    return "-";
  }
  return targets.map((item) => `${item.target_type}:${item.target_id}`).join(", ");
}

function toLocalDateTime(value: string): string {
  return value.slice(0, 16);
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function formatNullableScore(value?: number | null): string {
  if (value === null || value === undefined) {
    return "-";
  }
  return formatScore(value);
}

function formatAttemptStatus(value: string): string {
  if (value === "submitted") {
    return "已交卷";
  }
  if (value === "timeout_submitted") {
    return "超时交卷";
  }
  if (value === "in_progress") {
    return "作答中";
  }
  if (value === "not_started") {
    return "未开始";
  }
  return value;
}

function formatReviewStatus(value?: string | null): string {
  if (value === "pending") {
    return "待批阅";
  }
  if (value === "reviewed") {
    return "已批阅";
  }
  if (value === "not_started") {
    return "未开始";
  }
  if (value === "not_ready") {
    return "待交卷";
  }
  return value ?? "-";
}

function buildOverviewQuery(
  examId: number,
  filter: { attemptStatus: string; reviewStatus: string; keyword: string },
  page: number
): {
  exam_id: number;
  attempt_status?: string;
  review_status?: string;
  keyword?: string;
  page: number;
  page_size: number;
} {
  const query: {
    exam_id: number;
    attempt_status?: string;
    review_status?: string;
    keyword?: string;
    page: number;
    page_size: number;
  } = {
    exam_id: examId,
    page,
    page_size: 20
  };
  if (filter.attemptStatus) {
    query.attempt_status = filter.attemptStatus;
  }
  if (filter.reviewStatus) {
    query.review_status = filter.reviewStatus;
  }
  if (filter.keyword.trim()) {
    query.keyword = filter.keyword.trim();
  }
  return query;
}

function extractStem(content: Record<string, unknown>): string {
  const stem = content.stem;
  if (typeof stem !== "object" || stem === null) {
    return "-";
  }
  const text = (stem as { text?: unknown }).text;
  return typeof text === "string" && text.trim() !== "" ? text : "-";
}

function questionOptions(content: Record<string, unknown>, questionType: string): Array<{ key: string; text: string }> {
  const options = Array.isArray(content.options) ? content.options : [];
  if (options.length > 0) {
    return options.map((option) => {
      const typed = option as { key?: unknown; text?: unknown };
      return {
        key: typeof typed.key === "string" ? typed.key : "",
        text: typeof typed.text === "string" ? typed.text : ""
      };
    });
  }
  if (questionType === "true_false") {
    return [
      { key: "true", text: "正确" },
      { key: "false", text: "错误" }
    ];
  }
  return [];
}

function formatAnswerText(answer?: Record<string, unknown>): string {
  if (!answer) {
    return "-";
  }
  if (typeof answer.text === "string" && answer.text.trim() !== "") {
    return answer.text;
  }
  const selected = answer.selected_keys;
  if (Array.isArray(selected)) {
    return selected.join(",");
  }
  const correct = answer.correct_keys;
  if (Array.isArray(correct)) {
    return correct.join(",");
  }
  if (typeof answer.value === "boolean") {
    return answer.value ? "正确" : "错误";
  }
  if (typeof answer.correct_value === "boolean") {
    return answer.correct_value ? "正确" : "错误";
  }
  return "-";
}

function isOptionSelected(answer: Record<string, unknown> | undefined, key: string): boolean {
  const selected = answer?.selected_keys;
  return Array.isArray(selected) && selected.includes(key);
}

function isOptionCorrect(answer: Record<string, unknown> | undefined, key: string): boolean {
  const correct = answer?.correct_keys;
  return Array.isArray(correct) && correct.includes(key);
}

function formatReviewResult(question: ExamAttemptReviewResult["questions"][number]): string {
  if (!question.is_answered) {
    return "未作答";
  }
  if (isSubjectiveQuestion(question.question_type)) {
    if (question.answer_score >= question.score) {
      return "已批阅";
    }
    if (question.answer_score > 0) {
      return "部分得分";
    }
    if (question.reviewer_user_id || question.review_comment || question.reviewed_at) {
      return "已批阅";
    }
    return "待批阅";
  }
  if (question.is_correct === true) {
    return "正确";
  }
  if (question.is_correct === false) {
    return "错误";
  }
  return "已作答";
}

function isSubjectiveQuestion(questionType: string): boolean {
  return questionType === "short_answer" || questionType === "essay";
}

function isPendingReviewQuestion(question: ExamAttemptReviewResult["questions"][number]): boolean {
  if (!isSubjectiveQuestion(question.question_type)) {
    return false;
  }
  return !(question.reviewer_user_id || question.review_comment || question.reviewed_at);
}

function pendingReviewQuestions(
  questions: ExamAttemptReviewResult["questions"]
): ExamAttemptReviewResult["questions"] {
  return questions.filter(isPendingReviewQuestion);
}

function firstPendingReviewQuestionIndex(questions: ExamAttemptReviewResult["questions"]): number {
  const index = questions.findIndex(isPendingReviewQuestion);
  return index >= 0 ? index : 0;
}

function buildAttemptReviewStats(questions: ExamAttemptReviewResult["questions"]): {
  total: number;
  reviewed: number;
  pending: number;
} {
  const subjective = questions.filter((question) => isSubjectiveQuestion(question.question_type));
  const pending = subjective.filter(isPendingReviewQuestion).length;
  return {
    total: subjective.length,
    reviewed: subjective.length - pending,
    pending
  };
}
