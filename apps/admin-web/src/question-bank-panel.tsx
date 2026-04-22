import { useEffect, useState, type FormEvent } from "react";

import type {
  PageResult,
  QuestionBank,
  QuestionBankInput,
  QuestionBankVisibilityInput
} from "@aios/api-sdk";

export interface QuestionBankPanelApi {
  listQuestionBanks(): Promise<PageResult<QuestionBank>>;
  createQuestionBank(body: QuestionBankInput): Promise<QuestionBank>;
  publishQuestionBank(id: number): Promise<QuestionBank>;
  assignQuestionBankVisibility(id: number, body: QuestionBankVisibilityInput): Promise<boolean>;
}

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

export function QuestionBankPanel({ api }: { api: QuestionBankPanelApi }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [items, setItems] = useState<QuestionBank[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [visibilityForm, setVisibilityForm] = useState(defaultVisibilityForm);

  async function loadAll() {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await api.listQuestionBanks();
      setItems(result.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载题库失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [api]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.createQuestionBank({
      name: form.name,
      course_id: form.course_id ? Number(form.course_id) : undefined,
      description: form.description || undefined
    });
    setForm(defaultForm);
    await loadAll();
  }

  async function handlePublish(id: number) {
    await api.publishQuestionBank(id);
    await loadAll();
  }

  async function handleAssignVisibility(id: number) {
    const targetID = Number(visibilityForm.target_id);
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
    await loadAll();
  }

  return (
    <section aria-label="题库管理面板">
      <h2>题库管理</h2>
      {errorMessage ? <p>{errorMessage}</p> : null}
      {loading ? <p>加载中...</p> : null}

      <form onSubmit={(event) => void handleSubmit(event)}>
        <label htmlFor="question_bank_name">题库名称</label>
        <input
          id="question_bank_name"
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
        />
        <label htmlFor="question_bank_course_id">课程ID</label>
        <input
          id="question_bank_course_id"
          inputMode="numeric"
          value={form.course_id}
          onChange={(event) => setForm((current) => ({ ...current, course_id: event.target.value }))}
        />
        <label htmlFor="question_bank_description">题库说明</label>
        <input
          id="question_bank_description"
          value={form.description}
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
        />
        <button type="submit">新增题库</button>
      </form>

      <section aria-label="题库下发表单">
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
        <label htmlFor="visibility_target_id">下发目标ID</label>
        <input
          id="visibility_target_id"
          inputMode="numeric"
          value={visibilityForm.target_id}
          onChange={(event) => setVisibilityForm((current) => ({ ...current, target_id: event.target.value }))}
        />
        <label htmlFor="visibility_permission_type">下发用途</label>
        <select
          id="visibility_permission_type"
          value={visibilityForm.permission_type}
          onChange={(event) =>
            setVisibilityForm((current) => ({ ...current, permission_type: event.target.value }))
          }
        >
          <option value="view">查看</option>
          <option value="practice">练题</option>
          <option value="exam">考试</option>
        </select>
      </section>

      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <span>{item.name}</span>
            <span>{item.status}</span>
            <span>{item.course_id ?? "-"}</span>
            <button type="button" onClick={() => void handlePublish(item.id)}>
              发布题库
            </button>
            <button type="button" onClick={() => void handleAssignVisibility(item.id)}>
              下发题库
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
