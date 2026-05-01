import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import type {
  CurrentUser,
  ManagedUser,
  ManagedUserInput,
  ManagedUserListQuery,
  PageResult,
  RoleItem,
  RoleListQuery
} from "@aios/api-sdk";
import {
  ClearableFilterInput,
  ClearableFilterSelect,
  FixedActionList,
  ToastNotice,
  type FixedActionListColumn,
  type FixedActionListRowId
} from "@aios/ui-web";
import { canAccess } from "@aios/shared-utils";

import { downloadCsv } from "./list-page-utils";

export interface UserPanelApi {
  listUsers(query?: ManagedUserListQuery): Promise<PageResult<ManagedUser>>;
  createUser(body: ManagedUserInput): Promise<ManagedUser>;
  assignUserRoles(id: number, body: { role_ids: number[] }): Promise<ManagedUser>;
  disableUser(id: number): Promise<ManagedUser>;
  listRoles(query?: RoleListQuery): Promise<PageResult<RoleItem>>;
  updateUser?(id: number, body: ManagedUserInput): Promise<ManagedUser>;
  resetUserPassword?(id: number): Promise<ManagedUser>;
}

const defaultPageSize = 10;

const defaultForm = {
  username: "",
  display_name: "",
  user_type: "teacher",
  phone: "",
  email: "",
  role_id: ""
};

type UserFormState = typeof defaultForm;

type ModalState =
  | { type: "create" }
  | { type: "detail"; user: ManagedUser }
  | { type: "edit"; user: ManagedUser }
  | null;

