import { useEffect, useMemo, useState } from "react";

import type {
  PageResult,
  PracticeSessionDetail,
  PracticeSessionFromQuestionsInput,
  PracticeSessionListItem,
  PracticeSessionListQuery,
  PracticeSessionResults,
  UserQuestionState,
  UserQuestionStateListQuery
} from "@aios/api-sdk";
import { ClearableFilterInput } from "@aios/ui-web";

import { QuestionContentBlockView, extractQuestionText, getOptionGroupBlock, getStemBlock } from "./question-content-render";

export interface PracticeReviewApi {
  listPracticeSessions(query?: PracticeSessionListQuery): Promise<PageResult<PracticeSessionListItem>>;
  getPracticeSessionResults(id: number): Promise<PracticeSessionResults>;
  createPracticeSessionFromQuestions(body: PracticeSessionFromQuestionsInput): Promise<PracticeSessionDetail>;
  listUserQuestionStates(query?: UserQuestionStateListQuery): Promise<PageResult<UserQuestionState>>;
}

interface PracticePageProps {
  api: PracticeReviewApi;
  onNavigate?: (path: string) => void;
  onPracticeCreated?: (session: PracticeSessionDetail) => void;
}

interface PracticeResultPageProps extends PracticePageProps {
  sessionId: number;
}

interface PracticeSessionDetailPageProps extends PracticePageProps {
  sessionId: number;
}

interface PracticeStateListPageProps extends PracticePageProps {
  stateType: "wrong" | "mastered" | "confused";
  bankId?: number;
}

export function PracticeResultPage({ api, sessionId, onNavigate, onPracticeCreated }: PracticeResultPageProps) {
  const [result, setResult] = useState<PracticeSessionResults | null>(null);

  useEffect(() => {
    let active = true;
    api.getPracticeSessionResults(sessionId).then((data) => {
      if (active) {
        setResult(data);
      }
    });
    return () => {
      active = false;
    };
  }, [api, sessionId]);

  const summary = result?.session;

  async function handleContinue() {
    if (!result || result.questions.length === 0) {
      return;
    }
    const session = await api.createPracticeSessionFromQuestions({
      question_ids: result.questions.map((item) => item.question_id),
      practice_mode: "random",
      flow_mode: "fixed_count",
      question_count: 10,
      exclude_mastered: false
    });
    onPracticeCreated?.(session);
    onNavigate?.("/app/practice");
  }

  return (
    <section aria-label="练题结果页">
      <h2>练题结果</h2>
      {summary ? (
        <>
          <p>本次共 {summary.total_count} 题，答对 {summary.correct_count} 题，答错 {summary.wrong_count} 题。</p>
          <p>正确率：{formatPercent(summary.accuracy)}</p>
          <p>课程ID：{summary.course_id ?? "-"}</p>
          <div>
            <button type="button" onClick={() => onNavigate?.(`/app/practice/history/${summary.id}`)}>
              查看本次明细
            </button>
            <button type="button" onClick={() => onNavigate?.("/app/practice/wrong")}>
              进入错题本
            </button>
            <button type="button" onClick={() => void handleContinue()}>
              继续练习
            </button>
          </div>
        </>
      ) : (
        <p>正在加载练题结果...</p>
      )}
    </section>
  );
}

