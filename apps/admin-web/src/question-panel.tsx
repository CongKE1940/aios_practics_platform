import { useEffect, useState, type FormEvent } from "react";

import type {
  PageResult,
  Question,
  QuestionContentInput,
  QuestionInput,
  QuestionUpdateInput,
  QuestionVersion,
  QuestionVersionInput
} from "@aios/api-sdk";

export interface QuestionPanelApi {
  listQuestions(): Promise<PageResult<Question>>;
  createQuestion(body: QuestionInput): Promise<Question>;
  updateQuestion(id: number, body: QuestionUpdateInput): Promise<Question>;
  listQuestionVersions(id: number): Promise<QuestionVersion[]>;
  createQuestionVersion(id: number, body: QuestionVersionInput): Promise<QuestionVersion>;
}

const defaultQuestionForm = {
  question_type: "single_choice",
  difficulty: "medium",
  bank_id: "",
  stem: "",
  option_a: "",
  option_b: "",
  correct_key: "B"
};

const defaultVersionForm = {
  stem: "",
  correct_key: "B",
  change_summary: ""
};

export function QuestionPanel({ api }: { api: QuestionPanelApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [items, setItems] = useState<Question[]>([]);
  const [versions, setVersions] = useState<QuestionVersion[]>([]);
  const [selectedQuestionID, setSelectedQuestionID] = useState<number | null>(null);
  const [questionForm, setQuestionForm] = useState(defaultQuestionForm);
  const [versionForm, setVersionForm] = useState(defaultVersionForm);

  async function loadAll() {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await api.listQuestions();
      setItems(result.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载题目失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [api]);

  async function handleCreateQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.createQuestion({
      question_type: questionForm.question_type,
      difficulty: questionForm.difficulty,
      content: buildChoiceContent(questionForm.stem, questionForm.option_a, questionForm.option_b),
      answer: {
        judge_mode: "by_option_key",
        correct_keys: [questionForm.correct_key]
      },
      analysis: {},
      bank_ids: questionForm.bank_id ? [Number(questionForm.bank_id)] : []
    });
    setQuestionForm(defaultQuestionForm);
    await loadAll();
  }

  async function handleDisableQuestion(question: Question) {
    await api.updateQuestion(question.id, {
      difficulty: question.difficulty ?? undefined,
      status: "disabled"
    });
    await loadAll();
  }

  async function handleLoadVersions(id: number) {
    setSelectedQuestionID(id);
    const result = await api.listQuestionVersions(id);
    setVersions(result);
  }

  async function handleCreateVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedQuestionID) {
      return;
    }
    await api.createQuestionVersion(selectedQuestionID, {
      content: buildChoiceContent(versionForm.stem, "1", "2"),
      answer: {
        judge_mode: "by_option_key",
        correct_keys: [versionForm.correct_key]
      },
      analysis: {},
      change_summary: versionForm.change_summary || undefined
    });
    setVersionForm(defaultVersionForm);
    setVersions(await api.listQuestionVersions(selectedQuestionID));
  }

  return (
    <section aria-label="题目管理面板">
      <h2>题目管理</h2>
      {errorMessage ? <p>{errorMessage}</p> : null}
      {loading ? <p>加载中...</p> : null}

      <form onSubmit={(event) => void handleCreateQuestion(event)}>
        <label htmlFor="question_type">题型</label>
        <select
          id="question_type"
          value={questionForm.question_type}
          onChange={(event) => setQuestionForm((current) => ({ ...current, question_type: event.target.value }))}
        >
          <option value="single_choice">single_choice</option>
          <option value="multiple_choice">multiple_choice</option>
          <option value="true_false">true_false</option>
        </select>
        <label htmlFor="question_difficulty">难度</label>
        <select
          id="question_difficulty"
          value={questionForm.difficulty}
          onChange={(event) => setQuestionForm((current) => ({ ...current, difficulty: event.target.value }))}
        >
          <option value="easy">easy</option>
          <option value="medium">medium</option>
          <option value="hard">hard</option>
        </select>
        <label htmlFor="question_bank_id">题库ID</label>
        <input
          id="question_bank_id"
          inputMode="numeric"
          value={questionForm.bank_id}
          onChange={(event) => setQuestionForm((current) => ({ ...current, bank_id: event.target.value }))}
        />
        <label htmlFor="question_stem">题干</label>
        <input
          id="question_stem"
          value={questionForm.stem}
          onChange={(event) => setQuestionForm((current) => ({ ...current, stem: event.target.value }))}
        />
        <label htmlFor="question_option_a">选项A</label>
        <input
          id="question_option_a"
          value={questionForm.option_a}
          onChange={(event) => setQuestionForm((current) => ({ ...current, option_a: event.target.value }))}
        />
        <label htmlFor="question_option_b">选项B</label>
        <input
          id="question_option_b"
          value={questionForm.option_b}
          onChange={(event) => setQuestionForm((current) => ({ ...current, option_b: event.target.value }))}
        />
        <label htmlFor="question_correct_key">正确答案</label>
        <input
          id="question_correct_key"
          value={questionForm.correct_key}
          onChange={(event) => setQuestionForm((current) => ({ ...current, correct_key: event.target.value }))}
        />
        <button type="submit">新增题目</button>
      </form>

      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <span>{item.question_type}</span>
            <span>{item.difficulty}</span>
            <span>{item.status}</span>
            <span>{item.current_version_no ?? "-"}</span>
            <button type="button" onClick={() => void handleLoadVersions(item.id)}>
              查看版本
            </button>
            <button type="button" onClick={() => void handleDisableQuestion(item)}>
              停用题目
            </button>
          </li>
        ))}
      </ul>

      <section aria-label="题目版本">
        <h3>版本</h3>
        <ul>
          {versions.map((version) => (
            <li key={version.id}>
              <span>版本 {version.version_no}</span>
              <span>{version.change_summary}</span>
            </li>
          ))}
        </ul>
        <form onSubmit={(event) => void handleCreateVersion(event)}>
          <label htmlFor="question_version_stem">版本题干</label>
          <input
            id="question_version_stem"
            value={versionForm.stem}
            onChange={(event) => setVersionForm((current) => ({ ...current, stem: event.target.value }))}
          />
          <label htmlFor="question_version_correct_key">版本正确答案</label>
          <input
            id="question_version_correct_key"
            value={versionForm.correct_key}
            onChange={(event) => setVersionForm((current) => ({ ...current, correct_key: event.target.value }))}
          />
          <label htmlFor="question_version_change_summary">变更摘要</label>
          <input
            id="question_version_change_summary"
            value={versionForm.change_summary}
            onChange={(event) =>
              setVersionForm((current) => ({ ...current, change_summary: event.target.value }))
            }
          />
          <button type="submit">新增版本</button>
        </form>
      </section>
    </section>
  );
}

function buildChoiceContent(stem: string, optionA: string, optionB: string): QuestionContentInput {
  return {
    stem: {
      content_type: "text",
      text: stem,
      assets: []
    },
    options: [
      { key: "A", content_type: "text", text: optionA, assets: [] },
      { key: "B", content_type: "text", text: optionB, assets: [] }
    ],
    option_order_randomizable: true,
    ext: {}
  };
}
