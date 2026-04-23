import { useEffect, useState, type FormEvent } from "react";

import type {
  Exam,
  ExamDetail,
  ExamFixedQuestion,
  ExamInput,
  ExamOverviewResult,
  ExamPaperRule,
  ExamTarget,
  PageResult
} from "@aios/api-sdk";

export interface TeacherExamApi {
  listExams(query?: { page?: number; page_size?: number; status?: string; keyword?: string }): Promise<PageResult<Exam>>;
  createExam(body: ExamInput): Promise<ExamDetail>;
  getExam(id: number): Promise<ExamDetail>;
  updateExam(id: number, body: ExamInput): Promise<ExamDetail>;
  publishExam(id: number): Promise<ExamDetail>;
  getExamOverview(query: { exam_id: number; page?: number; page_size?: number }): Promise<ExamOverviewResult>;
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

export function TeacherExamPage({ api }: TeacherExamPageProps) {
  const [form, setForm] = useState(defaultForm);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [selectedExamDetail, setSelectedExamDetail] = useState<ExamDetail | null>(null);
  const [selectedExamOverview, setSelectedExamOverview] = useState<ExamOverviewResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewPage, setOverviewPage] = useState(1);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingExamId, setEditingExamId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [message, setMessage] = useState("正在加载考试...");

  useEffect(() => {
    void loadExams();
  }, [api]);

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
        await loadExamOverview(updated.id, 1);
        setForm(buildFormFromDetail(updated));
        await loadExams(`草稿已更新：${updated.name}`);
      } else {
        const created = await api.createExam(payload);
        setSelectedExamId(created.id);
        setSelectedExamDetail(created);
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
    setMessage("正在加载考试详情...");
    try {
      const detail = await api.getExam(id);
      setSelectedExamDetail(detail);
      await loadExamOverview(id, 1);
      setMessage("");
    } catch {
      setSelectedExamDetail(null);
      setSelectedExamOverview(null);
      setMessage("考试详情加载失败，请稍后重试。");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleEdit(id: number) {
    setDetailLoading(true);
    setSelectedExamId(id);
    setOverviewPage(1);
    setMessage("正在载入草稿...");
    try {
      const detail = await api.getExam(id);
      setSelectedExamDetail(detail);
      await loadExamOverview(id, 1);
      setForm(buildFormFromDetail(detail));
      setFormMode("edit");
      setEditingExamId(id);
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
        await loadExamOverview(id, 1);
      }
      await loadExams(`考试已发布：${published.name}`);
    } catch {
      setMessage("考试发布失败，请稍后重试。");
    } finally {
      setPublishingId(null);
    }
  }

  async function loadExamOverview(id: number, page = 1) {
    setOverviewLoading(true);
    try {
      const result = await api.getExamOverview({ exam_id: id, page, page_size: 20 });
      setSelectedExamOverview(result);
      setOverviewPage(result.students.page ?? page);
    } catch {
      setSelectedExamOverview(null);
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

  return (
    <section aria-label="考试管理页">
      <h2>考试管理</h2>

      <form onSubmit={(event) => void handleSubmit(event)}>
        <label htmlFor="teacher_exam_name">考试名称</label>
        <input
          id="teacher_exam_name"
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
        />

        <label htmlFor="teacher_exam_mode">组卷方式</label>
        <select
          id="teacher_exam_mode"
          value={form.examMode}
          onChange={(event) => setForm((current) => ({ ...current, examMode: event.target.value }))}
        >
          <option value="fixed">固定试卷</option>
          <option value="random_assembly">随机组卷</option>
        </select>

        <label htmlFor="teacher_exam_start_time">开始时间</label>
        <input
          id="teacher_exam_start_time"
          type="datetime-local"
          value={form.startTime}
          onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))}
        />

        <label htmlFor="teacher_exam_end_time">结束时间</label>
        <input
          id="teacher_exam_end_time"
          type="datetime-local"
          value={form.endTime}
          onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))}
        />

        <label htmlFor="teacher_exam_duration">考试时长</label>
        <input
          id="teacher_exam_duration"
          inputMode="numeric"
          value={form.durationMinutes}
          onChange={(event) => setForm((current) => ({ ...current, durationMinutes: event.target.value }))}
        />

        <label htmlFor="teacher_exam_targets">发布范围</label>
        <textarea
          id="teacher_exam_targets"
          value={form.targetsText}
          onChange={(event) => setForm((current) => ({ ...current, targetsText: event.target.value }))}
        />

        {form.examMode === "fixed" ? (
          <>
            <label htmlFor="teacher_exam_fixed_questions">固定题目</label>
            <textarea
              id="teacher_exam_fixed_questions"
              value={form.fixedQuestionsText}
              onChange={(event) => setForm((current) => ({ ...current, fixedQuestionsText: event.target.value }))}
            />
          </>
        ) : (
          <>
            <label htmlFor="teacher_exam_paper_rules">抽题规则</label>
            <textarea
              id="teacher_exam_paper_rules"
              value={form.paperRulesText}
              onChange={(event) => setForm((current) => ({ ...current, paperRulesText: event.target.value }))}
            />
          </>
        )}

        <button type="submit" disabled={saving}>
          {saving ? "保存中..." : formMode === "edit" ? "更新草稿" : "保存草稿"}
        </button>
      </form>

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

      <section aria-label="考试详情区">
        <h3>考试详情</h3>
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
                    {selectedExamOverview.students.items.length > 0 ? (
                      <>
                        <ul>
                          {selectedExamOverview.students.items.map((student) => (
                            <li key={student.student_user_id}>
                              <p>{student.student_name}</p>
                              <p>学号：{student.student_no ?? "-"}</p>
                              <p>班级：{student.class_name ?? "-"}</p>
                              <p>状态：{formatAttemptStatus(student.attempt_status)}</p>
                              <p>得分：{formatNullableScore(student.final_score)}</p>
                              <p>客观题：{formatNullableScore(student.objective_score)}</p>
                              <p>交卷时间：{formatTime(student.submit_at)}</p>
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
          </>
        ) : (
          !detailLoading ? <p>请选择一场考试查看详情。</p> : null
        )}
      </section>
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