export function PracticeHistoryPage({ api, onNavigate }: PracticePageProps) {
  const [sessions, setSessions] = useState<PracticeSessionListItem[]>([]);
  const [courseId, setCourseId] = useState("");

  useEffect(() => {
    let active = true;
    api.listPracticeSessions({ page: 1, page_size: 20 }).then((data) => {
      if (active) {
        setSessions(data.items);
      }
    });
    return () => {
      active = false;
    };
  }, [api]);

  async function handleFilter() {
    const query = buildCourseQuery(courseId);
    const data = await api.listPracticeSessions({ ...query, page: 1, page_size: 20 });
    setSessions(data.items);
  }

  return (
      <section aria-label="练题记录页">
      <h2>练题记录</h2>
      <ClearableFilterInput
        id="practice_history_course_id"
        label="课程筛选"
        inputMode="numeric"
        value={courseId}
        onChange={setCourseId}
      />
      <button type="button" onClick={() => void handleFilter()}>
        筛选记录
      </button>
      {sessions.length > 0 ? (
        <ul>
          {sessions.map((session) => (
            <li key={session.id}>
              <p>会话 #{session.id}</p>
              <p>
                答题 {session.answered_count}/{session.total_count}，正确 {session.correct_count}，错误 {session.wrong_count}
              </p>
              <button type="button" onClick={() => onNavigate?.(`/app/practice/history/${session.id}`)}>
                查看详情
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>暂无练题记录。</p>
      )}
    </section>
  );
}

export function PracticeSessionDetailPage({ api, sessionId, onNavigate }: PracticeSessionDetailPageProps) {
  const [result, setResult] = useState<PracticeSessionResults | null>(null);

  useEffect(() => {
    let active = true;
    api.getPracticeSessionResults(sessionId).then((data) => {
      if (active) {
        setResult(data);
      }
    });
    return () => {
      active = false;
    };
  }, [api, sessionId]);

  return (
    <section aria-label="会话详情页">
      <h2>会话 #{sessionId} 详情</h2>
      <button type="button" onClick={() => onNavigate?.("/app/practice/history")}>
        返回记录
      </button>
      {result ? (
        <>
          <p>课程ID：{result.session.course_id ?? "-"}</p>
          <p>
            本次共 {result.session.total_count} 题，答对 {result.session.correct_count} 题，答错 {result.session.wrong_count} 题。
          </p>
          <ul>
            {result.questions.map((question) => (
              <li key={question.session_question_id}>
                <p>题目 {question.display_order}</p>
                <QuestionContentBlockView block={getStemBlock(question.content)} fallback="-" />
                <QuestionContentBlockView block={getOptionGroupBlock(question.content)} compact />
                <p>你的答案：{answerText(question.answer)}</p>
                <p>正确答案：{answerText(question.correct_answer)}</p>
                <p>{question.is_correct ? "答对" : "答错"}</p>
                <p>解析：{analysisText(question.analysis)}</p>
                <p>
                  状态：{question.state.practice_wrong_count > 0 ? "错题" : "非错题"} /{" "}
                  {question.state.is_mastered ? "已标熟" : "未标熟"} /{" "}
                  {question.state.is_confused ? "已标疑惑" : "未标疑惑"}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>正在加载会话详情...</p>
      )}
    </section>
  );
}

export function PracticeStateListPage({ api, stateType, bankId, onNavigate, onPracticeCreated }: PracticeStateListPageProps) {
  const [states, setStates] = useState<UserQuestionState[]>([]);
  const [courseId, setCourseId] = useState("");

  useEffect(() => {
    let active = true;
    api.listUserQuestionStates({ state_type: stateType, bank_id: bankId }).then((data) => {
      if (active) {
        setStates(data.items);
      }
    });
    return () => {
      active = false;
    };
  }, [api, stateType, bankId]);

  const title = useMemo(() => stateTitle(stateType), [stateType]);

  async function handleFilter() {
    const query = buildCourseQuery(courseId);
    const data = await api.listUserQuestionStates({ state_type: stateType, bank_id: bankId, ...query });
    setStates(data.items);
  }

  async function handleContinue() {
    if (states.length === 0) {
      return;
    }
    const session = await api.createPracticeSessionFromQuestions({
      question_ids: states.map((item) => item.question_id),
      practice_mode: "random",
      flow_mode: "fixed_count",
      question_count: 10,
      exclude_mastered: false
    });
    onPracticeCreated?.(session);
    onNavigate?.("/app/practice");
  }

  return (
      <section aria-label={`${title}页面`}>
      <h2>{title}</h2>
      <ClearableFilterInput
        id="practice_state_course_id"
        label="课程筛选"
        inputMode="numeric"
        value={courseId}
        onChange={setCourseId}
      />
      <button type="button" onClick={() => void handleFilter()}>
        筛选题目
      </button>
      {states.length > 0 ? (
        <>
          <ul>
            {states.map((state) => (
              <li key={state.id}>
                <p>{questionStem(state.content)}</p>
                <p>
                  题目 #{state.question_id}，练习正确 {state.practice_correct_count}，练习错误 {state.practice_wrong_count}
                </p>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => void handleContinue()}>
            继续练习
          </button>
        </>
      ) : (
        <p>暂无{title}。</p>
      )}
    </section>
  );
}

function stateTitle(stateType: PracticeStateListPageProps["stateType"]): string {
  switch (stateType) {
    case "wrong":
      return "错题本";
    case "mastered":
      return "熟题本";
    case "confused":
      return "疑惑题";
  }
}

function questionStem(content: PracticeSessionResults["questions"][number]["content"] | UserQuestionState["content"] | undefined): string {
  return extractQuestionText(content);
}

function answerText(answer: Record<string, unknown> | undefined): string {
  if (!answer) {
    return "";
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
  return "";
}

function analysisText(analysis?: Record<string, unknown>): string {
  return typeof analysis?.text === "string" ? analysis.text : "";
}

function buildCourseQuery(courseId: string): { course_id?: number } {
  const parsed = Number(courseId);
  return Number.isFinite(parsed) && parsed > 0 ? { course_id: parsed } : {};
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "0%";
  }
  return `${Math.round(value * 100)}%`;
}
