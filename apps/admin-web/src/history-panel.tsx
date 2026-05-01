import { useEffect, useMemo, useState, type FormEvent } from "react";

import type {
  AuditLogItem,
  EntitySnapshotItem,
  PageResult,
  StudentTransitionInput,
  StudentTransitionItem,
  TeacherAssignmentChangeInput,
  TeacherAssignmentHistoryItem
} from "@aios/api-sdk";

export interface HistoryPanelApi {
  listAuditLogs(): Promise<PageResult<AuditLogItem>>;
  listEntitySnapshots(): Promise<PageResult<EntitySnapshotItem>>;
  listStudentTransitions(): Promise<PageResult<StudentTransitionItem>>;
  createStudentTransition(body: StudentTransitionInput): Promise<StudentTransitionItem>;
  listTeacherAssignmentHistories(): Promise<PageResult<TeacherAssignmentHistoryItem>>;
  createTeacherAssignmentChange(body: TeacherAssignmentChangeInput): Promise<TeacherAssignmentHistoryItem>;
}

const defaultTransitionForm = {
  student_id: "",
  transition_type: "class_change",
  to_class_id: "",
  occurred_at: "",
  remark: ""
};

const defaultAssignmentForm = {
  teacher_id: "",
  class_id: "",
  course_id: "",
  assignment_type: "course_teacher",
  change_type: "assign",
  effective_at: ""
};

