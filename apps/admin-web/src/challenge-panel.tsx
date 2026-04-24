import { useMemo, useState } from "react";

interface ChallengeItem {
  id: number;
  title: string;
  challenge_type: string;
  status: string;
  challenger: string;
  question_bank: string;
  created_at: string;
  current_version: string;
  suggested_fix: string;
  history_versions: string[];
}

const initialChallenges: ChallengeItem[] = [
  {
    id: 1,
    title: "函数题答案有误",
    challenge_type: "wrong_answer",
    status: "pending",
    challenger: "张同学",
    question_bank: "高一数学基础题库",
    created_at: "2026-04-24 09:10",
    current_version: "版本 3：答案为 B",
    suggested_fix: "学生认为正确答案应为 C，并附上演算过程。",
    history_versions: ["版本 1：原始录入", "版本 2：修正文案", "版本 3：当前线上版本"]
  },
  {
    id: 2,
    title: "题干存在歧义",
    challenge_type: "wrong_stem",
    status: "reviewing",
    challenger: "李老师",
    question_bank: "英语阅读专项题库",
    created_at: "2026-04-23 16:20",
    current_version: "版本 2：题干未标注上下文",
    suggested_fix: "建议补充材料背景，避免学生误读。",
    history_versions: ["版本 1：导入版本", "版本 2：当前线上版本"]
  }
];

export function ChallengePanel() {
  const [items, setItems] = useState(initialChallenges);
  const [selectedID, setSelectedID] = useState<number>(initialChallenges[0].id);
  const [decision, setDecision] = useState("通过并生成新版本");
  const [remark, setRemark] = useState("建议修正答案并同步更新解析。");

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedID) ?? items[0] ?? null,
    [items, selectedID]
  );

  function handleDecision(nextStatus: string) {
    setItems((current) =>
      current.map((item) => (item.id === selectedID ? { ...item, status: nextStatus } : item))
    );
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
            <button type="button" className="ui-button ui-button--primary">
              刷新质疑队列
            </button>
          </div>
        </div>
      </section>

      <div className="ui-admin-layout--triple ui-admin-layout">
        <aside className="ui-admin-list-card">
          <div className="ui-admin-list-card__header">
            <div>
              <h3>待处理质疑</h3>
            </div>
          </div>
          <div className="ui-admin-notice-list">
            {items.map((item) => (
              <article
                key={item.id}
                className={["ui-admin-list-card__item", selectedID === item.id ? "is-active" : ""].filter(Boolean).join(" ")}
              >
                <strong>{item.title}</strong>
                <div className="ui-admin-row-meta">
                  <span>{item.challenger}</span>
                  <span>{item.created_at}</span>
                </div>
                <span className={statusClassName(item.status)}>{formatStatus(item.status)}</span>
                <button type="button" className="ui-admin-link" onClick={() => setSelectedID(item.id)}>
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
                    <span>{selectedItem.question_bank}</span>
                    <span>{formatChallengeType(selectedItem.challenge_type)}</span>
                  </div>
                </article>
                <article className="ui-admin-mini-item">
                  <strong>质疑内容</strong>
                  <p>{selectedItem.suggested_fix}</p>
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
                  <option value="通过并生成新版本">通过并生成新版本</option>
                  <option value="退回补充">退回补充</option>
                  <option value="驳回">驳回</option>
                </select>
              </div>
              <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="challenge_remark">审核意见</label>
                <textarea id="challenge_remark" value={remark} onChange={(event) => setRemark(event.target.value)} />
              </div>
            </div>
            <div className="ui-admin-side-card__actions">
              <button type="button" className="ui-button ui-button--ghost" onClick={() => handleDecision("reviewing")}>
                退回补充
              </button>
              <button type="button" className="ui-button ui-button--ghost" onClick={() => handleDecision("rejected")}>
                驳回
              </button>
              <button type="button" className="ui-button ui-button--primary" onClick={() => handleDecision("resolved")}>
                通过并生成新版本
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
                  <p>{decision}</p>
                </article>
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </section>
  );
}

function formatChallengeType(value: string): string {
  switch (value) {
    case "wrong_answer":
      return "答案有误";
    case "wrong_stem":
      return "题干有误";
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
      return "已通过";
    case "rejected":
      return "已驳回";
    default:
      return value;
  }
}

function statusClassName(value: string): string {
  switch (value) {
    case "resolved":
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
