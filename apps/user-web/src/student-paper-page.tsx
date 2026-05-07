import { useEffect, useMemo, useState } from "react";

import type {
  Exam,
  ExamAttemptAnswer,
  ExamAttemptAnswerInput,
  ExamAttemptDetail,
  ExamAttemptQuestion,
  ExamAttemptResult,
  ExamDetail,
  ExamFixedQuestion,
  ExamInput,
  ExamPaper,
  ExamPaperDetail,
  ExamPaperListQuery,
  ExamPaperPracticeRecord,
  PageResult,
  PracticeSessionDetail,
  PracticeSessionFromQuestionsInput
} from "@aios/api-sdk";
import { ToastNotice } from "@aios/ui-web";

import {
  QuestionContentBlockView,
  QuestionOptionBody,
  extractQuestionOptions,
  extractQuestionText,
  getOptionGroupBlock,
  getStemBlock,
  type RenderableOption
} from "./question-content-render";

export interface StudentPaperApi {
  listExamPapers(query?: ExamPaperListQuery): Promise<PageResult<ExamPaper>>;
  getExamPaper(id: number): Promise<ExamPaperDetail>;
  listExamPaperPracticeRecords(id: number, query?: { page?: number; page_size?: number }): Promise<PageResult<ExamPaperPracticeRecord>>;
  createExam(body: ExamInput): Promise<ExamDetail>;
  publishExam(examId: number): Promise<ExamDetail>;
  startExamAttempt(examId: number): Promise<ExamAttemptDetail>;
  saveExamAttemptAnswer(attemptId: number, body: ExamAttemptAnswerInput): Promise<ExamAttemptAnswer>;
  submitExamAttempt(attemptId: number): Promise<ExamAttemptResult>;
  getExamAttemptResult(attemptId: number): Promise<ExamAttemptResult>;
  createPracticeSessionFromQuestions(body: PracticeSessionFromQuestionsInput): Promise<PracticeSessionDetail>;
}

interface StudentPaperPageProps {
  api: StudentPaperApi;
  onPracticeCreated(session: PracticeSessionDetail): void;
  onNavigate(path: string): void;
}

const defaultPageSize = 10;

