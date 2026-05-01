import { useEffect, useMemo, useState } from "react";

import type {
  PageResult,
  QuestionChallengeManagementItem,
  QuestionChallengeReviewInput
} from "@aios/api-sdk";

export interface ChallengePanelApi {
  listQuestionChallenges(query?: { status?: string; page?: number; page_size?: number }): Promise<PageResult<QuestionChallengeManagementItem>>;
  reviewQuestionChallenge(id: number, body: QuestionChallengeReviewInput): Promise<QuestionChallengeManagementItem>;
}

interface ChallengePanelProps {
  api?: ChallengePanelApi;
}

const defaultDecision = "accepted";
const defaultVersionSummary = "采纳质疑修订";

export function ChallengePanel({ api }: ChallengePanelProps) {
  const [items, setItems] = useState<QuestionChallengeManagementItem[]>([]);
  const [selectedID, setSelectedID] = useState<number | null>(null);
  const [detailID, setDetailID] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [decision, setDecision] = useState(defaultDecision);
  const [remark, setRemark] = useState("建议修正答案并同步更新解析。");
  const [versionSummary, setVersionSummary] = useState(defaultVersionSummary);
  const [versionContent, setVersionContent] = useState("{}");
  const [versionAnswer, setVersionAnswer] = useState("{}");
  const [versionAnalysis, setVersionAnalysis] = useState("{}");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedID) ?? items[0] ?? null,
    [items, selectedID]
  );
  const detailItem = useMemo(
    () => items.find((item) => item.id === detailID) ?? null,
    [detailID, items]
  );

  useEffect(() => {
    void loadChallenges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, statusFilter]);

  useEffect(() => {
    if (items.length === 0) {
      setSelectedID(null);
      return;
    }
    if (!items.some((item) => item.id === selectedID)) {
      setSelectedID(items[0].id);
    }
  }, [items, selectedID]);

  useEffect(() => {
    if (!selectedItem) {
      setVersionContent("{}");
      setVersionAnswer("{}");
      setVersionAnalysis("{}");
      setVersionSummary(defaultVersionSummary);
      return;
    }
    setVersionContent(stringifyJSON(selectedItem.current_content ?? {}));
    setVersionAnswer(stringifyJSON(selectedItem.current_answer ?? {}));
    setVersionAnalysis(stringifyJSON(selectedItem.current_analysis ?? {}));
    setVersionSummary(defaultVersionSummary);
  }, [selectedItem]);

  async function loadChallenges() {
    if (!api) {
      setItems([]);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const result = await api.listQuestionChallenges({
        status: statusFilter || undefined,
        page: 1,
        page_size: 50
      });
      setItems(result.items);
    } catch (error) {
      setItems([]);
      setMessage(error instanceof Error ? error.message : "质疑队列加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleDecision(nextStatus: string) {
    if (!api || !selectedItem) {
      return;
    }
    setMessage("");

    const input: QuestionChallengeReviewInput = {
      status: nextStatus,
      review_comment: remark.trim()
    };
    if (nextStatus === "accepted") {
      const content = parseJSONObject(versionContent);
      if (!content) {
        setMessage("修订内容 JSON 格式不正确。");
        return;
      }
      const answer = parseJSONObject(versionAnswer);
      if (!answer) {
        setMessage("修订答案 JSON 格式不正确。");
        return;
      }
      const analysis = parseJSONObject(versionAnalysis);
      if (!analysis) {
        setMessage("修订解析 JSON 格式不正确。");
        return;
      }
      input.new_version = {
        content,
        answer,
        analysis,
        change_summary: versionSummary.trim() || defaultVersionSummary
      };
    }

    setSubmitting(true);
    try {
      const updated = await api.reviewQuestionChallenge(selectedItem.id, input);
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setDecision(nextStatus);
      setSelectedID(updated.id);
      setMessage("处理意见已保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "处理意见保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  function openDetail(item: QuestionChallengeManagementItem) {
    setSelectedID(item.id);
    setDetailID(item.id);
  }

  return (
    <section aria-label="质疑处理面板" className="ui-admin-page">
      <section className="ui-admin-page__hero">
        <div className="ui-admin-page__header">
          <div>
            <span className="ui-admin-page__eyebrow">质疑处理</span>
            <h2>质疑处理</h2>
          </div>
          <div className="ui-admin-toolbar">
            <select aria-label="质疑状态" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">全部状态</option>
              <option value="pending">待处理</option>
              <option value="reviewing">处理中</option>
              <option value="accepted">已采纳</option>
              <option value="resolved">已解决</option>
              <option value="rejected">已驳回</option>
            </select>
            <button type="button" className="ui-button ui-button--primary" onClick={() => void loadChallenges()} disabled={loading}>
              {loading ? "刷新中..." : "刷新质疑队列"}
            </button>
          </div>
        </div>
      </section>

      {message ? <p className="ui-admin-inline-message">{message}</p> : null}

      <div className="ui-admin-layout--triple ui-admin-layout">
        <aside className="ui-admin-list-card">
          <div className="ui-admin-list-card__header">
            <div>
              <h3>待处理质疑</h3>
            </div>
          </div>
          <div className="ui-admin-notice-list">
            {items.length === 0 ? <div className="ui-admin-empty-inline">{loading ? "加载中..." : "暂无质疑数据"}</div> : null}
            {items.map((item) => (
              <article
                key={item.id}
                className={["ui-admin-list-card__item", selectedID === item.id ? "is-active" : ""].filter(Boolean).join(" ")}
              >
                <strong>{item.title}</strong>
                <div className="ui-admin-row-meta">
                  <span>{item.challenger}</span>
                  <span>{formatDateTime(item.created_at)}</span>
                </div>
                <span className={statusClassName(item.status)}>{formatStatus(item.status)}</span>
                <button type="button" className="ui-admin-link" onClick={() => openDetail(item)}>
                  查看详情
                </button>
              </article>
            ))}
          </div>
        </aside>

        <section className="ui-admin-main">
          <section className="ui-admin-card">
            <div className="ui-admin-card__header">
              <div>
                <h3>题目对照</h3>
              </div>
            </div>
            {selectedItem ? (
              <div className="ui-admin-split">
                <article className="ui-admin-mini-item">
                  <strong>当前线上版本</strong>
                  <p>{selectedItem.current_version}</p>
                  <div className="ui-admin-row-meta">
                    <span>{selectedItem.question_bank || "未绑定题库"}</span>
                    <span>{formatChallengeType(selectedItem.challenge_type)}</span>
                  </div>
                </article>
                <article className="ui-admin-mini-item">
                  <strong>质疑内容</strong>
                  <p>{selectedItem.suggested_fix || selectedItem.description}</p>
                </article>
              </div>
            ) : (
              <div className="ui-admin-empty-inline">暂无质疑数据</div>
            )}
          </section>

          <section className="ui-admin-card">
            <div className="ui-admin-card__header">
              <div>
                <h3>历史版本</h3>
              </div>
            </div>
            {selectedItem ? (
              <div className="ui-admin-timeline">
                {selectedItem.history_versions.map((version, index) => (
                  <article
                    key={`${selectedItem.id}-${version}`}
                    className={["ui-admin-timeline__item", index === selectedItem.history_versions.length - 1 ? "is-active" : ""]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <strong>{version}</strong>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        </section>

        <aside className="ui-admin-side-card">
          <section className="ui-admin-card">
            <div className="ui-admin-card__header">
              <div>
                <h3>处理意见</h3>
              </div>
            </div>
            <div className="ui-admin-form__grid">
              <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="challenge_decision">处理动作</label>
                <select id="challenge_decision" value={decision} onChange={(event) => setDecision(event.target.value)}>
                  <option value="accepted">采纳质疑</option>
                  <option value="reviewing">退回补充</option>
                  <option value="resolved">标记解决</option>
                  <option value="rejected">驳回</option>
                </select>
              </div>
              <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="challenge_remark">审核意见</label>
                <textarea id="challenge_remark" value={remark} onChange={(event) => setRemark(event.target.value)} />
              </div>
              {decision === "accepted" ? (
                <>
                  <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                    <label htmlFor="challenge_version_summary">版本说明</label>
                    <input
                      id="challenge_version_summary"
                      value={versionSummary}
                      onChange={(event) => setVersionSummary(event.target.value)}
                    />
                  </div>
                  <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                    <label htmlFor="challenge_version_content">修订内容</label>
                    <textarea
                      id="challenge_version_content"
                      value={versionContent}
                      onChange={(event) => setVersionContent(event.target.value)}
                    />
                  </div>
                  <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                    <label htmlFor="challenge_version_answer">修订答案</label>
                    <textarea
                      id="challenge_version_answer"
                      value={versionAnswer}
                      onChange={(event) => setVersionAnswer(event.target.value)}
                    />
                  </div>
                  <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                    <label htmlFor="challenge_version_analysis">修订解析</label>
                    <textarea
                      id="challenge_version_analysis"
                      value={versionAnalysis}
                      onChange={(event) => setVersionAnalysis(event.target.value)}
                    />
                  </div>
                </>
              ) : null}
            </div>
            <div className="ui-admin-side-card__actions">
              <button
                type="button"
                className="ui-button ui-button--ghost"
                onClick={() => void handleDecision("reviewing")}
                disabled={!selectedItem || submitting}
              >
                退回补充
              </button>
              <button
                type="button"
                className="ui-button ui-button--ghost"
                onClick={() => void handleDecision("rejected")}
                disabled={!selectedItem || submitting}
              >
                驳回
              </button>
              <button
                type="button"
                className="ui-button ui-button--primary"
                onClick={() => void handleDecision(decision)}
                disabled={!selectedItem || submitting}
              >
                {submitting ? "保存中..." : "保存意见"}
              </button>
            </div>
          </section>

          <section className="ui-admin-card">
            <div className="ui-admin-card__header">
              <div>
                <h3>当前状态</h3>
              </div>
            </div>
            {selectedItem ? (
              <div className="ui-admin-mini-list">
                <article className="ui-admin-mini-item">
                  <strong>处理状态</strong>
                  <p>{formatStatus(selectedItem.status)}</p>
                </article>
                <article className="ui-admin-mini-item">
                  <strong>建议动作</strong>
                  <p>{formatStatus(decision)}</p>
                </article>
                {selectedItem.review_comment ? (
                  <article className="ui-admin-mini-item">
                    <strong>最近意见</strong>
                    <p>{selectedItem.review_comment}</p>
                  </article>
                ) : null}
              </div>
            ) : null}
          </section>
        </aside>
      </div>

      {detailItem ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="质疑详情弹层">
            <div className="ui-admin-modal__header">
              <div>
                <h3>质疑详情</h3>
                <p>{detailItem.title}</p>
              </div>
              <button type="button" className="ui-button ui-button--ghost" onClick={() => setDetailID(null)}>
                关闭
              </button>
            </div>
            <div className="ui-admin-modal__body">
              <dl className="ui-admin-meta-list">
                <div>
                  <dt>质疑类型</dt>
                  <dd>{formatChallengeType(detailItem.challenge_type)}</dd>
                </div>
                <div>
                  <dt>处理状态</dt>
                  <dd>{formatStatus(detailItem.status)}</dd>
                </div>
                <div>
                  <dt>发起人</dt>
                  <dd>{detailItem.challenger}</dd>
                </div>
                <div>
                  <dt>题库</dt>
                  <dd>{detailItem.question_bank || "未绑定题库"}</dd>
                </div>
                <div>
                  <dt>当前版本</dt>
                  <dd>{detailItem.current_version}</dd>
                </div>
                <div>
                  <dt>建议修正</dt>
                  <dd>{detailItem.suggested_fix || detailItem.description}</dd>
                </div>
                {detailItem.attachments.length > 0 ? (
                  <div>
                    <dt>附件</dt>
                    <dd>{detailItem.attachments.map((attachment) => attachment.url).join("、")}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
            <div className="ui-admin-modal__footer">
              <button type="button" className="ui-button ui-button--primary" onClick={() => setDetailID(null)}>
                我知道了
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function formatChallengeType(value: string): string {
  switch (value) {
    case "wrong_answer":
      return "答案有误";
    case "wrong_stem":
      return "题干有误";
    case "wrong_option":
      return "选项有误";
    case "typo":
      return "文字错误";
    case "dispute":
      return "解析争议";
    case "other":
      return "其他";
    default:
      return value;
  }
}

function formatStatus(value: string): string {
  switch (value) {
    case "pending":
      return "待处理";
    case "reviewing":
      return "处理中";
    case "resolved":
      return "已解决";
    case "rejected":
      return "已驳回";
    case "accepted":
      return "已采纳";
    case "merged":
      return "已合并";
    default:
      return value;
  }
}

function statusClassName(value: string): string {
  switch (value) {
    case "resolved":
    case "accepted":
    case "merged":
      return "ui-admin-status ui-admin-status--active";
    case "reviewing":
    case "pending":
      return "ui-admin-status ui-admin-status--pending";
    case "rejected":
      return "ui-admin-status ui-admin-status--danger";
    default:
      return "ui-admin-status ui-admin-status--draft";
  }
}

function stringifyJSON(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseJSONObject(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function formatDateTime(value?: string): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN");
}