export function UserPanel({ api, currentUser }: { api: UserPanelApi; currentUser?: CurrentUser }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [userTypeFilter, setUserTypeFilter] = useState("");
  const [selectedIDs, setSelectedIDs] = useState<FixedActionListRowId[]>([]);
  const [form, setForm] = useState<UserFormState>(defaultForm);
  const [modal, setModal] = useState<ModalState>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; title: string; description: string } | null>(null);
  const didLoadRef = useRef(false);

  const currentPermissions = useMemo(() => getEffectivePermissions(currentUser), [currentUser]);
  const canManageUsers = canAccess(currentPermissions, ["user:manage"]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const canManagePrivilegedUsers = isPrivilegedUserManager(currentUser);
  const userTypeOptions = useMemo(() => getUserTypeOptions(canManagePrivilegedUsers), [canManagePrivilegedUsers]);
  const assignableRoles = useMemo(
    () => roles.filter((role) => canManagePrivilegedUsers || !isPrivilegedRoleCode(role.code)),
    [canManagePrivilegedUsers, roles]
  );
  const roleMap = useMemo(() => new Map(roles.map((role) => [role.id, role.name])), [roles]);
  const columns = useMemo<Array<FixedActionListColumn<ManagedUser>>>(
    () => [
      {
        key: "username",
        title: "用户名",
        render: (user) => user.username
      },
      {
        key: "display_name",
        title: "姓名",
        render: (user) => user.display_name
      },
      {
        key: "user_type",
        title: "用户类型",
        width: 120,
        render: (user) => formatUserType(user.user_type)
      },
      {
        key: "status",
        title: "状态",
        width: 120,
        render: (user) => <span className={statusClassName(user.status)}>{formatStatusLabel(user.status)}</span>
      },
      {
        key: "contact",
        title: "联系方式",
        render: (user) => formatContact(user)
      },
      {
        key: "roles",
        title: "角色",
        render: (user) => formatRoleNames(user.role_ids, roleMap)
      }
    ],
    [roleMap]
  );

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadAll(buildUserQuery("", "", 1, defaultPageSize));
  }, [api]);

  useEffect(() => {
    const allowedTypes = new Set(userTypeOptions.map((option) => option.value));
    if (userTypeFilter && !allowedTypes.has(userTypeFilter)) {
      setUserTypeFilter("");
    }
    if (!allowedTypes.has(form.user_type)) {
      setForm((current) => ({ ...current, user_type: userTypeOptions[0]?.value ?? "teacher" }));
    }
  }, [form.user_type, userTypeFilter, userTypeOptions]);

  async function loadAll(query: ManagedUserListQuery = buildUserQuery(keyword, userTypeFilter, page, pageSize)) {
    setLoading(true);
    setErrorMessage("");
    try {
      const [userResult, roleResult] = await Promise.all([
        api.listUsers(query),
        api.listRoles({ page: 1, page_size: 100 })
      ]);
      setUsers(userResult.items);
      setRoles(roleResult.items);
      setTotal(userResult.total);
      setPage(userResult.page || query.page || 1);
      setPageSize(userResult.page_size || query.page_size || defaultPageSize);
    } catch (error) {
      setUsers([]);
      setTotal(0);
      setPage(query.page || 1);
      setErrorMessage(error instanceof Error ? normalizeErrorMessage(error.message) : "用户数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedIDs([]);
    await loadAll(buildUserQuery(keyword, userTypeFilter, 1, pageSize));
  }

  async function handleReset() {
    setKeyword("");
    setUserTypeFilter("");
    setSelectedIDs([]);
    await loadAll(buildUserQuery("", "", 1, defaultPageSize));
  }

  async function handlePageChange(nextPage: number) {
    setSelectedIDs([]);
    await loadAll(buildUserQuery(keyword, userTypeFilter, nextPage, pageSize));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body = buildUserPayload(form);

    try {
      if (modal?.type === "edit") {
        if (!api.updateUser) {
          setErrorMessage("当前接口暂不支持编辑用户。 ");
          return;
        }
        await api.updateUser(modal.user.id, body);
        setNotice({ tone: "success", title: "用户已保存", description: "用户基础信息已更新。" });
      } else {
        const created = await api.createUser(body);
        setNotice(buildInitialPasswordNotice("用户已创建", created));
      }

      closeModal();
      await loadAll();
    } catch (error) {
      setNotice({ tone: "danger", title: "保存失败", description: error instanceof Error ? error.message : "用户保存失败" });
    }
  }

  async function handleAssignRoles(userID: number, roleID: string) {
    await api.assignUserRoles(userID, {
      role_ids: roleID ? [Number(roleID)] : []
    });
    await loadAll();
  }

  async function handleBatchDelete(rowIds: FixedActionListRowId[]) {
    const ids = rowIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    if (ids.length === 0) {
      return;
    }
    await Promise.all(ids.map((id) => api.disableUser(id)));
    setSelectedIDs([]);
    await loadAll();
  }

  async function handleDeleteOne(user: ManagedUser) {
    await api.disableUser(user.id);
    closeModal();
    await loadAll();
  }

  async function handleResetPassword(user: ManagedUser) {
    if (!api.resetUserPassword) {
      setErrorMessage("当前接口暂不支持重置密码。");
      return;
    }
    try {
      const updated = await api.resetUserPassword(user.id);
      setModal({ type: "detail", user: updated });
      setNotice(buildInitialPasswordNotice("密码已重置", updated));
      await loadAll();
    } catch (error) {
      setNotice({ tone: "danger", title: "重置失败", description: error instanceof Error ? error.message : "密码重置失败" });
    }
  }

  function handleExport() {
    downloadCsv(
      "users.csv",
      [
        { key: "username", title: "用户名" },
        { key: "display_name", title: "姓名" },
        { key: "user_type_label", title: "用户类型" },
        { key: "status_label", title: "状态" },
        { key: "phone", title: "手机号" },
        { key: "email", title: "邮箱" },
        { key: "role_names", title: "角色" }
      ],
      users.map((user) => ({
        ...user,
        user_type_label: formatUserType(user.user_type),
        status_label: formatStatusLabel(user.status),
        phone: user.phone ?? "",
        email: user.email ?? "",
        role_names: formatRoleNames(user.role_ids, roleMap)
      }))
    );
  }

  function openCreateModal() {
    setForm(defaultForm);
    setModal({ type: "create" });
  }

  function openEditModal(user: ManagedUser) {
    setForm({
      username: user.username,
      display_name: user.display_name,
      user_type: user.user_type,
      phone: user.phone ?? "",
      email: user.email ?? "",
      role_id: user.role_ids?.[0] ? String(user.role_ids[0]) : ""
    });
    setModal({ type: "edit", user });
  }

  function closeModal() {
    setModal(null);
    setForm(defaultForm);
  }

  return (
    <section aria-label="用户管理面板" className="ui-admin-page" style={pageStyle}>
      <h2 style={visuallyHiddenStyle}>用户管理</h2>
      {errorMessage ? (
        <ToastNotice tone="danger" title="用户数据加载失败" description={errorMessage} onClose={() => setErrorMessage("")} />
      ) : null}
      {notice ? (
        <ToastNotice
          tone={notice.tone}
          title={notice.title}
          description={notice.description}
          durationMs={notice.tone === "success" && notice.description.includes("一次性密码") ? 0 : 3200}
          onClose={() => setNotice(null)}
        />
      ) : null}

      <section className="ui-admin-card" aria-label="用户数据展示区" style={dataRegionStyle} aria-busy={loading}>
        <form className="ui-admin-filters" style={filterFormStyle} onSubmit={(event) => void handleQuery(event)}>
          <ClearableFilterInput id="user_filter_keyword" label="关键字" placeholder="输入用户名或姓名" value={keyword} onChange={setKeyword} />
          <ClearableFilterSelect
            id="user_type_filter"
            label="用户类型"
            placeholder="请选择用户类型"
            value={userTypeFilter}
            onChange={setUserTypeFilter}
          >
            {userTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </ClearableFilterSelect>
          <div className="ui-admin-actions-bar__group" style={queryActionsStyle}>
            <button type="submit" className="ui-button ui-button--primary" disabled={loading}>
              {loading ? "查询中" : "查询"}
            </button>
            <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleReset()} disabled={loading}>
              重置
            </button>
          </div>
        </form>

        <FixedActionList
          rows={users}
          columns={columns}
          getRowId={(user) => user.id}
          selectedRowIds={selectedIDs}
          onSelectionChange={setSelectedIDs}
          onCreate={openCreateModal}
          onDelete={(rowIds) => void handleBatchDelete(rowIds)}
          onExport={handleExport}
          onDetail={(user) => setModal({ type: "detail", user })}
          onEdit={openEditModal}
          permissions={currentPermissions}
          createRequiredPermissions={["user:manage"]}
          deleteRequiredPermissions={["user:manage"]}
          editRequiredPermissions={["user:manage"]}
          currentPage={page}
          pageCount={pageCount}
          total={total}
          onPageChange={(nextPage) => void handlePageChange(nextPage)}
          minHeight="100%"
          emptyText={loading ? "数据加载中..." : "暂无用户数据"}
          ariaLabel="用户列表"
          createLabel="新增用户"
          deleteLabel="删除"
          exportLabel="导出"
          rowCheckboxLabel={(user) => `选择用户-${user.username}`}
        />
      </section>

      {modal ? (
        <div className="ui-admin-modal-backdrop">
          <section className="ui-admin-modal" aria-label="用户管理弹层">
            {modal.type === "detail" ? (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>用户详情</h3>
                    <p>{modal.user.display_name}</p>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <div className="ui-admin-modal__body">
                  <dl className="ui-admin-meta-list">
                    <div>
                      <dt>用户名</dt>
                      <dd>{modal.user.username}</dd>
                    </div>
                    <div>
                      <dt>姓名</dt>
                      <dd>{modal.user.display_name}</dd>
                    </div>
                    <div>
                      <dt>类型</dt>
                      <dd>{formatUserType(modal.user.user_type)}</dd>
                    </div>
                    <div>
                      <dt>状态</dt>
                      <dd>{formatStatusLabel(modal.user.status)}</dd>
                    </div>
                    <div>
                      <dt>密码状态</dt>
                      <dd>{modal.user.must_change_password ? "待用户修改一次性密码" : "正常"}</dd>
                    </div>
                    <div>
                      <dt>手机号</dt>
                      <dd>{modal.user.phone || "-"}</dd>
                    </div>
                    <div>
                      <dt>邮箱</dt>
                      <dd>{modal.user.email || "-"}</dd>
                    </div>
                    <div>
                      <dt>角色</dt>
                      <dd>{formatRoleNames(modal.user.role_ids, roleMap)}</dd>
                    </div>
                  </dl>
                </div>
                <div className="ui-admin-modal__footer">
                  <div className="ui-admin-actions-bar__group">
                    {canManageUsers ? (
                      <>
                        <button
                          type="button"
                          className="ui-button ui-button--ghost"
                          onClick={() => void handleAssignRoles(modal.user.id, String(modal.user.role_ids?.[0] ?? ""))}
                        >
                          同步角色
                        </button>
                        <button
                          type="button"
                          className="ui-button ui-button--ghost"
                          onClick={() => void handleResetPassword(modal.user)}
                        >
                          重置密码
                        </button>
                        <button type="button" className="ui-button ui-button--ghost" onClick={() => void handleDeleteOne(modal.user)}>
                          删除用户
                        </button>
                        <button type="button" className="ui-button ui-button--primary" onClick={() => openEditModal(modal.user)}>
                          编辑
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="ui-admin-modal__header">
                  <div>
                    <h3>{modal.type === "create" ? "新增用户" : "编辑用户"}</h3>
                  </div>
                  <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                    关闭
                  </button>
                </div>
                <form onSubmit={(event) => void handleSubmit(event)}>
                  <div className="ui-admin-modal__body">
                    <div className="ui-admin-form__grid">
                      <div className="ui-admin-form__field">
                        <label htmlFor="managed_username">用户名</label>
                        <input
                          id="managed_username"
                          value={form.username}
                          onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="managed_display_name">姓名</label>
                        <input
                          id="managed_display_name"
                          value={form.display_name}
                          onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="managed_user_type">用户类型</label>
                        <select
                          id="managed_user_type"
                          value={form.user_type}
                          onChange={(event) => setForm((current) => ({ ...current, user_type: event.target.value }))}
                        >
                          {userTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="managed_phone">手机号</label>
                        <input
                          id="managed_phone"
                          value={form.phone}
                          onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field">
                        <label htmlFor="managed_email">邮箱</label>
                        <input
                          id="managed_email"
                          type="email"
                          value={form.email}
                          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                        />
                      </div>
                      <div className="ui-admin-form__field" style={{ gridColumn: "1 / -1" }}>
                        <label htmlFor="managed_default_role">默认角色</label>
                        <select
                          id="managed_default_role"
                          value={form.role_id}
                          onChange={(event) => setForm((current) => ({ ...current, role_id: event.target.value }))}
                        >
                          <option value="">请选择角色</option>
                          {assignableRoles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="ui-admin-modal__footer">
                    <button type="button" className="ui-button ui-button--ghost" onClick={closeModal}>
                      取消
                    </button>
                    <button type="submit" className="ui-button ui-button--primary">
                      {modal.type === "create" ? "新增用户" : "保存修改"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function buildUserQuery(keyword: string, userType: string, page: number, pageSize: number): ManagedUserListQuery {
  return {
    keyword: keyword.trim() || undefined,
    user_type: userType || undefined,
    page,
    page_size: pageSize
  };
}

function buildUserPayload(form: UserFormState): ManagedUserInput {
  return {
    username: form.username,
    display_name: form.display_name,
    user_type: form.user_type,
    phone: form.phone || undefined,
    email: form.email || undefined,
    role_ids: form.role_id ? [Number(form.role_id)] : []
  };
}

function buildInitialPasswordNotice(title: string, user: ManagedUser): { tone: "success"; title: string; description: string } {
  const password = user.initial_password || "请从后端响应中查看";
  return {
    tone: "success",
    title,
    description: `系统已生成随机一次性密码：${password}。用户首次登录必须修改密码。`
  };
}

function normalizeErrorMessage(message: string): string {
  if (/404|not found/i.test(message)) {
    return "用户列表接口暂不可用，请检查后端 /api/v1/users 服务是否已启动。";
  }
  if (/请求参数错误|invalid/i.test(message)) {
    return "用户请求参数错误，请检查用户名、用户类型、密码或角色。";
  }
  return message || "用户数据加载失败";
}

function formatUserType(userType: string): string {
  switch (userType) {
    case "sys_admin":
      return "平台管理员";
    case "tenant_admin":
      return "租户管理员";
    case "school_admin":
      return "学校/组织管理员";
    case "teacher":
      return "教师";
    case "student":
      return "学生";
    case "staff":
      return "职员";
    default:
      return userType;
  }
}

function getUserTypeOptions(canManagePrivilegedUsers: boolean): Array<{ value: string; label: string }> {
  const baseOptions = [
    { value: "teacher", label: "教师" },
    { value: "student", label: "学生" },
    { value: "staff", label: "职员" }
  ];
  if (!canManagePrivilegedUsers) {
    return baseOptions;
  }
  return [
    { value: "sys_admin", label: "平台管理员" },
    { value: "tenant_admin", label: "租户管理员" },
    { value: "school_admin", label: "学校/组织管理员" },
    ...baseOptions
  ];
}

function isPrivilegedUserManager(user?: CurrentUser): boolean {
  if (!user) {
    return true;
  }
  return user.user_type === "sys_admin" || (user.permissions ?? []).some((permission) => permission === "system:manage" || permission === "tenant:manage");
}

function isPrivilegedRoleCode(roleCode: string): boolean {
  return roleCode === "sys_admin" || roleCode === "school_admin" || roleCode === "tenant_admin";
}

function getEffectivePermissions(user?: CurrentUser): string[] {
  if (!user) {
    return ["system:manage"];
  }
  const permissions = [...(user.permissions ?? [])];
  if (user.user_type === "sys_admin" && !permissions.includes("system:manage")) {
    permissions.push("system:manage");
  }
  return permissions;
}

function formatStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "启用";
    case "disabled":
      return "禁用";
    default:
      return status || "-";
  }
}

function statusClassName(status: string): string {
  if (status === "active") {
    return "ui-admin-status ui-admin-status--active";
  }
  if (status === "disabled") {
    return "ui-admin-status ui-admin-status--disabled";
  }
  return "ui-admin-status ui-admin-status--draft";
}

function formatContact(user: ManagedUser): string {
  const contacts = [user.phone, user.email].filter(Boolean);
  return contacts.length > 0 ? contacts.join(" / ") : "-";
}

function formatRoleNames(roleIDs: number[] | undefined, roleMap: Map<number, string>): string {
  if (!roleIDs || roleIDs.length === 0) {
    return "-";
  }
  return roleIDs.map((id) => roleMap.get(id) ?? `角色-${id}`).join("、");
}

const pageStyle: CSSProperties = {
  minHeight: "100%",
  gap: 0
};

const visuallyHiddenStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0
};

const dataRegionStyle: CSSProperties = {
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  gap: 14,
  minHeight: "100%",
  padding: 22
};

const filterFormStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(240px, 360px) minmax(220px, 300px) auto",
  alignItems: "end",
  gap: 14,
  margin: 0
};

const queryActionsStyle: CSSProperties = {
  alignItems: "center",
  paddingBottom: 1,
  whiteSpace: "nowrap"
};
