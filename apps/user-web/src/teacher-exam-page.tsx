import { useEffect, useState, type FormEvent } from "react";

import type {
  Exam,
  ExamDetail,
  ExamFixedQuestion,
  ExamInput,
  ExamPaperRule,
  ExamTarget,
  PageResult
} from "@aios/api-sdk";

export interface TeacherExamApi {
  listExams(query?: { page?: number; page_size?: number; status?: string; keyword?: string }): Promise<PageResult<Exam>>;
  createExam(body: ExamInput): Promise<ExamDetail>;
  publishExam(id: number): Promise<ExamDetail>;
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

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = buildExamPayload(form);
    if (typeof payload === "string") {
      setMessage(payload);
      return;
    }

    setSaving(true);
    setMessage("正在保存考试草稿...");
    try {
      const created = await api.createExam(payload);
      setForm(defaultForm);
      await loadExams(`草稿已保存：${created.name}`);
    } catch {
      setMessage("考试草稿保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish(id: number) {
    setPublishingId(id);
    setMessage("正在发布考试...");
    try {
      const published = await api.publishExam(id);
      await loadExams(`考试已发布：${published.name}`);
    } catch {
      setMessage("考试发布失败，请稍后重试。");
    } finally {
      setPublishingId(null);
    }
  }

  return (
    <section aria-label="考试管理页">
      <h2>考试管理</h2>

      <form onSubmit={(event) => void handleCreate(event)}>
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
          {saving ? "保存中..." : "保存草稿"}
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
    </section>
  );
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
