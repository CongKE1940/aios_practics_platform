import { useEffect, useState, type FormEvent } from "react";

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
  const [transitionForm, setTransitionForm] = useState(defaultTransitionForm);
  const [assignmentForm, setAssignmentForm] = useState(defaultAssignmentForm);

  useEffect(() => {
    void loadAll();
  }, [api]);

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
        course_id: Number(assignmentForm.course_id),
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
    <section aria-label="快照历史面板">
      <h2>快照历史</h2>
      <button type="button" onClick={() => void loadAll()}>
        刷新历史
      </button>
      {errorMessage ? <p>{errorMessage}</p> : null}
      {loading ? <p>加载中...</p> : null}

      <section aria-label="学籍变更登记">
        <h3>学籍变更登记</h3>
        <form onSubmit={(event) => void handleTransitionSubmit(event)}>
          <label htmlFor="transition_student_id">学生用户 ID</label>
          <input
            id="transition_student_id"
            value={transitionForm.student_id}
            onChange={(event) => setTransitionForm((current) => ({ ...current, student_id: event.target.value }))}
          />
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
          <label htmlFor="transition_to_class_id">目标班级 ID</label>
          <input
            id="transition_to_class_id"
            value={transitionForm.to_class_id}
            onChange={(event) => setTransitionForm((current) => ({ ...current, to_class_id: event.target.value }))}
          />
          <label htmlFor="transition_occurred_at">发生时间</label>
          <input
            id="transition_occurred_at"
            type="datetime-local"
            value={transitionForm.occurred_at}
            onChange={(event) => setTransitionForm((current) => ({ ...current, occurred_at: event.target.value }))}
          />
          <label htmlFor="transition_remark">备注</label>
          <input
            id="transition_remark"
            value={transitionForm.remark}
            onChange={(event) => setTransitionForm((current) => ({ ...current, remark: event.target.value }))}
          />
          <button type="submit" disabled={submitting}>
            提交学籍变更
          </button>
        </form>
      </section>

      <section aria-label="任课变更登记">
        <h3>任课变更登记</h3>
        <form onSubmit={(event) => void handleAssignmentSubmit(event)}>
          <label htmlFor="assignment_teacher_id">教师用户 ID</label>
          <input
            id="assignment_teacher_id"
            value={assignmentForm.teacher_id}
            onChange={(event) => setAssignmentForm((current) => ({ ...current, teacher_id: event.target.value }))}
          />
          <label htmlFor="assignment_class_id">班级 ID</label>
          <input
            id="assignment_class_id"
            value={assignmentForm.class_id}
            onChange={(event) => setAssignmentForm((current) => ({ ...current, class_id: event.target.value }))}
          />
          <label htmlFor="assignment_course_id">课程 ID</label>
          <input
            id="assignment_course_id"
            value={assignmentForm.course_id}
            onChange={(event) => setAssignmentForm((current) => ({ ...current, course_id: event.target.value }))}
          />
          <label htmlFor="assignment_change_type">变更类型</label>
          <select
            id="assignment_change_type"
            value={assignmentForm.change_type}
            onChange={(event) => setAssignmentForm((current) => ({ ...current, change_type: event.target.value }))}
          >
            <option value="assign">指派</option>
            <option value="unassign">取消指派</option>
          </select>
          <label htmlFor="assignment_effective_at">生效时间</label>
          <input
            id="assignment_effective_at"
            type="datetime-local"
            value={assignmentForm.effective_at}
            onChange={(event) => setAssignmentForm((current) => ({ ...current, effective_at: event.target.value }))}
          />
          <button type="submit" disabled={submitting}>
            提交任课变更
          </button>
        </form>
      </section>

      <section aria-label="学籍变更记录">
        <h3>学籍变更记录</h3>
        <ul>
          {studentTransitions.map((item) => (
            <li key={item.id}>
              <span>{item.student_id}</span>
              <span>{item.transition_type}</span>
              <span>{item.to_class_id ?? "-"}</span>
              <span>{item.remark ?? "-"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="任课变更记录">
        <h3>任课变更记录</h3>
        <ul>
          {teacherAssignments.map((item) => (
            <li key={item.id}>
              <span>{item.teacher_id}</span>
              <span>{item.class_id}</span>
              <span>{item.course_id}</span>
              <span>{item.change_type}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="实体快照">
        <h3>实体快照</h3>
        <ul>
          {entitySnapshots.map((item) => (
            <li key={item.id}>
              <span>{item.entity_type}</span>
              <span>{item.entity_id}</span>
              <span>{item.snapshot_type}</span>
              <span>{item.version_no}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="审计日志">
        <h3>审计日志</h3>
        <ul>
          {auditLogs.map((item) => (
            <li key={item.id}>
              <span>{item.module_name}</span>
              <span>{item.action_name}</span>
              <span>{item.resource_type}</span>
              <span>{item.result}</span>
            </li>
          ))}
        </ul>
      </section>
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