export function HistoryPanel({ api }: { api: HistoryPanelApi }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [entitySnapshots, setEntitySnapshots] = useState<EntitySnapshotItem[]>([]);
  const [studentTransitions, setStudentTransitions] = useState<StudentTransitionItem[]>([]);
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignmentHistoryItem[]>([]);
  const [selectedSnapshotID, setSelectedSnapshotID] = useState<number | null>(null);
  const [snapshotDetail, setSnapshotDetail] = useState<EntitySnapshotItem | null>(null);
  const [transitionForm, setTransitionForm] = useState(defaultTransitionForm);
  const [assignmentForm, setAssignmentForm] = useState(defaultAssignmentForm);

  useEffect(() => {
    void loadAll();
  }, [api]);

  useEffect(() => {
    if (!selectedSnapshotID && entitySnapshots.length > 0) {
      setSelectedSnapshotID(entitySnapshots[0].id);
    }
  }, [entitySnapshots, selectedSnapshotID]);

  async function loadAll() {
    setLoading(true);
    setErrorMessage("");
    try {
      const [auditResult, snapshotResult, transitionResult, assignmentResult] = await Promise.all([
        api.listAuditLogs(),
        api.listEntitySnapshots(),
        api.listStudentTransitions(),
        api.listTeacherAssignmentHistories()
      ]);
      setAuditLogs(auditResult.items);
      setEntitySnapshots(snapshotResult.items);
      setStudentTransitions(transitionResult.items);
      setTeacherAssignments(assignmentResult.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载历史数据失败");
    } finally {
      setLoading(false);
    }
  }

  const selectedSnapshot = useMemo(
    () => entitySnapshots.find((item) => item.id === selectedSnapshotID) ?? entitySnapshots[0] ?? null,
    [entitySnapshots, selectedSnapshotID]
  );

  function openSnapshotDetail(item: EntitySnapshotItem) {
    setSelectedSnapshotID(item.id);
    setSnapshotDetail(item);
  }

  async function handleTransitionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage("");
    try {
      await api.createStudentTransition({
        student_id: Number(transitionForm.student_id),
        transition_type: transitionForm.transition_type,
        to_class_id: transitionForm.to_class_id ? Number(transitionForm.to_class_id) : undefined,
        occurred_at: normalizeDateTimeValue(transitionForm.occurred_at) ?? transitionForm.occurred_at,
        remark: transitionForm.remark || undefined
      });
      setTransitionForm(defaultTransitionForm);
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "提交学籍变更失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAssignmentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage("");
    try {
      await api.createTeacherAssignmentChange({
        teacher_id: Number(assignmentForm.teacher_id),
        class_id: Number(assignmentForm.class_id),
        course_id: assignmentForm.assignment_type === "course_teacher" ? Number(assignmentForm.course_id) : undefined,
        assignment_type: assignmentForm.assignment_type,
        change_type: assignmentForm.change_type,
        effective_at: normalizeDateTimeValue(assignmentForm.effective_at) ?? assignmentForm.effective_at
      });
      setAssignmentForm(defaultAssignmentForm);
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "提交任课变更失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-label="快照历史面板" className="ui-admin-page">
      <section className="ui-admin-page__hero">
        <div className="ui-admin-page__header">
          <div>
            <span className="ui-admin-page__eyebrow">快照历史</span>
            <h2>快照历史</h2>
          </div>
          <div className="ui-admin-toolbar">
            <button type="button" className="ui-button ui-button--primary" onClick={() => void loadAll()}>
              刷新历史
            </button>
          </div>
        </div>
      </section>

      {errorMessage ? <div className="ui-status ui-status--danger">{errorMessage}</div> : null}
      {loading ? <div className="ui-status ui-status--info">加载中...</div> : null}

      {!loading ? (
        <>
          <section className="ui-admin-split ui-admin-split--2">
            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>学籍变更登记</h3>
                </div>
              </div>
              <form className="ui-admin-form__grid ui-admin-form__grid--wide" onSubmit={(event) => void handleTransitionSubmit(event)}>
                <div className="ui-admin-form__field">
                  <label htmlFor="transition_student_id">学生用户 ID</label>
                  <input
                    id="transition_student_id"
                    value={transitionForm.student_id}
                    onChange={(event) => setTransitionForm((current) => ({ ...current, student_id: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="transition_type">变更类型</label>
                  <select
                    id="transition_type"
                    value={transitionForm.transition_type}
                    onChange={(event) => setTransitionForm((current) => ({ ...current, transition_type: event.target.value }))}
                  >
                    <option value="class_change">转班</option>
                    <option value="promote">升级</option>
                    <option value="transfer_in">转入</option>
                    <option value="transfer_out">转出</option>
                    <option value="graduate">毕业</option>
                    <option value="leave_school">离校</option>
                    <option value="re_enroll">复学</option>
                  </select>
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="transition_to_class_id">目标班级 ID</label>
                  <input
                    id="transition_to_class_id"
                    value={transitionForm.to_class_id}
                    onChange={(event) => setTransitionForm((current) => ({ ...current, to_class_id: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="transition_occurred_at">发生时间</label>
                  <input
                    id="transition_occurred_at"
                    type="datetime-local"
                    value={transitionForm.occurred_at}
                    onChange={(event) => setTransitionForm((current) => ({ ...current, occurred_at: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="transition_remark">备注</label>
                  <input
                    id="transition_remark"
                    value={transitionForm.remark}
                    onChange={(event) => setTransitionForm((current) => ({ ...current, remark: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__actions" style={{ gridColumn: "1 / -1" }}>
                  <button type="submit" disabled={submitting} className="ui-button ui-button--primary">
                    提交学籍变更
                  </button>
                </div>
              </form>
            </section>

            <section className="ui-admin-card">
              <div className="ui-admin-card__header">
                <div>
                  <h3>任课变更登记</h3>
                </div>
              </div>
              <form className="ui-admin-form__grid ui-admin-form__grid--wide" onSubmit={(event) => void handleAssignmentSubmit(event)}>
                <div className="ui-admin-form__field">
                  <label htmlFor="assignment_teacher_id">教师用户 ID</label>
                  <input
                    id="assignment_teacher_id"
                    value={assignmentForm.teacher_id}
                    onChange={(event) => setAssignmentForm((current) => ({ ...current, teacher_id: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="assignment_class_id">班级 ID</label>
                  <input
                    id="assignment_class_id"
                    value={assignmentForm.class_id}
                    onChange={(event) => setAssignmentForm((current) => ({ ...current, class_id: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="assignment_type">教师角色</label>
                  <select
                    id="assignment_type"
                    value={assignmentForm.assignment_type}
                    onChange={(event) =>
                      setAssignmentForm((current) => ({
                        ...current,
                        assignment_type: event.target.value,
                        course_id: event.target.value === "head_teacher" ? "" : current.course_id
                      }))
                    }
                  >
                    <option value="course_teacher">课程老师</option>
                    <option value="head_teacher">班主任</option>
                  </select>
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="assignment_course_id">课程 ID</label>
                  <input
                    id="assignment_course_id"
                    value={assignmentForm.course_id}
                    disabled={assignmentForm.assignment_type === "head_teacher"}
                    onChange={(event) => setAssignmentForm((current) => ({ ...current, course_id: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="assignment_change_type">变更类型</label>
                  <select
                    id="assignment_change_type"
                    value={assignmentForm.change_type}
                    onChange={(event) => setAssignmentForm((current) => ({ ...current, change_type: event.target.value }))}
                  >
                    <option value="assign">指派</option>
                    <option value="unassign">取消指派</option>
                  </select>
                </div>
                <div className="ui-admin-form__field">
                  <label htmlFor="assignment_effective_at">生效时间</label>
                  <input
                    id="assignment_effective_at"
                    type="datetime-local"
                    value={assignmentForm.effective_at}
                    onChange={(event) => setAssignmentForm((current) => ({ ...current, effective_at: event.target.value }))}
                  />
                </div>
                <div className="ui-admin-form__actions" style={{ gridColumn: "1 / -1" }}>
                  <button type="submit" disabled={submitting} className="ui-button ui-button--primary">
                    提交任课变更
                  </button>
                </div>
              </form>
            </section>
          </section>

          <div className="ui-admin-layout--triple ui-admin-layout">
            <aside className="ui-admin-timeline-card">
              <div className="ui-admin-timeline-card__header">
                <div>
                  <h3>时间轴</h3>
                </div>
              </div>
              <div className="ui-admin-timeline">
                {entitySnapshots.map((item) => (
                  <div
                    key={item.id}
                    className={["ui-admin-timeline__item", selectedSnapshot?.id === item.id ? "is-active" : ""]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <strong>{`${item.snapshot_type} / ${item.entity_type}`}</strong>
                    <p>{`版本 ${item.version_no} · 实体 ${item.entity_id}`}</p>
                    <div className="ui-admin-row-meta">
                      <span>{formatSnapshotSummary(item)}</span>
                      <button type="button" className="ui-admin-link" onClick={() => openSnapshotDetail(item)}>
                        查看
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            <div className="ui-admin-main">
              <section className="ui-admin-table-card">
              <div className="ui-admin-table-card__header">
                <div>
                  <h3>变更表格</h3>
                </div>
              </div>
                <table className="ui-admin-table">
                  <thead>
                    <tr>
                      <th>类型</th>
                      <th>对象</th>
                      <th>目标</th>
                      <th>说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentTransitions.map((item) => (
                      <tr key={`transition-${item.id}`}>
                        <td>学籍变更</td>
                        <td>{item.student_id}</td>
                        <td>{item.to_class_id ?? "-"}</td>
                        <td>{item.remark ?? item.transition_type}</td>
                      </tr>
                    ))}
                    {teacherAssignments.map((item) => (
                      <tr key={`assignment-${item.id}`}>
                        <td>{item.assignment_type === "head_teacher" ? "班主任变更" : "任课变更"}</td>
                        <td>{item.teacher_id}</td>
                        <td>{item.course_id ? `${item.class_id} / ${item.course_id}` : `${item.class_id} / 全班`}</td>
                        <td>{item.change_type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="ui-admin-table-card">
              <div className="ui-admin-table-card__header">
                <div>
                  <h3>审计日志</h3>
                </div>
              </div>
                <table className="ui-admin-table">
                  <thead>
                    <tr>
                      <th>模块</th>
                      <th>动作</th>
                      <th>资源</th>
                      <th>结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((item) => (
                      <tr key={item.id}>
                        <td>{item.module_name}</td>
                        <td>{item.action_name}</td>
                        <td>{item.resource_type}</td>
                        <td>{item.result}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>

            <aside className="ui-admin-side-card">
              <div className="ui-admin-side-card__header">
                <div>
                  <h3>快照详情</h3>
                </div>
              </div>
              {selectedSnapshot ? (
                <>
                  <dl className="ui-admin-meta-list">
                    <div>
                      <dt>实体类型</dt>
                      <dd>{selectedSnapshot.entity_type}</dd>
                    </div>
                    <div>
                      <dt>实体 ID</dt>
                      <dd>{selectedSnapshot.entity_id}</dd>
                    </div>
                    <div>
                      <dt>快照类型</dt>
                      <dd>{selectedSnapshot.snapshot_type}</dd>
                    </div>
                    <div>
                      <dt>版本号</dt>
                      <dd>{selectedSnapshot.version_no}</dd>
                    </div>
                    <div>
                      <dt>说明</dt>
                      <dd>{formatSnapshotSummary(selectedSnapshot)}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <div className="ui-admin-empty-inline">暂无快照</div>
              )}
            </aside>
          </div>
        </>
      ) : null}

      {snapshotDetail ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="快照详情弹层">
            <div className="ui-admin-modal__header">
              <div>
                <h3>快照详情</h3>
                <p>{`${snapshotDetail.snapshot_type} / ${snapshotDetail.entity_type}`}</p>
              </div>
              <button type="button" className="ui-button ui-button--ghost" onClick={() => setSnapshotDetail(null)}>
                关闭
              </button>
            </div>
            <div className="ui-admin-modal__body">
              <dl className="ui-admin-meta-list">
                <div>
                  <dt>实体类型</dt>
                  <dd>{snapshotDetail.entity_type}</dd>
                </div>
                <div>
                  <dt>实体 ID</dt>
                  <dd>{snapshotDetail.entity_id}</dd>
                </div>
                <div>
                  <dt>快照类型</dt>
                  <dd>{snapshotDetail.snapshot_type}</dd>
                </div>
                <div>
                  <dt>版本号</dt>
                  <dd>{snapshotDetail.version_no}</dd>
                </div>
                <div>
                  <dt>触发事件</dt>
                  <dd>{snapshotDetail.trigger_event_type ?? "-"}</dd>
                </div>
                <div>
                  <dt>说明</dt>
                  <dd>{formatSnapshotSummary(snapshotDetail)}</dd>
                </div>
              </dl>
              <pre className="ui-admin-code-block">{JSON.stringify(snapshotDetail.snapshot_json, null, 2)}</pre>
            </div>
            <div className="ui-admin-modal__footer">
              <button type="button" className="ui-button ui-button--primary" onClick={() => setSnapshotDetail(null)}>
                我知道了
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function normalizeDateTimeValue(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toISOString();
}

function formatSnapshotSummary(snapshot: EntitySnapshotItem): string {
  const transitionType = typeof snapshot.snapshot_json.transition_type === "string" ? snapshot.snapshot_json.transition_type : "";
  const changeType = typeof snapshot.snapshot_json.change_type === "string" ? snapshot.snapshot_json.change_type : "";
  const eventType = snapshot.trigger_event_type ?? "";

  return transitionType || changeType || eventType || "暂无说明";
}
