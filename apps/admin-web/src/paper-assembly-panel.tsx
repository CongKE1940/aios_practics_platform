import { useMemo, useState } from "react";

type RuleForm = {
  question_type: string;
  score_per_question: number;
  question_count: number;
  knowledge_tags: string;
  difficulty_range: string[];
};

const defaultRules: RuleForm[] = [
  { question_type: "single_choice", score_per_question: 5, question_count: 10, knowledge_tags: "函数,方程", difficulty_range: ["easy", "medium"] },
  { question_type: "multiple_choice", score_per_question: 8, question_count: 5, knowledge_tags: "几何", difficulty_range: ["medium"] }
];

export function PaperAssemblyPanel() {
  const [examName, setExamName] = useState("高一数学阶段测");
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [targetScope, setTargetScope] = useState("高一 1 班 / 高一 2 班");
  const [rules, setRules] = useState<RuleForm[]>(defaultRules);

  const summary = useMemo(() => {
    const totalQuestions = rules.reduce((sum, rule) => sum + rule.question_count, 0);
    const totalScore = rules.reduce((sum, rule) => sum + rule.question_count * rule.score_per_question, 0);
    const warnings = rules
      .filter((rule) => rule.question_count < 3 || rule.score_per_question <= 0)
      .map((rule) => `${formatQuestionType(rule.question_type)} 题量或分值偏低`);
    return { totalQuestions, totalScore, warnings };
  }, [rules]);

  function updateRule(index: number, patch: Partial<RuleForm>) {
    setRules((current) => current.map((rule, currentIndex) => (currentIndex === index ? { ...rule, ...patch } : rule)));
  }

  function addRule() {
    setRules((current) => [
      ...current,
      {
        question_type: "short_answer",
        score_per_question: 10,
        question_count: 2,
        knowledge_tags: "",
        difficulty_range: ["medium"]
      }
    ]);
  }

  return (
    <section aria-label="随机组卷面板" className="ui-admin-page">
      <section className="ui-admin-page__hero">
        <div className="ui-admin-page__header">
          <div>
            <span className="ui-admin-page__eyebrow">随机组卷</span>
            <h2>随机组卷</h2>
          </div>
          <div className="ui-admin-toolbar">
            <button type="button" className="ui-button ui-button--ghost" onClick={addRule}>
              新增规则
            </button>
            <button type="button" className="ui-button ui-button--primary">
              保存组卷模板
            </button>
          </div>
        </div>
      </section>

      <section className="ui-admin-split ui-admin-split--2">
        <section className="ui-admin-card">
          <div className="ui-admin-card__header">
            <div>
              <h3>组卷规则</h3>
            </div>
          </div>
          <div className="ui-admin-form__grid ui-admin-form__grid--wide">
            <div className="ui-admin-form__field">
              <label htmlFor="paper_exam_name">考试名称</label>
              <input id="paper_exam_name" value={examName} onChange={(event) => setExamName(event.target.value)} />
            </div>
            <div className="ui-admin-form__field">
              <label htmlFor="paper_duration_minutes">考试时长</label>
              <input
                id="paper_duration_minutes"
                type="number"
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(Number(event.target.value) || 0)}
              />
            </div>
            <div className="ui-admin-form__field">
              <label htmlFor="paper_target_scope">发布对象</label>
              <input id="paper_target_scope" value={targetScope} onChange={(event) => setTargetScope(event.target.value)} />
            </div>
          </div>

          <div className="ui-admin-mini-list">
            {rules.map((rule, index) => (
              <article key={`${rule.question_type}-${index}`} className="ui-admin-mini-item">
                <div className="ui-admin-card__header">
                  <strong>{`规则 ${index + 1}`}</strong>
                  <span className="ui-admin-status ui-admin-status--draft">{formatQuestionType(rule.question_type)}</span>
                </div>
                <div className="ui-admin-form__grid ui-admin-form__grid--wide">
                  <div className="ui-admin-form__field">
                    <label htmlFor={`paper_question_type_${index}`}>题型</label>
                    <select
                      id={`paper_question_type_${index}`}
                      value={rule.question_type}
                      onChange={(event) => updateRule(index, { question_type: event.target.value })}
                    >
                      <option value="single_choice">单选题</option>
                      <option value="multiple_choice">多选题</option>
                      <option value="true_false">判断题</option>
                      <option value="short_answer">简答题</option>
                    </select>
                  </div>
                  <div className="ui-admin-form__field">
                    <label htmlFor={`paper_score_${index}`}>每题分值</label>
                    <input
                      id={`paper_score_${index}`}
                      type="number"
                      value={rule.score_per_question}
                      onChange={(event) => updateRule(index, { score_per_question: Number(event.target.value) || 0 })}
                    />
                  </div>
                  <div className="ui-admin-form__field">
                    <label htmlFor={`paper_count_${index}`}>题量</label>
                    <input
                      id={`paper_count_${index}`}
                      type="number"
                      value={rule.question_count}
                      onChange={(event) => updateRule(index, { question_count: Number(event.target.value) || 0 })}
                    />
                  </div>
                  <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                    <label htmlFor={`paper_knowledge_tags_${index}`}>知识点范围</label>
                    <input
                      id={`paper_knowledge_tags_${index}`}
                      value={rule.knowledge_tags}
                      onChange={(event) => updateRule(index, { knowledge_tags: event.target.value })}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="ui-admin-side-card">
          <section className="ui-admin-card">
            <div className="ui-admin-card__header">
              <div>
                <h3>组卷摘要</h3>
              </div>
            </div>
            <div className="ui-admin-mini-list">
              <article className="ui-admin-mini-item">
                <strong>总题量</strong>
                <p>{summary.totalQuestions} 题</p>
              </article>
              <article className="ui-admin-mini-item">
                <strong>总分</strong>
                <p>{summary.totalScore} 分</p>
              </article>
              <article className="ui-admin-mini-item">
                <strong>建议时长</strong>
                <p>{durationMinutes} 分钟</p>
              </article>
            </div>
          </section>

          <section className="ui-admin-card">
            <div className="ui-admin-card__header">
              <div>
                <h3>风险提示</h3>
              </div>
            </div>
            {summary.warnings.length > 0 ? (
              <div className="ui-admin-check-list">
                {summary.warnings.map((item) => (
                  <div key={item} className="ui-admin-check-item">
                    <span className="ui-admin-status ui-admin-status--danger">需调整</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ui-admin-empty-inline">当前规则校验通过，可继续生成预览。</div>
            )}
          </section>
        </section>
      </section>
    </section>
  );
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
    default:
      return value;
  }
}