export function StudentPaperPage({ api, onPracticeCreated, onNavigate }: StudentPaperPageProps) {
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<ExamPaperDetail | null>(null);
  const [records, setRecords] = useState<ExamPaperPracticeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [startingPaperID, setStartingPaperID] = useState<number | null>(null);
  const [practicingPaperID, setPracticingPaperID] = useState<number | null>(null);
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [attemptDetail, setAttemptDetail] = useState<ExamAttemptDetail | null>(null);
  const [attemptResult, setAttemptResult] = useState<ExamAttemptResult | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [draftAnswers, setDraftAnswers] = useState<Record<number, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentQuestion = attemptDetail?.questions[currentIndex] ?? null;
  const answeredDisplayOrders = useMemo(
    () => buildAnsweredDisplayOrders(attemptDetail?.answers ?? [], draftAnswers),
    [attemptDetail, draftAnswers]
  );

  useEffect(() => {
    void loadPapers({ status: "published", page: 1, page_size: defaultPageSize });
  }, [api]);

  async function loadPapers(query: ExamPaperListQuery) {
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await api.listExamPapers(query);
      setPapers(data.items ?? []);
      setTotal(data.total);
      setPage(data.page || query.page || 1);
      setPageSize(data.page_size || query.page_size || defaultPageSize);
    } catch (error) {
      setPapers([]);
      setTotal(0);
      setErrorMessage(error instanceof Error ? error.message : "公开试卷加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    await loadPapers({ status: "published", keyword: keyword.trim() || undefined, page: 1, page_size: pageSize });
  }

  async function handleReset() {
    setKeyword("");
    await loadPapers({ status: "published", page: 1, page_size: defaultPageSize });
  }

  async function handlePageChange(nextPage: number) {
    await loadPapers({ status: "published", keyword: keyword.trim() || undefined, page: nextPage, page_size: pageSize });
  }

  async function openPaper(paper: ExamPaper) {
    setDetailLoading(true);
    setErrorMessage("");
    try {
      const detail = await api.getExamPaper(paper.id);
      setSelectedPaper(detail);
      await loadRecords(detail.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "试卷详情加载失败");
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadRecords(paperID: number) {
    setRecordsLoading(true);
    try {
      const data = await api.listExamPaperPracticeRecords(paperID, { page: 1, page_size: 20 });
      setRecords(data.items ?? []);
    } catch (error) {
      setRecords([]);
      setErrorMessage(error instanceof Error ? error.message : "练习记录加载失败");
    } finally {
      setRecordsLoading(false);
    }
  }

  async function handleStartPractice(paper: ExamPaperDetail) {
    const questionIDs = paper.questions.map((question) => question.question_id).filter((id) => id > 0);
    if (questionIDs.length === 0) {
      setErrorMessage("当前试卷暂无可练习题目。");
      return;
    }
    setPracticingPaperID(paper.id);
    setErrorMessage("");
    try {
      const session = await api.createPracticeSessionFromQuestions({
        question_ids: questionIDs,
        practice_mode: "sequential",
        flow_mode: "fixed_count",
        question_count: questionIDs.length,
        exclude_mastered: false
      });
      onPracticeCreated(session);
      onNavigate("/app/practice");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "试卷练习创建失败");
    } finally {
      setPracticingPaperID(null);
    }
  }

  async function handleStartTest(paper: ExamPaperDetail) {
    setStartingPaperID(paper.id);
    setErrorMessage("");
    setNoticeMessage("");
    try {
      const now = new Date();
      const endTime = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const created = await api.createExam({
        name: `${paper.paper_name} 自测 ${formatCompactDate(now)}`,
        exam_mode: "paper",
        paper_id: paper.id,
        start_time: now.toISOString(),
        end_time: endTime.toISOString(),
        duration_minutes: 60,
        targets: [],
        fixed_questions: [],
        paper_rules: []
      });
      const published = await api.publishExam(created.id);
      const detail = await api.startExamAttempt(published.id);
      setActiveExam(published);
      setAttemptDetail(detail);
      setAttemptResult(null);
      setCurrentIndex(0);
      setDraftAnswers(buildDraftAnswers(detail.answers));
      setSelectedKeys(selectedKeysFor(detail.answers, detail.questions[0]?.display_order));
      await loadRecords(paper.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "试卷测试创建失败");
    } finally {
      setStartingPaperID(null);
    }
  }

  async function handleContinueRecord(record: ExamPaperPracticeRecord) {
    setErrorMessage("");
    try {
      const detail = await api.startExamAttempt(record.exam_id);
      setActiveExam(recordToExam(record));
      setAttemptDetail(detail);
      setAttemptResult(null);
      setCurrentIndex(0);
      setDraftAnswers(buildDraftAnswers(detail.answers));
      setSelectedKeys(selectedKeysFor(detail.answers, detail.questions[0]?.display_order));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "测试记录打开失败");
    }
  }

  async function handleShowRecordResult(record: ExamPaperPracticeRecord) {
    setErrorMessage("");
    try {
      const result = await api.getExamAttemptResult(record.attempt_id);
      setAttemptResult(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "成绩加载失败");
    }
  }

  async function handleSaveAnswer(): Promise<boolean> {
    if (!attemptDetail || !currentQuestion) {
      return false;
    }
    if (selectedKeys.length === 0) {
      setErrorMessage("请先选择答案。");
      return false;
    }
    setErrorMessage("");
    try {
      await api.saveExamAttemptAnswer(attemptDetail.attempt.id, {
        display_order: currentQuestion.display_order,
        answer: { selected_keys: selectedKeys }
      });
      setAttemptDetail((current) => mergeSavedAnswer(current, currentQuestion, selectedKeys));
      setDraftAnswers((current) => ({ ...current, [currentQuestion.display_order]: selectedKeys }));
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "答案保存失败");
      return false;
    }
  }

  async function handleSubmitAttempt() {
    if (!attemptDetail || submitting) {
      return;
    }
    const unanswered = attemptDetail.questions.filter((question) => !answeredDisplayOrders.has(question.display_order));
    const message =
      unanswered.length > 0
        ? `还有以下题目未作答：${unanswered.map((question) => `第 ${question.display_order} 题`).join("、")}。确认交卷吗？`
        : "确认交卷吗？";
    if (!window.confirm(message)) {
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    try {
      await savePendingDraftAnswers(attemptDetail);
      const result = await api.submitExamAttempt(attemptDetail.attempt.id);
      setAttemptResult(result);
      setAttemptDetail(null);
      setActiveExam(null);
      setDraftAnswers({});
      setSelectedKeys([]);
      setNoticeMessage("本次测试已交卷，成绩已写入试卷记录。");
      if (selectedPaper) {
        await loadRecords(selectedPaper.id);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "交卷失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function savePendingDraftAnswers(detail: ExamAttemptDetail) {
    let nextDetail = detail;
    for (const question of detail.questions) {
      const selected = draftAnswers[question.display_order] ?? selectedKeysFor(nextDetail.answers, question.display_order);
      const saved = selectedKeysFor(nextDetail.answers, question.display_order);
      if (sameStringArray(selected, saved) || selected.length === 0) {
        continue;
      }
      await api.saveExamAttemptAnswer(detail.attempt.id, {
        display_order: question.display_order,
        answer: { selected_keys: selected }
      });
      nextDetail = mergeSavedAnswer(nextDetail, question, selected) ?? nextDetail;
    }
    setAttemptDetail(nextDetail);
  }

  function moveQuestion(nextIndex: number) {
    if (!attemptDetail) {
      return;
    }
    const bounded = Math.max(0, Math.min(nextIndex, attemptDetail.questions.length - 1));
    const displayOrder = attemptDetail.questions[bounded]?.display_order;
    setCurrentIndex(bounded);
    setSelectedKeys(displayOrder ? draftAnswers[displayOrder] ?? selectedKeysFor(attemptDetail.answers, displayOrder) : []);
    setErrorMessage("");
  }

  function toggleKey(question: ExamAttemptQuestion, key: string) {
    setSelectedKeys((current) => {
      const next = toggleOptionSelection(current, key, question.question_type ?? "");
      setDraftAnswers((answers) => ({ ...answers, [question.display_order]: next }));
      return next;
    });
  }

  return (
    <section aria-label="试卷中心" className="ui-admin-page ui-user-page">
      <div className="ui-admin-page__header">
        <div>
          <span className="ui-admin-page__eyebrow">试卷中心</span>
          <h2>公开试卷</h2>
          <p className="ui-admin-page__description">查看已发布试卷，按试卷进入练习或创建个人测试。</p>
        </div>
      </div>
      {errorMessage ? <ToastNotice tone="danger" title="试卷操作失败" description={errorMessage} onClose={() => setErrorMessage("")} /> : null}
      {noticeMessage ? <ToastNotice tone="success" title="操作完成" description={noticeMessage} onClose={() => setNoticeMessage("")} /> : null}

      <section className="ui-admin-card" aria-label="公开试卷查询">
        <form className="ui-admin-filters" onSubmit={(event) => { event.preventDefault(); void handleSearch(); }}>
          <div className="ui-admin-form__field">
            <label htmlFor="student_paper_keyword">关键字</label>
            <input
              id="student_paper_keyword"
              placeholder="输入试卷名称"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </div>
          <div className="ui-admin-actions-bar__group">
            <button type="submit" className="ui-button ui-button--primary" disabled={loading}>
              {loading ? "查询中" : "查询"}
            </button>
            <button type="button" className="ui-button ui-button--ghost" disabled={loading} onClick={() => void handleReset()}>
              重置
            </button>
          </div>
        </form>
      </section>

      <section className="ui-admin-card" aria-label="公开试卷列表" aria-busy={loading}>
        <div className="ui-admin-card__header">
          <div>
            <h3>公开试卷列表</h3>
            <p className="ui-admin-subtle">共 {total} 份公开试卷</p>
          </div>
        </div>
        <div className="ui-admin-table-wrapper">
          <table className="ui-admin-table">
            <thead>
              <tr>
                <th>试卷名称</th>
                <th>类型</th>
                <th>题量</th>
                <th>总分</th>
                <th>发布时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {papers.map((paper) => (
                <tr key={paper.id}>
                  <td>{paper.paper_name}</td>
                  <td>{formatPaperType(paper.paper_type)}</td>
                  <td>{paper.question_count}</td>
                  <td>{formatScore(paper.total_score)}</td>
                  <td>{formatDateTime(paper.updated_at || paper.created_at)}</td>
                  <td>
                    <button type="button" className="ui-button ui-button--ghost" onClick={() => void openPaper(paper)}>
                      查看试卷
                    </button>
                  </td>
                </tr>
              ))}
              {papers.length === 0 ? (
                <tr>
                  <td colSpan={6}>{loading ? "数据加载中..." : "暂无公开试卷"}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="ui-admin-pagination">
          <button type="button" className="ui-button ui-button--ghost" disabled={page <= 1 || loading} onClick={() => void handlePageChange(page - 1)}>
            上一页
          </button>
          <span>
            第 {page} / {pageCount} 页
          </span>
          <button
            type="button"
            className="ui-button ui-button--ghost"
            disabled={page >= pageCount || loading}
            onClick={() => void handlePageChange(page + 1)}
          >
            下一页
          </button>
        </div>
      </section>

      {selectedPaper ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal ui-admin-modal--wide" aria-label="试卷详情弹层">
            <div className="ui-admin-modal__header">
              <div>
                <h3>{selectedPaper.paper_name}</h3>
                <p>
                  {formatPaperType(selectedPaper.paper_type)} · {selectedPaper.question_count} 题 · {formatScore(selectedPaper.total_score)} 分
                </p>
              </div>
              <button type="button" className="ui-button ui-button--ghost" onClick={() => setSelectedPaper(null)}>
                关闭
              </button>
            </div>
            <div className="ui-admin-modal__body">
              {detailLoading ? <div className="ui-admin-empty-inline">试卷加载中...</div> : null}
              <section aria-label="试卷题目预览">
                <h4>题目预览</h4>
                <div className="ui-admin-tree">
                  {selectedPaper.questions.map((question) => (
                    <div key={`${question.question_id}-${question.display_order}`} className="ui-admin-tree__leaf">
                      <strong>第 {question.display_order} 题</strong>
                      <span>
                        {formatQuestionType(question.question_type ?? "")} · {formatScore(question.score)} 分 · {questionText(question) || "暂无题干文本"}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
              <section aria-label="试卷练习记录">
                <h4>练习记录与成绩</h4>
                {recordsLoading ? <div className="ui-admin-empty-inline">记录加载中...</div> : null}
                <div className="ui-admin-table-wrapper">
                  <table className="ui-admin-table">
                    <thead>
                      <tr>
                        <th>测试名称</th>
                        <th>状态</th>
                        <th>开始时间</th>
                        <th>交卷时间</th>
                        <th>成绩</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((record) => (
                        <tr key={record.attempt_id}>
                          <td>{record.exam_name}</td>
                          <td>{formatAttemptStatus(record.status)}</td>
                          <td>{formatDateTime(record.start_at)}</td>
                          <td>{formatDateTime(record.submit_at)}</td>
                          <td>{record.status === "in_progress" ? "未交卷" : `${formatScore(record.final_score)} / ${formatScore(record.total_score)}`}</td>
                          <td>
                            {record.status === "in_progress" ? (
                              <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleContinueRecord(record)}>
                                继续测试
                              </button>
                            ) : (
                              <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleShowRecordResult(record)}>
                                查看成绩
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {records.length === 0 ? (
                        <tr>
                          <td colSpan={6}>暂无练习记录</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
            <div className="ui-admin-modal__footer">
              <button
                type="button"
                className="ui-button ui-button--ghost"
                disabled={practicingPaperID === selectedPaper.id}
                onClick={() => void handleStartPractice(selectedPaper)}
              >
                {practicingPaperID === selectedPaper.id ? "创建练习中..." : "按试卷练习"}
              </button>
              <button
                type="button"
                className="ui-button ui-button--primary"
                disabled={startingPaperID === selectedPaper.id}
                onClick={() => void handleStartTest(selectedPaper)}
              >
                {startingPaperID === selectedPaper.id ? "进入测试中..." : "开始试卷测试"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {currentQuestion && attemptDetail && activeExam ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal ui-admin-modal--wide" aria-label="试卷测试作答区">
            <div className="ui-admin-modal__header">
              <div>
                <h3>{activeExam.name}</h3>
                <p>
                  第 {currentIndex + 1} / {attemptDetail.questions.length} 题，已保存 {answeredDisplayOrders.size} 题
                </p>
              </div>
              <button type="button" className="ui-button ui-button--ghost" onClick={() => setAttemptDetail(null)}>
                稍后继续
              </button>
            </div>
            <div className="ui-admin-modal__body">
              <nav aria-label="试卷测试题号导航" className="ui-admin-actions-bar__group">
                {attemptDetail.questions.map((question, index) => (
                  <button
                    key={question.display_order}
                    type="button"
                    className={index === currentIndex ? "ui-button ui-button--primary" : "ui-button ui-button--ghost"}
                    onClick={() => moveQuestion(index)}
                  >
                    {question.display_order}
                  </button>
                ))}
              </nav>
              <section className="ui-admin-card" aria-label="当前试题">
                <div className="ui-admin-card__header">
                  <div>
                    <h3>{`${formatQuestionType(currentQuestion.question_type ?? "")} · ${formatScore(currentQuestion.score)} 分`}</h3>
                    <QuestionContentBlockView block={getStemBlock(currentQuestion.content)} fallback="本题暂无题干文本。" />
                    <QuestionContentBlockView block={getOptionGroupBlock(currentQuestion.content)} />
                  </div>
                </div>
                <div className="ui-admin-tree">
                  {questionOptions(currentQuestion).map((option) => (
                    <label key={option.key} className="ui-admin-tree__leaf" aria-label={`选项 ${option.key}`}>
                      <input
                        type="checkbox"
                        className="ui-admin-table__checkbox"
                        checked={selectedKeys.includes(option.key)}
                        onChange={() => toggleKey(currentQuestion, option.key)}
                      />
                      <strong>{option.key}</strong>
                      <QuestionOptionBody option={option} />
                    </label>
                  ))}
                </div>
              </section>
            </div>
            <div className="ui-admin-modal__footer">
              <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleSaveAnswer()}>
                保存答案
              </button>
              <button type="button" className="ui-button ui-button--ghost" disabled={currentIndex === 0} onClick={() => moveQuestion(currentIndex - 1)}>
                上一题
              </button>
              <button
                type="button"
                className="ui-button ui-button--ghost"
                disabled={currentIndex >= attemptDetail.questions.length - 1}
                onClick={() => moveQuestion(currentIndex + 1)}
              >
                下一题
              </button>
              <button type="button" className="ui-button ui-button--primary" disabled={submitting} onClick={() => void handleSubmitAttempt()}>
                {submitting ? "交卷中..." : "交卷"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {attemptResult ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="试卷测试成绩弹层">
            <div className="ui-admin-modal__header">
              <div>
                <h3>测试成绩</h3>
                <p>{formatAttemptStatus(attemptResult.attempt.status)}</p>
              </div>
              <button type="button" className="ui-button ui-button--ghost" onClick={() => setAttemptResult(null)}>
                关闭
              </button>
            </div>
            <div className="ui-admin-modal__body">
              <dl className="ui-admin-meta-list">
                <div>
                  <dt>最终得分</dt>
                  <dd>{formatScore(attemptResult.final_score)}</dd>
                </div>
                <div>
                  <dt>客观题得分</dt>
                  <dd>{formatScore(attemptResult.objective_score)}</dd>
                </div>
                <div>
                  <dt>答题数</dt>
                  <dd>{attemptResult.answers.length}</dd>
                </div>
              </dl>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function selectedKeysFor(answers: ExamAttemptAnswer[], displayOrder?: number): string[] {
  const answer = answers.find((item) => item.display_order === displayOrder)?.answer;
  const selected = answer?.selected_keys;
  return Array.isArray(selected) ? selected.filter((item): item is string => typeof item === "string") : [];
}

function buildDraftAnswers(answers: ExamAttemptAnswer[]): Record<number, string[]> {
  return answers.reduce<Record<number, string[]>>((result, answer) => {
    result[answer.display_order] = selectedKeysFor(answers, answer.display_order);
    return result;
  }, {});
}

function buildAnsweredDisplayOrders(answers: ExamAttemptAnswer[], draftAnswers: Record<number, string[]>): Set<number> {
  const result = new Set<number>();
  answers.forEach((answer) => {
    if (selectedKeysFor(answers, answer.display_order).length > 0) {
      result.add(answer.display_order);
    }
  });
  Object.entries(draftAnswers).forEach(([displayOrder, selected]) => {
    if (selected.length > 0) {
      result.add(Number(displayOrder));
    }
  });
  return result;
}

function mergeSavedAnswer(
  detail: ExamAttemptDetail | null,
  question: ExamAttemptQuestion,
  selectedKeys: string[]
): ExamAttemptDetail | null {
  if (!detail) {
    return detail;
  }
  const nextAnswer: ExamAttemptAnswer = {
    attempt_id: detail.attempt.id,
    question_id: question.question_id,
    question_version_id: question.question_version_id,
    display_order: question.display_order,
    answer: { selected_keys: selectedKeys },
    score: 0
  };
  return {
    ...detail,
    answers: [...detail.answers.filter((item) => item.display_order !== question.display_order), nextAnswer]
  };
}

function toggleOptionSelection(current: string[], key: string, questionType: string): string[] {
  if (current.includes(key)) {
    return current.filter((item) => item !== key);
  }
  if (questionType === "single_choice" || questionType === "true_false") {
    return [key];
  }
  return [...current, key];
}

function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return [...left].sort().join("\u0000") === [...right].sort().join("\u0000");
}

function questionText(question: ExamAttemptQuestion | ExamFixedQuestion): string {
  return extractQuestionText(question.content);
}

function questionOptions(question: ExamAttemptQuestion): RenderableOption[] {
  return extractQuestionOptions(question.content, question.question_type).filter((option) => option.key !== "");
}

function recordToExam(record: ExamPaperPracticeRecord): Exam {
  return {
    id: record.exam_id,
    name: record.exam_name,
    exam_mode: "paper",
    status: "published",
    start_time: record.start_at ?? record.created_at ?? "",
    end_time: record.submit_at ?? record.updated_at ?? record.created_at ?? "",
    duration_minutes: record.duration_minutes,
    total_score: record.total_score,
    paper_id: record.paper_id
  };
}

function formatPaperType(value: string): string {
  switch (value) {
    case "fixed":
      return "固定试卷";
    case "random_rule":
      return "随机试卷";
    default:
      return value || "-";
  }
}

function formatQuestionType(value: string): string {
  switch (value) {
    case "single_choice":
      return "单选题";
    case "multiple_choice":
      return "多选题";
    case "true_false":
      return "判断题";
    case "short_answer":
      return "简答题";
    case "essay":
      return "论述题";
    default:
      return value || "题目";
  }
}

function formatAttemptStatus(value: string): string {
  switch (value) {
    case "in_progress":
      return "进行中";
    case "submitted":
      return "已交卷";
    case "timeout_submitted":
      return "超时交卷";
    default:
      return value || "-";
  }
}

function formatScore(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "0";
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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

function formatCompactDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}${hour}${minute}`;
}
